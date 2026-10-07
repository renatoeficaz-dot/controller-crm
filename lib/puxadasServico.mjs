import { consultarCpfDataApi, limparCpf } from "./dataApiCliente.mjs";
import { validarCPF } from "./cpf.js";

// Dependências explícitas permitem testar concorrência e falhas sem consultar clientes reais.
export function criarServicoPuxadas({ prisma, auditar, consultar = consultarCpfDataApi }) {
  async function consultarContato(contactId, { repetir = false, usuario = null } = {}) {
    const cfg = await prisma.config.findUnique({ where: { id: "singleton" }, select: { dataApiKey: true, dataApiAtivo: true, dataApiErro: true } });
    if (!cfg?.dataApiAtivo || !cfg?.dataApiKey) return { erro: "Ative a DataAPI e cadastre a chave em Configurações → IA.", http: 409 };
    if (cfg.dataApiErro) return { erro: cfg.dataApiErro, http: 409 };
    const contato = await prisma.contact.findUnique({ where: { id: contactId }, select: { cpf: true, excluidoEm: true } });
    if (!contato || contato.excluidoEm) return { erro: "Contato não encontrado.", http: 404 };
    const cpf = limparCpf(contato.cpf);
    if (!validarCPF(cpf)) return { erro: "Salve um CPF válido na ficha para consultar.", http: 400 };
    const where = { contactId_cpf: { contactId, cpf } };
    let reserva;
    try {
      reserva = await prisma.consultaDataApi.create({ data: { contactId, cpf } });
    } catch (erro) {
      if (erro.code !== "P2002") throw erro;
      reserva = await prisma.consultaDataApi.findUnique({ where });
      if (!reserva) return { erro: "Consulta não encontrada. Recarregue a ficha.", http: 409 };
      // Uma consulta interrompida pode ter consumido crédito. Nunca a repete sozinha.
      if (reserva.status === "consultando" && Date.now() - new Date(reserva.atualizadoEm).getTime() > 120000) {
        await prisma.consultaDataApi.updateMany({ where: { id: reserva.id, status: "consultando", atualizadoEm: reserva.atualizadoEm }, data: { status: "erro", erro: "Consulta interrompida. Confira o painel antes de tentar novamente." } });
        return { registro: await prisma.consultaDataApi.findUnique({ where }) };
      }
      if (!repetir || reserva.status !== "erro") return { registro: reserva };
      if (Date.now() - new Date(reserva.atualizadoEm).getTime() < 60000) return { erro: "Aguarde um minuto antes de tentar novamente.", http: 429 };
      const ganhou = await prisma.consultaDataApi.updateMany({ where: { id: reserva.id, status: "erro", atualizadoEm: reserva.atualizadoEm }, data: { status: "consultando", erro: null, dados: null, tentativas: { increment: 1 } } });
      if (!ganhou.count) return { registro: await prisma.consultaDataApi.findUnique({ where }) };
    }
    // Reconfere a ficha antes de enviar: o CPF pode ter sido corrigido enquanto reservava.
    const atual = await prisma.contact.findUnique({ where: { id: contactId }, select: { cpf: true, excluidoEm: true } });
    const resultado = !atual || atual.excluidoEm || limparCpf(atual.cpf) !== cpf
      ? { status: "erro", erro: "O CPF da ficha mudou antes da consulta." }
      : await consultar(cpf, cfg.dataApiKey);
    const registro = await prisma.consultaDataApi.update({ where: { id: reserva.id }, data: { status: resultado.status, dados: resultado.dados ? JSON.stringify(resultado.dados) : null, erro: resultado.erro || null } });
    if (resultado.suspender) await prisma.config.updateMany({ where: { id: "singleton", dataApiKey: cfg.dataApiKey }, data: { dataApiErro: resultado.erro } });
    await auditar({ usuario, acao: "consulta_dataapi", entidade: "Contact", entidadeId: contactId, detalhe: `Consulta CPF na DataAPI: ${resultado.status}` });
    return { registro, consultou: true, suspensa: !!resultado.suspender };
  }
  return { consultarContato };
}
