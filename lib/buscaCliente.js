// Busca de cliente da conciliação: casa as palavras digitadas com o NOME, o telefone e as MENSAGENS da conversa (sem acento, sem maiúscula),
// e ordena do mais provável para o menos. Função pura, testada em tests/conciliacao.test.mjs.
export const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
export const palavrasDaBusca = (q) => [...new Set(norm(q).split(/[^a-z0-9]+/).filter((w) => w.length >= 2))].slice(0, 6);

// contatos: [{ id, name, phone, etapa }]   mensagens: [{ contactId, body, createdAt }] (mais recentes primeiro)
// Devolve até `max` resultados { id, name, phone, etapa, completo, noNome, naConversa, trecho }.
// completo = todas as palavras apareceram (no nome, no telefone ou na conversa); sem isso o resultado é parcial e vai para o fim.
export function rankearClientes(tokens, contatos, mensagens, max = 12) {
  if (!tokens.length) return [];
  const porContato = new Map();
  for (const m of mensagens) {
    const t = norm(m.body);
    if (!t) continue;
    const achou = tokens.filter((w) => t.includes(w));
    if (!achou.length) continue;
    const g = porContato.get(m.contactId) || { palavras: new Set(), melhor: null, melhorN: 0 };
    achou.forEach((w) => g.palavras.add(w));
    if (achou.length > g.melhorN) { g.melhorN = achou.length; g.melhor = { body: m.body, t, w: achou[0] }; }
    porContato.set(m.contactId, g);
  }
  const trecho = (g) => {
    if (!g?.melhor) return null;
    const i = Math.max(0, g.melhor.t.indexOf(g.melhor.w));
    // norm() preserva o tamanho do texto, então o índice vale para o original.
    const ini = Math.max(0, i - 40);
    return (ini > 0 ? "…" : "") + String(g.melhor.body).slice(ini, i + 70).replace(/\s+/g, " ").trim() + (i + 70 < g.melhor.body.length ? "…" : "");
  };
  const fone = (c) => String(c.phone || "").replace(/\D/g, "");
  const saida = [];
  for (const c of contatos) {
    const nome = norm(c.name), f = fone(c), g = porContato.get(c.id);
    const noNome = tokens.filter((w) => nome.includes(w));
    const noFone = tokens.filter((w) => /^\d{4,}$/.test(w) && f.includes(w));
    const todas = new Set([...noNome, ...noFone, ...(g ? g.palavras : [])]);
    if (!todas.size) continue;
    saida.push({
      id: c.id, name: c.name, phone: c.phone, etapa: c.etapa,
      completo: todas.size === tokens.length,
      noNome: noNome.length, naConversa: g ? g.palavras.size : 0,
      trecho: g && (noNome.length < tokens.length) ? trecho(g) : null,
      _nota: (todas.size === tokens.length ? 1000 : 0) + noNome.length * 100 + todas.size * 10 + (g ? 1 : 0),
    });
  }
  return saida.sort((a, b) => b._nota - a._nota || a.name.localeCompare(b.name)).slice(0, max).map(({ _nota, ...r }) => r);
}
