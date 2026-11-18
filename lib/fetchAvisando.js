// Chamada à API que AVISA quando falha. Antes as telas de Configuração faziam `await fetch(...)` e seguiam em frente: sem conexão, sem
// permissão ou com valor recusado pelo servidor, a tela mostrava "Salvo" (ou tirava o item da lista) e nada tinha mudado.
// Devolve a resposta quando deu certo e null quando falhou (já com o aviso na tela).
export async function fetchAvisando(url, opts, oQue = "salvar") {
  const res = await fetch(url, opts).catch(() => null);
  if (!res || !res.ok) {
    const d = res ? await res.json().catch(() => ({})) : {};
    alert(d?.error || (res ? `Não foi possível ${oQue}.` : `Sem conexão com o servidor: não foi possível ${oQue}.`));
    return null;
  }
  return res;
}
