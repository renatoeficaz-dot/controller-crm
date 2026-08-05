import { prisma } from "@/lib/prisma";
import { ondePodeReceberAutomatico } from "@/lib/envioAutomatico";

// Monta a cláusula Prisma a partir do filtro salvo na campanha — um recorte
// simples e explícito (não é o filtro completo de Contatos, é o que faz
// sentido pra escolher público de uma campanha).
export function whereDoFiltro(filtros) {
  const f = filtros || {};
  // Campanha em massa também respeita "não perturbar" — quem pediu pra não
  // ser incomodado não pode voltar a receber por outro caminho.
  const where = { ...ondePodeReceberAutomatico(), phone: { not: null } };
  // "ids" é uma lista congelada de contatos (ex.: quem passava no filtro do
  // Kanban no momento em que a campanha foi criada) — usada em vez de
  // reconstruir o filtro, já que a tela de origem pode ter campos diferentes.
  if (f.ids?.length) { where.id = { in: f.ids }; return where; }
  if (f.stageIds?.length) where.stageId = { in: f.stageIds };
  if (f.estado) where.estado = f.estado;
  if (f.genero) where.genero = f.genero;
  if (f.tipoCliente) where.tipoCliente = f.tipoCliente;
  if (f.responsavel) where.responsavel = f.responsavel;
  if (f.tagIds?.length) where.tags = { some: { id: { in: f.tagIds } } };
  return where;
}

export async function contarAlvos(filtros) {
  return prisma.contact.count({ where: whereDoFiltro(filtros) });
}

// Processa UM lote de uma campanha "enviando" por checagem (instrumentation.js
// chama isso a cada 5 min) — nunca manda tudo de uma vez, pro espaçamento
// entre mensagens (5-15s) não travar o processo por minutos a fio.
const LOTE = 12;

export async function processarCampanhasMassa() {
  const { sendWhatsappText, sendWhatsappMedia, sendWhatsappAudio } = await import("@/lib/evolution");
  const { readMediaAsBase64 } = await import("@/lib/mediaStorage");
  const { interpolarVariaveis } = await import("@/lib/variaveis");
  const { atingiuLimiteHora } = await import("@/lib/aquecimento");

  const campanhas = await prisma.campanhaMassa.findMany({ where: { status: "enviando" } });
  let totalEnviado = 0;

  for (const camp of campanhas) {
    const [numero, template] = await Promise.all([
      prisma.whatsappNumber.findUnique({ where: { id: camp.numeroId } }),
      camp.templateId ? prisma.messageTemplate.findUnique({ where: { id: camp.templateId } }) : null,
    ]);
    if (!numero) {
      await prisma.campanhaMassa.update({ where: { id: camp.id }, data: { status: "cancelada" } });
      continue;
    }
    // Item 175: campanha em massa é o maior risco de rajada — respeita o
    // mesmo teto por hora do número, só que aqui pula o lote inteiro (o
    // próximo ciclo de 5 min tenta de novo).
    if (await atingiuLimiteHora(numero)) continue;

    const filtros = JSON.parse(camp.filtros || "{}");
    // A lista de ids é congelada quando a campanha começa a enviar. O ponteiro
    // (enviados + falhas) anda sobre ESSA lista fixa, por índice — antes era um
    // `skip` numa consulta refeita a cada lote, que escorregava sempre que
    // alguém entrava ou saía do filtro no meio do envio (lead mudando de etapa,
    // por exemplo), pulando uns e mandando pros outros duas vezes.
    const idsCongelados = filtros.ids || [];
    const jaProcessados = camp.enviados + camp.falhas;
    const fatia = idsCongelados.slice(jaProcessados, jaProcessados + LOTE);

    if (!fatia.length) {
      await prisma.campanhaMassa.update({ where: { id: camp.id }, data: { status: "concluida", concluidoEm: new Date() } });
      continue;
    }

    // Quem ainda pode receber AGORA (pediu "não perturbar" ou foi excluído no
    // meio da campanha sai daqui). Os que sumirem contam como falha, pro
    // ponteiro andar assim mesmo e ninguém ficar preso.
    const encontrados = await prisma.contact.findMany({
      where: { id: { in: fatia }, ...ondePodeReceberAutomatico(), phone: { not: null } },
    });
    const porId = new Map(encontrados.map((c) => [c.id, c]));
    const alvos = fatia.map((id) => porId.get(id) || null);

    let enviouAlgum = false;
    for (const contact of alvos) {
      if (!contact) {
        await prisma.campanhaMassa.update({ where: { id: camp.id }, data: { falhas: { increment: 1 } } });
        continue;
      }
      if (enviouAlgum) await new Promise((r) => setTimeout(r, 5000 + Math.random() * 10000));
      enviouAlgum = true;

      const texto = interpolarVariaveis(template?.body || camp.mensagem || "", contact);
      let result;
      try {
        if (template?.mediaType === "audio" && template.mediaUrl) {
          result = await sendWhatsappAudio(contact.phone, await readMediaAsBase64(template.mediaUrl), numero.instance);
        } else if ((template?.mediaType === "image" || template?.mediaType === "document") && template.mediaUrl) {
          result = await sendWhatsappMedia(
            contact.phone,
            {
              base64: await readMediaAsBase64(template.mediaUrl),
              mimetype: template.mediaMimetype,
              fileName: template.mediaFileName,
              caption: texto,
              mediatype: template.mediaType,
            },
            numero.instance
          );
        } else {
          result = await sendWhatsappText(contact.phone, texto, numero.instance);
        }
      } catch (e) {
        result = { ok: false, error: e.message };
      }

      await prisma.message.create({
        data: {
          contactId: contact.id,
          body: texto,
          kind: template?.mediaType && template.mediaType !== "text" ? template.mediaType : "text",
          fromMe: true,
          status: result?.simulated ? "simulado" : result?.ok ? "enviado" : "erro",
          instance: numero.instance,
        },
      });

      await prisma.campanhaMassa.update({
        where: { id: camp.id },
        data: result?.ok || result?.simulated ? { enviados: { increment: 1 } } : { falhas: { increment: 1 } },
      });
      totalEnviado++;
    }
  }
  return totalEnviado;
}
