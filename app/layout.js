import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import TopNav from "@/components/TopNav";
import SideNav from "@/components/SideNav";
import ConnectionStatusBanner from "@/components/ConnectionStatusBanner";
import DeepInfraBalanceBanner from "@/components/DeepInfraBalanceBanner";
import UsoAtivoTracker from "@/components/UsoAtivoTracker";
import TaskReminderWatcher from "@/components/TaskReminderWatcher";
import ChatInternoWatcher from "@/components/ChatInternoWatcher";
import ChamadaWatcher from "@/components/ChamadaWatcher";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// O nome que aparece na aba do navegador, no histórico e embaixo do ícone na
// tela de início — combinando com o ícone de calculadora, o sistema não se
// anuncia como CRM pra quem olha a tela de lado.
// appleWebApp.title é o que o iOS usa no atalho: sem ele o iPhone cairia no
// `title` inteiro e cortaria no meio.
export const metadata = {
  title: "Calculadora",
  description: "Calculadora",
  appleWebApp: { title: "Calculadora", capable: true },
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-dvh antialiased`}
      suppressHydrationWarning
    >
      {/* Aplica o tema salvo ANTES da primeira pintura — se isso rodasse só no
          React, a tela piscaria branca a cada carregamento no modo escuro. */}
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('crm-tema')||'claro';var d=t==='escuro'||(t==='sistema'&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(d)document.documentElement.classList.add('dark');}catch(e){}})();`,
          }}
        />
      </head>
      {/* h-dvh (não h-full/100vh): no mobile, quando o teclado abre pra digitar
          no chat, a altura "dinâmica" da viewport encolhe de verdade — com
          100vh/100% fixo, o teclado cobria o fim da conversa e a caixa de
          texto sem dar pra rolar até lá. */}
      <body className="h-dvh flex flex-col overflow-hidden">
        <TopNav />
        <div className="flex-1 flex min-h-0 overflow-hidden">
          <SideNav />
          <main className="flex-1 flex flex-col min-h-0 overflow-hidden">{children}</main>
        </div>
        <ConnectionStatusBanner />
        <DeepInfraBalanceBanner />
        <UsoAtivoTracker />
        <TaskReminderWatcher />
        <ChatInternoWatcher />
        <ChamadaWatcher />
      </body>
    </html>
  );
}
