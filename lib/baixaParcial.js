import { prisma } from "@/lib/prisma";
import { valorParcelaAtual, horaLimiteEfetiva } from "@/lib/finance";
import { atualizarScoreDoContato } from "@/lib/atualizarScoreComportamental";
import { registrarAuditoria } from "@/lib/auditoria";
import { criarTarefaConferirPagamento } from "@/lib/tarefaConferirPagamento";

// Baixa PARCIAL (item 93): cliente pagou parte da parcela hoje, o resto continua
// em aberto. Cada chamada soma ao Parcela.valorPago e gera um lançamento de
// entrada só do PEDAÇO recebido agora — quando a soma bate o valor devido, a
// parcela vira uma baixa completa normal (mesmo caminho de sempre).
// Usada pela rota /api/parcelas/[id]/baixa-parcial (usuário logado) e pela leitura
// automática de comprovante (usuarioNome "IA", origem "Comprovante lido pela IA").
// Devolve { erro, status } em caso de erro; senão o mesmo corpo que a rota respondia.
// semJuros: quem pagou pelo menos o valor da parcela SEM multa/juros quita a parcela (não cobra o resto).
export async function aplicarBaixaParcial({ id, valor, formaPagamento, usuarioNome, origem, semJuros, cobrarDif }) {
  const v = Number(valor);
  if (!v || v <= 0) return { erro: "Informe um valor válido.", status: 400 };

  const parcela = await prisma.parcela.findUnique({ where: { id }, include: { contact: { select: { id: true, name: true, tipoCliente: true, horarioRecebimento: true } } } });
  if (!parcela) return { erro: "Parcela não encontrada.", status: 404 };
  if (parcela.paid) return { erro: "Essa parcela já está totalmente paga.", status: 400 };

  const user = usuarioNome ? { name: usuarioNome } : null;
  const sufixo = origem ? ` — ${origem}` : "";
  const cfg = await prisma.config.findUnique({ where: { id: "singleton" } });
  let devido = valorParcelaAtual(parcela, undefined, { multaPct: cfg?.multaPct, horaLimite: horaLimiteEfetiva(parcela.contact, cfg) });
  const devidoCheio = devido;
  if (semJuros && v + (parcela.valorPago || 0) >= parcela.amount - 0.01) devido = Math.min(devido, parcela.amount);
  // Juros/multa que ficou de fora porque quitou pelo valor sem juros (a IA cobra o cliente; se ele pagar, a baixa é reajustada).
  const difJuros = Math.round((devidoCheio - devido) * 100) / 100;

  // Ler o valorPago e depois gravar em dois passos separados perdia baixas
  // simultâneas: dois recebimentos ao mesmo tempo liam o mesmo saldo e o
  // segundo sobrescrevia o primeiro — o caixa registrava os dois, mas a
  // parcela creditava só um, e o cliente continuava "devendo" o que pagou.
  // Ler + calcular + gravar tudo dentro da transação serializa isso.
  const { aplicado, novoValorPago, completaAgora, atualizada } = await prisma.$transaction(async (tx) => {
    const atual = await tx.parcela.findUnique({ where: { id }, select: { valorPago: true, baixadoPor: true, formaPagamento: true } });
    // Só entra NESTA parcela o que ela ainda devia; o que passar disso é
    // adiantamento e vai pras próximas (item 162). Sem esse teto, a parcela
    // registrava o pagamento inteiro E o excedente virava lançamento de novo
    // nas seguintes — o caixa contava o mesmo dinheiro duas vezes.
    const falta = Math.round((devido - atual.valorPago) * 100) / 100;
    const aplicado = Math.min(v, Math.max(0, falta));
    const novoValorPago = Math.round((atual.valorPago + aplicado) * 100) / 100;
    const completaAgora = novoValorPago >= devido - 0.01; // tolerância de centavo

    const data = completaAgora
      ? {
          valorPago: novoValorPago,
          valorPagoEm: new Date(),
          paid: true,
          paidAt: new Date(),
          amountPago: novoValorPago,
          baixadoPor: atual.baixadoPor || user?.name || null,
          formaPagamento: formaPagamento || atual.formaPagamento || null,
        }
      : { valorPago: novoValorPago, valorPagoEm: new Date(), baixadoPor: atual.baixadoPor || user?.name || null };

    const atualizada = await tx.parcela.update({ where: { id }, data });

    if (aplicado > 0) {
      await tx.lancamento.create({
        data: {
          type: "entrada",
          amount: aplicado,
          description: `Baixa parcial — parcela ${parcela.number}ª — ${parcela.contact?.name || ""}`.trim() + sufixo + (difJuros > 0.01 && cobrarDif !== false ? ` [difjuros:${difJuros.toFixed(2)}]` : ""),
          contactId: parcela.contactId,
          parcelaId: parcela.id,
          bancoId: cfg?.contaRecebimentoId || null,
        },
      });
    }

    return { aplicado, novoValorPago, completaAgora, atualizada };
  }, { timeout: 15000 });

  if (formaPagamento === "dinheiro" && aplicado > 0) {
    await prisma.especieMovimento.create({
      data: { usuario: user?.name || "— sem responsável —", tipo: "recebido", valor: aplicado, parcelaId: id },
    }).catch(() => {});
  }

  if (completaAgora) {
    await prisma.task.updateMany({ where: { parcelaId: id }, data: { done: true } });
    await atualizarScoreDoContato(parcela.contactId).catch(() => {});
    await criarTarefaConferirPagamento(parcela.contactId, { parcelaId: id, valor: aplicado, forma: formaPagamento }).catch(() => {});
    // Baixa do dia dada: tira o lead da lista do chat (arquiva); volta sozinho se o cliente escrever.
    await prisma.contact.updateMany({ where: { id: parcela.contactId, chatArquivado: false }, data: { chatArquivado: true, chatVoltaEm: null } }).catch(() => {});
  }

  registrarAuditoria({
    usuario: user?.name,
    acao: "baixa_parcial",
    entidade: "Parcela",
    entidadeId: id,
    detalhe: `${parcela.contact?.name || ""} — parcela ${parcela.number}ª recebeu R$ ${aplicado} (${completaAgora ? "completou a parcela" : `total parcial R$ ${novoValorPago} de R$ ${devido.toFixed(2)}`})`,
  });

  // Item 162: sobrou dinheiro além do que essa parcela devia — em vez de
  // virar troco solto, quita (total ou parcialmente) as PRÓXIMAS parcelas em
  // aberto do mesmo ciclo, na ordem de vencimento.
  let excedente = Math.round((v - aplicado) * 100) / 100;
  const quitadasAdiantado = [];
  if (excedente > 0.01) {
    const proximas = await prisma.parcela.findMany({
      where: { contactId: parcela.contactId, ciclo: parcela.ciclo, paid: false, renegociada: false, id: { not: id } },
      orderBy: [{ number: "asc" }],
    });
    for (const prox of proximas) {
      if (excedente <= 0.01) break;
      let devidoProx = valorParcelaAtual(prox, undefined, { multaPct: cfg?.multaPct, horaLimite: horaLimiteEfetiva(parcela.contact, cfg) });
      if (semJuros && excedente + (prox.valorPago || 0) >= prox.amount - 0.01) devidoProx = Math.min(devidoProx, prox.amount);
      const faltaProx = Math.round((devidoProx - prox.valorPago) * 100) / 100;
      // Arredonda em centavo: subtrair floats gera resto binário e o valor ia
      // pro banco como 59.40000000000001 — aparece assim em relatório e CSV.
      const aplicar = Math.round(Math.min(excedente, faltaProx) * 100) / 100;
      if (aplicar <= 0) continue;
      const novoValorPagoProx = Math.round((prox.valorPago + aplicar) * 100) / 100;
      const completaProx = novoValorPagoProx >= devidoProx - 0.01;

      await prisma.parcela.update({
        where: { id: prox.id },
        data: completaProx
          ? { valorPago: novoValorPagoProx, valorPagoEm: new Date(), paid: true, paidAt: new Date(), amountPago: novoValorPagoProx, baixadoPor: prox.baixadoPor || user?.name || null, formaPagamento: formaPagamento || prox.formaPagamento || null }
          : { valorPago: novoValorPagoProx, valorPagoEm: new Date(), baixadoPor: prox.baixadoPor || user?.name || null },
      });
      await prisma.lancamento.create({
        data: {
          type: "entrada",
          amount: aplicar,
          description: `Pagamento adiantado — parcela ${prox.number}ª — ${parcela.contact?.name || ""}`.trim() + sufixo,
          contactId: parcela.contactId,
          parcelaId: prox.id,
          bancoId: cfg?.contaRecebimentoId || null,
        },
      });
      if (completaProx) {
        await prisma.task.updateMany({ where: { parcelaId: prox.id }, data: { done: true } });
        await criarTarefaConferirPagamento(parcela.contactId, { parcelaId: prox.id, valor: aplicar, forma: formaPagamento }).catch(() => {});
      }
      registrarAuditoria({
        usuario: user?.name,
        acao: "baixa_parcial",
        entidade: "Parcela",
        entidadeId: prox.id,
        detalhe: `${parcela.contact?.name || ""} — parcela ${prox.number}ª recebeu R$ ${aplicar} adiantado (sobra do pagamento da ${parcela.number}ª)`,
      });
      quitadasAdiantado.push({ id: prox.id, number: prox.number, valor: aplicar, completou: completaProx });
      excedente = Math.round((excedente - aplicar) * 100) / 100;
    }
    if (quitadasAdiantado.some((q) => q.completou)) {
      await atualizarScoreDoContato(parcela.contactId).catch(() => {});
    }
  }

  // Se ainda sobrou depois de cobrir todas as parcelas em aberto, esse dinheiro
  // está fisicamente com o cobrador mas não pertence a nenhuma parcela. Fica
  // registrado na auditoria pra não sumir de vista — a tela também avisa.
  if (excedente > 0.01) {
    registrarAuditoria({
      usuario: user?.name,
      acao: "baixa_parcial",
      entidade: "Parcela",
      entidadeId: id,
      detalhe: `${parcela.contact?.name || ""} — sobrou R$ ${excedente} sem parcela em aberto pra aplicar (não virou lançamento; decida se devolve ou lança à parte)`,
    });
  }

  return {
    parcela: atualizada,
    completou: completaAgora,
    faltam: completaAgora ? 0 : Math.round((devido - novoValorPago) * 100) / 100,
    quitadasAdiantado,
    diferencaJuros: completaAgora && cobrarDif !== false && difJuros > 0.01 ? difJuros : 0,
    sobrouSemAplicar: excedente > 0.01 ? excedente : 0,
  };
}
