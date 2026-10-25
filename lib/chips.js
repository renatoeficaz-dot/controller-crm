import { texto, nomeMuitoLongo } from "@/lib/corpo";

// Campos editáveis de um chip, já validados. `parcial` = PATCH (só o que veio no corpo).
export function dadosChip(body, parcial) {
  const data = {};
  const tem = (k) => !parcial || k in body;
  if (tem("numero")) {
    const numero = texto(body.numero);
    if (!numero) return { erro: "Número obrigatório." };
    if (nomeMuitoLongo(numero)) return { erro: "Número muito longo." };
    data.numero = numero;
  }
  for (const k of ["apelido", "operadora", "aparelho", "observacao"]) {
    if (tem(k)) data[k] = texto(body[k]).slice(0, 300) || null;
  }
  if (tem("ultimaRecargaEm")) {
    const d = body.ultimaRecargaEm ? new Date(`${String(body.ultimaRecargaEm).slice(0, 10)}T12:00:00`) : null;
    if (d && isNaN(d.getTime())) return { erro: "Data inválida." };
    data.ultimaRecargaEm = d;
  }
  if (tem("ultimaRecargaValor")) {
    const v = body.ultimaRecargaValor === "" || body.ultimaRecargaValor == null ? null : Number(body.ultimaRecargaValor);
    if (v !== null && (!isFinite(v) || v < 0)) return { erro: "Valor inválido." };
    data.ultimaRecargaValor = v;
  }
  if (tem("roteador")) data.roteador = !!body.roteador;
  return { data };
}
