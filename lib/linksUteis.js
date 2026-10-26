import { texto, nomeMuitoLongo } from "@/lib/corpo";

// Campos editáveis de um link útil, já validados. `parcial` = PATCH (só o que veio no corpo).
// login e senha só entram quando quem grava é admin.
export function dadosLink(body, admin, parcial) {
  const data = {};
  const tem = (k) => !parcial || k in body;
  if (tem("titulo")) {
    const titulo = texto(body.titulo);
    if (!titulo) return { erro: "Informe o título." };
    if (nomeMuitoLongo(titulo)) return { erro: "Título muito longo." };
    data.titulo = titulo;
  }
  if (tem("url")) {
    let url = texto(body.url);
    if (!url) return { erro: "Informe o link." };
    if (url.length > 2000) return { erro: "Link muito longo." };
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;
    data.url = url;
  }
  if (tem("observacao")) data.observacao = texto(body.observacao).slice(0, 2000) || null;
  if (admin) {
    if (tem("login")) data.login = texto(body.login).slice(0, 300) || null;
    // senha: não passa por texto() pra não cortar espaços que façam parte dela
    if (tem("senha")) data.senha = typeof body.senha === "string" && body.senha ? body.senha.slice(0, 300) : null;
  }
  return { data };
}
