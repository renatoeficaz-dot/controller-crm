// Rola só o contêiner de mensagens até o fim. scrollIntoView também rola os ancestrais com overflow:hidden
// (a página inteira), o que no celular empurrava o cabeçalho do chat para fora da tela e cortava a caixa de texto.
export function rolarAteOFim(el, suave = false) {
  if (!el) return;
  let pai = el.parentElement;
  while (pai && !/(auto|scroll)/.test(getComputedStyle(pai).overflowY)) pai = pai.parentElement;
  if (!pai) return;
  pai.scrollTo({ top: pai.scrollHeight, behavior: suave ? "smooth" : "auto" });
}
