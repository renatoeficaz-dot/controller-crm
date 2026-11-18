import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getSession } from "@/lib/session";
import { registrarAuditoria } from "@/lib/auditoria";
import { lerCorpo, ehNaoEncontrado, respostaNaoEncontrado, texto } from "@/lib/corpo";

// Edita um usuário (nome, login e/ou senha). Senha só muda se for enviada.
// Lista de ids vinda do corpo: qualquer coisa que não seja lista de texto (número, objeto) derrubava a rota no .join/.map com 500.
const listaIds = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string" && x) : []);
export async function PATCH(req, { params }) {
  try {
    const { id } = await params;
    const body = await lerCorpo(req);
    const data = {};
  
    if ("name" in body) {
      const name = texto(body.name);
      if (!name) return NextResponse.json({ error: "Nome não pode ficar vazio." }, { status: 400 });
      // Nome repetido mistura leads, tarefas e comissão das duas pessoas (tudo é ligado pelo nome).
      const outro = await prisma.user.findFirst({ where: { name, NOT: { id } }, select: { id: true } });
      if (outro) return NextResponse.json({ error: "Já existe outro usuário com esse nome." }, { status: 409 });
      data.name = name;
    }
  
    if ("login" in body) {
      const login = texto(body.login);
      if (!login) return NextResponse.json({ error: "Login não pode ficar vazio." }, { status: 400 });
      const other = await prisma.user.findUnique({ where: { login } });
      if (other && other.id !== id) {
        return NextResponse.json({ error: "Já existe um usuário com esse login." }, { status: 409 });
      }
      data.login = login;
    }
  
    // Só troca a senha se vier preenchida
    if (body.password) {
      // A CRIAÇÃO de usuário já exigia 6 caracteres, mas a TROCA não validava
      // nada: dava pra trocar uma senha boa por uma de 1 caractere e o sistema
      // aceitava calado. A regra tem que ser a mesma nos dois caminhos.
      if (String(body.password).length < 6) {
        return NextResponse.json({ error: "A senha precisa ter pelo menos 6 caracteres." }, { status: 400 });
      }
      data.passwordHash = await bcrypt.hash(body.password, 10);
      // Senha nova derruba todas as sessões abertas dessa conta (quem tinha a senha antiga, ou o cookie dela, sai na hora).
      data.sessoesValidasDesde = new Date();
    }
  
    const ROLES = ["admin", "vendedor", "cobrador"];
    if ("role" in body && ROLES.includes(body.role)) data.role = body.role;
    if ("verTodosLeads" in body) data.verTodosLeads = !!body.verTodosLeads;
    if ("paginasVisiveis" in body) data.paginasVisiveis = listaIds(body.paginasVisiveis).join(",") || null;
    // Admin sempre vê tudo (não faz sentido restringir)
    if (data.role === "admin") {
      data.verTodosLeads = true;
      data.paginasVisiveis = null;
    }
    if ("permissoesExtras" in body) data.permissoesExtras = listaIds(body.permissoesExtras).join(",") || null;
    if ("somenteLeitura" in body) data.somenteLeitura = !!body.somenteLeitura;
    // Suspensão por tempo: data/hora ISO até quando o acesso fica bloqueado; vazio/null reativa na hora.
    if ("suspensoAte" in body) {
      if (body.suspensoAte) {
        const ate = new Date(body.suspensoAte);
        if (isNaN(ate.getTime()) || ate.getTime() <= Date.now()) return NextResponse.json({ error: "Data de suspensão inválida." }, { status: 400 });
        if ((await getSession())?.uid === id) return NextResponse.json({ error: "Você não pode suspender a si mesmo." }, { status: 400 });
        data.suspensoAte = ate;
      } else {
        data.suspensoAte = null;
      }
    }
    if ("equipeId" in body) {
      if (body.equipeId && !(await prisma.equipe.findUnique({ where: { id: String(body.equipeId) }, select: { id: true } }))) {
        return NextResponse.json({ error: "Equipe não encontrada." }, { status: 400 });
      }
      data.equipeId = body.equipeId ? String(body.equipeId) : null;
    }
    // Só ids que existem (coluna ou número apagado no "set" derrubava a gravação com 500).
    if ("kanbansVisiveis" in body) {
      data.kanbansVisiveis = { set: await prisma.stage.findMany({ where: { id: { in: listaIds(body.kanbansVisiveis) } }, select: { id: true } }) };
    }
    if ("numerosVisiveis" in body) {
      data.numerosVisiveis = { set: await prisma.whatsappNumber.findMany({ where: { id: { in: listaIds(body.numerosVisiveis) } }, select: { id: true } }) };
    }
    if ("numerosLigacao" in body) {
      data.numerosLigacao = { set: await prisma.whatsappNumber.findMany({ where: { id: { in: listaIds(body.numerosLigacao) } }, select: { id: true } }) };
    }
    // Tirar o último administrador deixava o sistema sem ninguém que pudesse mexer em configuração, usuários e permissões.
    if ("role" in data && data.role !== "admin") {
      const eraAdmin = await prisma.user.findUnique({ where: { id }, select: { role: true } });
      if (eraAdmin?.role === "admin" && (await prisma.user.count({ where: { role: "admin" } })) <= 1) {
        return NextResponse.json({ error: "Esse é o único administrador: promova outra pessoa antes de mudar o nível dele." }, { status: 409 });
      }
    }
  
    // Meta individual: vazio = null = usa a meta global (não é meta de zero).
    // Sem teto, um valor fora da faixa de 32 bits (Int no schema) não dava erro
    // amigável — corrompia a LINHA DESSE USUÁRIO: toda leitura/escrita dele
    // (login incluído, se o campo entrar na sessão) passava a quebrar com 500,
    // mesmo bug já visto e corrigido em /api/config.
    const metaOuNull = (v) => {
      if (v === "" || v == null) return null;
      const n = Math.round(Number(v));
      return Number.isFinite(n) ? Math.min(1000000, Math.max(0, n)) || null : null;
    };
    for (const campo of ["metaVendasMinimaPropria", "metaVendasMediaPropria", "metaVendasDiaPropria"]) {
      if (campo in body) data[campo] = metaOuNull(body[campo]);
    }
  
    const antes = await prisma.user.findUnique({
      where: { id },
      select: { name: true, role: true, verTodosLeads: true, paginasVisiveis: true },
    });
  
    const user = await prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        name: true,
        login: true,
        role: true,
        verTodosLeads: true,
        paginasVisiveis: true,
        suspensoAte: true,
        kanbansVisiveis: { select: { id: true } },
        numerosVisiveis: { select: { id: true } },
        numerosLigacao: { select: { id: true } },
        metaVendasMinimaPropria: true,
        metaVendasMediaPropria: true,
        metaVendasDiaPropria: true,
        createdAt: true,
      },
    });
  
    // Auditoria só quando permissão/nível mudou de fato — trocar o nome do
    // usuário não é evento de segurança e só faria ruído no log.
    const mudouPermissao =
      (antes && "role" in data && antes.role !== user.role) ||
      ("verTodosLeads" in data && antes?.verTodosLeads !== user.verTodosLeads) ||
      ("paginasVisiveis" in data && antes?.paginasVisiveis !== user.paginasVisiveis) ||
      "kanbansVisiveis" in data ||
      "numerosVisiveis" in data ||
      "numerosLigacao" in data;
    if (mudouPermissao) {
      const session = await getSession();
      registrarAuditoria({
        usuario: session?.name,
        acao: "alterar_permissao",
        entidade: "User",
        entidadeId: id,
        detalhe: `${user.name}: nível ${user.role}, vê todos os leads: ${user.verTodosLeads ? "sim" : "não"}`,
      });
    }
    // Renomeou: os leads e as tarefas que estavam com o nome antigo continuam com ele (antes sumiam da carteira da pessoa).
    if (antes?.name && "name" in data && antes.name !== user.name) {
      await prisma.contact.updateMany({ where: { responsavel: antes.name }, data: { responsavel: user.name } }).catch(() => {});
      await prisma.task.updateMany({ where: { responsavel: antes.name }, data: { responsavel: user.name } }).catch(() => {});
      const session = await getSession();
      registrarAuditoria({ usuario: session?.name, acao: "renomear_usuario", entidade: "User", entidadeId: id, detalhe: `${antes.name} → ${user.name} (leads e tarefas acompanharam)` });
    }
    if (body.password) {
      const session = await getSession();
      registrarAuditoria({
        usuario: session?.name,
        acao: "trocar_senha",
        entidade: "User",
        entidadeId: id,
        detalhe: `Senha de ${user.name} foi alterada`,
      });
    }
  
    return NextResponse.json(user);
  } catch (err) {
    // Registro do `where` não existe (link velho, dois cliques, id
    // chutado): é "não achei", não erro de servidor.
    if (ehNaoEncontrado(err)) return respostaNaoEncontrado();
    throw err;
  }
}

// Remove um usuário
export async function DELETE(_req, { params }) {
  try {
    const { id } = await params;
    const [session, alvo] = await Promise.all([
      getSession(),
      prisma.user.findUnique({ where: { id }, select: { name: true, role: true } }),
    ]);
    // Excluir a si mesmo (sessão some no meio) ou o último administrador trancava o sistema.
    if (session?.uid === id) return NextResponse.json({ error: "Você não pode excluir o seu próprio usuário." }, { status: 400 });
    if (alvo?.role === "admin" && (await prisma.user.count({ where: { role: "admin" } })) <= 1) {
      return NextResponse.json({ error: "Esse é o único administrador: promova outra pessoa antes de excluí-lo." }, { status: 409 });
    }
    await prisma.user.delete({ where: { id } });
    registrarAuditoria({
      usuario: session?.name,
      acao: "excluir_usuario",
      entidade: "User",
      entidadeId: id,
      detalhe: alvo ? `${alvo.name} (${alvo.role})` : null,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    // Registro do `where` não existe (link velho, dois cliques, id
    // chutado): é "não achei", não erro de servidor.
    if (ehNaoEncontrado(err)) return respostaNaoEncontrado();
    throw err;
  }
}
