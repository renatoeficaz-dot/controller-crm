import { NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";

// Rotas públicas (não exigem login).
// /api/webhook precisa ficar aberto para a Evolution entregar mensagens.
// /l/ é o link público de rastreamento (redireciona pro WhatsApp) e /f/ é o
// formulário de pré-cadastro que ele pode abrir — os dois são o lead
// preenchendo, não um usuário do CRM. Precisa da barra no fim pra não bater
// com "/lancamentos" (que É protegida).
const PUBLIC_PREFIXES = ["/api/auth/login", "/api/auth/logout", "/api/webhook", "/login", "/l/", "/f/", "/api/formulario"];

// Rate limit genérico por IP em toda /api/*: nenhuma rota (fora o login, que já
// tem o próprio limite) tinha teto nenhum — um script com token de sessão
// roubado (ou um bug de loop no front) conseguia martelar a API sem limite.
// Em memória (zera a cada deploy/restart), sem tabela nova nem custo extra;
// suficiente pra segurar abuso, não pra bloquear uso normal da equipe.
const JANELA_MS = 60_000;
const LIMITE_POR_JANELA = 400;
const contadorPorIp = new Map();
function acimaDoLimite(ip) {
  const agora = Date.now();
  const entrada = contadorPorIp.get(ip);
  if (!entrada || agora - entrada.inicio > JANELA_MS) {
    contadorPorIp.set(ip, { inicio: agora, contagem: 1 });
    return false;
  }
  entrada.contagem += 1;
  return entrada.contagem > LIMITE_POR_JANELA;
}
// Evita crescer pra sempre num processo de longa duração.
setInterval(() => {
  const agora = Date.now();
  for (const [ip, entrada] of contadorPorIp) {
    if (agora - entrada.inicio > JANELA_MS) contadorPorIp.delete(ip);
  }
}, 5 * 60_000);

// IP real do cliente, pro rate limit não ser contornável.
//
// Pegar `x-forwarded-for.split(",")[0]` (o PRIMEIRO da cadeia) parece certo mas
// é o contrário: o proxy ACRESCENTA o IP que ele viu no FIM da lista, então o
// primeiro item é justamente o pedaço que o cliente mandou e pode inventar.
// Bastava variar esse cabeçalho a cada requisição pra nunca bater no teto —
// tanto o de 400/min da API quanto o de tentativas de login por IP.
// O último item é o que o nosso proxy escreveu, esse não dá pra forjar.
export function ipDoCliente(req) {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const partes = xff.split(",").map((p) => p.trim()).filter(Boolean);
    if (partes.length) return partes[partes.length - 1];
  }
  return req.headers.get("x-real-ip") || "desconhecido";
}

// Permissão de verdade, lida do banco — com cache curto pra não virar uma
// consulta por requisição. 30s é o atraso máximo entre tirar a permissão de
// alguém e isso valer na prática; em troca, um usuário ativo gera no máximo
// 2 consultas por minuto (índice de chave primária, custo desprezível).
const CACHE_MS = 30_000;
const cachePermissoes = new Map();

async function permissoesAtuais(uid) {
  const agora = Date.now();
  const guardado = cachePermissoes.get(uid);
  if (guardado && agora - guardado.em < CACHE_MS) return guardado.valor;

  let valor = null;
  try {
    const { prisma } = await import("@/lib/prisma");
    const u = await prisma.user.findUnique({
      where: { id: uid },
      select: { role: true, somenteLeitura: true, paginasVisiveis: true },
    });
    valor = u ? { role: u.role, somenteLeitura: !!u.somenteLeitura, paginas: u.paginasVisiveis || null } : null;
  } catch {
    // Banco fora do ar não pode derrubar o sistema inteiro: mantém o que o
    // token diz (é o comportamento antigo) em vez de bloquear todo mundo.
    return guardado?.valor ?? undefined;
  }
  cachePermissoes.set(uid, { em: agora, valor });
  return valor;
}

// Limpeza do cache, pra memória não crescer sem fim.
setInterval(() => {
  const agora = Date.now();
  for (const [uid, v] of cachePermissoes) if (agora - v.em > CACHE_MS * 4) cachePermissoes.delete(uid);
}, 5 * 60_000);

export async function middleware(req) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/api/") && !pathname.startsWith("/api/webhook")) {
    const ip = ipDoCliente(req);
    if (acimaDoLimite(ip)) {
      return NextResponse.json({ error: "Muitas requisições. Tente novamente em instantes." }, { status: 429 });
    }
  }

  if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/") || pathname.startsWith(p))) {
    // se já está logado e tenta abrir /login, manda pra home
    if (pathname === "/login") {
      const token = req.cookies.get(SESSION_COOKIE)?.value;
      if (token && (await verifySession(token))) return NextResponse.redirect(new URL("/", req.url));
    }
    return NextResponse.next();
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  let session = token ? await verifySession(token) : null;

  // O token guarda role/somenteLeitura/paginas de quando a pessoa entrou, e
  // vale 30 dias. Sem reconferir no banco, mexer na permissão não surtia
  // efeito nenhum em quem já estava logado: rebaixar um admin, marcar alguém
  // como somente leitura ou até EXCLUIR o usuário deixava o acesso de pé até
  // o token vencer. Na prática, demitir não tirava o acesso à carteira.
  if (session?.uid) {
    // null = usuário não existe mais. undefined = não deu pra conferir (banco
    // fora do ar) — nesse caso segue com o que o token diz, senão uma falha de
    // banco desloga a empresa inteira.
    const atual = await permissoesAtuais(session.uid);
    if (atual === null) {
      // usuário não existe mais: derruba a sessão
      const resposta = pathname.startsWith("/api/")
        ? NextResponse.json({ error: "Sessão inválida." }, { status: 401 })
        : NextResponse.redirect(new URL("/login", req.url));
      resposta.cookies.delete(SESSION_COOKIE);
      return resposta;
    }
    if (atual) session = { ...session, ...atual };
  }

  if (session) {
    // Páginas exclusivas de administrador
    const adminPages = ["/configuracoes", "/lancamentos"];
    const isAdminPage = adminPages.some((p) => pathname === p || pathname.startsWith(p + "/"));
    if (isAdminPage && session.role !== "admin") {
      return NextResponse.redirect(new URL("/", req.url));
    }
    // Modo somente leitura (item 146): vê tudo, mas o servidor recusa
    // qualquer escrita — mesmo que a tela tente mandar por engano.
    if (session.somenteLeitura && pathname.startsWith("/api/") && req.method !== "GET") {
      return NextResponse.json({ error: "Seu usuário é somente leitura." }, { status: 403 });
    }

    // Bloquear a PÁGINA /configuracoes não bastava: a API por trás dela ficava
    // aberta, e um vendedor que soubesse a URL conseguia se promover a admin
    // (PATCH /api/users/[id]) ou mudar os honorários (PATCH /api/config).
    // A trava fica aqui, num lugar só, pra não depender de cada rota lembrar
    // de checar — esquecer uma já foi o suficiente pra abrir o buraco.
    // GET continua liberado: as telas comuns precisam ler usuários (seletor de
    // responsável), config (multa) e números.
    const apisSoAdmin = [
      "/api/users", "/api/config", "/api/numbers", "/api/equipes",
      "/api/metas-dia-semana", "/api/comissao", "/api/ia", "/api/lancamentos",
      "/api/motivos-perda", "/api/campos-personalizados", "/api/task-types",
      "/api/tags", "/api/templates", "/api/regras-cobranca", "/api/campanhas",
      "/api/backup", "/api/alertas", "/api/stages", "/api/usuarios",
      "/api/solicitacoes-desconto", "/api/automacao", "/api/links-uteis",
      // "/api/campanhas" NÃO cobre "/api/campanhas-massa" (o casamento exige
      // igualdade ou prefixo + "/"), então o disparo em massa ficava aberto:
      // qualquer usuário logado criava uma campanha e mandava mensagem pra
      // base inteira — conta de WhatsApp banida e custo de envio.
      "/api/campanhas-massa",
      // Dispara na hora a régua de cobrança (a mesma do job de 5 em 5 min).
      // Aberto, virava um botão de spam pra carteira toda.
      "/api/lembretes/run",
    ];
    const ehApiSoAdmin = apisSoAdmin.some((p) => pathname === p || pathname.startsWith(p + "/"));
    if (ehApiSoAdmin && req.method !== "GET" && session.role !== "admin") {
      return NextResponse.json({ error: "Só o administrador pode alterar isso." }, { status: 403 });
    }

    // Dado financeiro da empresa não pode ser nem LIDO por quem não é admin.
    // A página /lancamentos já era bloqueada, mas a API por trás respondia
    // normalmente: um vendedor que soubesse a URL via todo o caixa, o fluxo,
    // as contas a pagar e o ranking de todo mundo.
    const apisFinanceiras = [
      "/api/lancamentos", "/api/fluxo-caixa", "/api/contas-pagar",
      "/api/ranking", "/api/relatorios",
    ];
    const ehFinanceira = apisFinanceiras.some((p) => pathname === p || pathname.startsWith(p + "/"));
    if (ehFinanceira && session.role !== "admin") {
      return NextResponse.json({ error: "Só o administrador acessa dados financeiros." }, { status: 403 });
    }

    // Restrição por página (Configurações → Usuários) valia só no menu: a API
    // da página escondida continuava respondendo. Agora a mesma lista trava a
    // API correspondente. Admin nunca é restrito.
    if (session.role !== "admin" && session.paginas) {
      const permitidas = session.paginas.split(",").filter(Boolean);
      const apiDaPagina = {
        "/api/metas": "metas", "/api/cobranca": "cobranca", "/api/tasks": "tarefas",
        "/api/chat": "chat", "/api/relatorios": "relatorios",
      };
      for (const [prefixo, pagina] of Object.entries(apiDaPagina)) {
        if ((pathname === prefixo || pathname.startsWith(prefixo + "/")) && !permitidas.includes(pagina)) {
          return NextResponse.json({ error: "Sem acesso a essa área." }, { status: 403 });
        }
      }
    }

    return NextResponse.next();
  }

  // Não autenticado
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  const url = new URL("/login", req.url);
  return NextResponse.redirect(url);
}

// Aplica a todas as rotas, exceto assets estáticos do Next e arquivos com extensão.
//
// /uploads entra EXPLÍCITO na lista: a exclusão por extensão logo abaixo
// (png|jpg|jpeg|...) fazia o middleware nem rodar pros anexos, e os documentos
// dos clientes (RG, CNH, selfie segurando documento, comprovante de
// residência) ficavam acessíveis por QUALQUER pessoa deslogada que tivesse a
// URL. O PDF da puxada já pedia login — só a imagem não, porque a extensão
// dela estava na lista de exclusão. Agora os dois pedem sessão.
export const config = {
  // Runtime Node (não Edge): sem isso o middleware não consegue consultar o
  // banco, e é justamente essa consulta que faz tirar permissão de alguém
  // surtir efeito de verdade (ver permissoesAtuais acima).
  runtime: "nodejs",
  matcher: [
    "/uploads/:path*",
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|gif|webp|ico)$).*)",
  ],
};
