import ChatView from "@/components/ChatView";
import { getCurrentUser, podeAcessarPagina } from "@/lib/session";

export default async function ChatPage() {
  const user = await getCurrentUser();
  if (!podeAcessarPagina(user, "chat")) {
    return <div className="p-6 text-sm text-slate-500">Você não tem acesso a esta página.</div>;
  }
  return <ChatView />;
}
