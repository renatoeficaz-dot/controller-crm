import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { chaveHasos, hasosFetch, listaDeInstancias } from "@/lib/hasos";

// Números (dispositivos) da conta Hasos e se estão conectados. Sem chave configurada: { configurado: false } e o Chat cai no Wavoip/wa.me.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!(await chaveHasos())) return NextResponse.json({ configurado: false, instancias: [] });
  const r = await hasosFetch("/v1/instances");
  if (!r.ok) return NextResponse.json({ configurado: true, erro: r.erro, instancias: [] });
  return NextResponse.json({ configurado: true, instancias: listaDeInstancias(r.data) });
}
