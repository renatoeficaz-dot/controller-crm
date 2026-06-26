import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";

// Usuário logado (para o front montar a navegação conforme o nível).
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json(null, { status: 401 });
  return NextResponse.json(user);
}
