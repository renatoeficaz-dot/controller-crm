import ChatInternoView from "@/components/ChatInternoView";
import { getCurrentUser, podeAcessarPagina } from "@/lib/session";

export default async function ChatInternoPage() {
  const user = await getCurrentUser();
  if (!podeAcessarPagina(user, "chat-interno")) {
    return <div className="p-6 text-sm text-slate-500">Você não tem acesso a esta página.</div>;
  }
  return <ChatInternoView />;
}
