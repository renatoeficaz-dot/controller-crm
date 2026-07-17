import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import TopNav from "@/components/TopNav";
import SideNav from "@/components/SideNav";
import ConnectionStatusBanner from "@/components/ConnectionStatusBanner";
import DeepInfraBalanceBanner from "@/components/DeepInfraBalanceBanner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "Controller CRM — Kanban + WhatsApp",
  description: "CRM de contatos com Kanban e atendimento por WhatsApp (Evolution API)",
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="h-full flex flex-col overflow-hidden">
        <TopNav />
        <div className="flex-1 flex min-h-0 overflow-hidden">
          <SideNav />
          <main className="flex-1 flex flex-col min-h-0 overflow-hidden">{children}</main>
        </div>
        <ConnectionStatusBanner />
        <DeepInfraBalanceBanner />
      </body>
    </html>
  );
}
