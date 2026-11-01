import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { hasosFetch, listaDeInstancias, instanciasDoUsuario } from "@/lib/hasos";
import { lerCorpo } from "@/lib/corpo";

// Emite o token do discador de um número da conta (POST /v1/instances/:id/tokens). Só aceita ids que pertencem à conta.
export async function POST(req) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const body = await lerCorpo(req);
  const instanceId = String(body.instanceId || "").trim();
  if (!instanceId) return NextResponse.json({ error: "Escolha o número." }, { status: 400 });
  const lista = await hasosFetch("/v1/instances");
  if (!lista.ok) return NextResponse.json({ error: lista.erro }, { status: 502 });
  const permitidas = await instanciasDoUsuario(user, listaDeInstancias(lista.data));
  if (!permitidas.some((x) => x.id === instanceId)) return NextResponse.json({ error: "Você não tem permissão para ligar por este número." }, { status: 403 });
  const r = await hasosFetch(`/v1/instances/${encodeURIComponent(instanceId)}/tokens`, { method: "POST" });
  if (!r.ok) return NextResponse.json({ error: r.erro }, { status: 502 });
  const token = r.data?.token || r.data?.accessToken || r.data?.data?.token || (typeof r.data === "string" ? r.data : null);
  if (!token) return NextResponse.json({ error: "A Hasos não devolveu o token do discador." }, { status: 502 });
  return NextResponse.json({ token });
}
