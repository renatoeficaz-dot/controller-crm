/** @type {import('next').NextConfig} */
const nextConfig = {
  // pdfkit lê seus arquivos de fonte (.afm) do disco via __dirname em tempo de
  // execução — se o Next empacota o módulo (webpack), __dirname vira um caminho
  // virtual (ex.: "/ROOT") e a leitura quebra com ENOENT. Marcando como externo,
  // o Node faz um require() nativo do node_modules, preservando o caminho real.
  serverExternalPackages: ["pdfkit"],
  experimental: {
    // O middleware roda em todas as rotas (protege login), e por padrão o Next.js
    // só deixa passar até 10MB de corpo de requisição por ele — acima disso o
    // upload de anexos (zip, documentos, áudio gravado) falhava silenciosamente.
    proxyClientMaxBodySize: "50mb",
  },
  // Arquivos escritos em public/uploads DEPOIS do build (anexos recebidos em
  // produção) não são servidos pelo static file serving padrão do Next em
  // produção — só os que existiam no momento do build. Reescreve pra uma rota
  // de API que lê do disco em tempo real, mantendo o mesmo caminho /uploads/...
  // já salvo no banco.
  async rewrites() {
    return [{ source: "/uploads/:path*", destination: "/api/uploads/:path*" }];
  },

  // Não havia NENHUM cabeçalho de segurança. Cada um aqui fecha um buraco
  // concreto neste sistema — não é checklist genérico:
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Clickjacking: sem isso dá pra embutir o CRM num iframe invisível
          // sobre um site isca e fazer o operador logado clicar em "Excluir"
          // ou "Dar baixa" achando que clicou noutra coisa.
          { key: "X-Frame-Options", value: "DENY" },
          // O navegador adivinhava o tipo do arquivo pelo conteúdo. Como
          // qualquer um sobe anexo (o cliente manda no WhatsApp), um arquivo
          // com conteúdo de HTML podia ser servido e executado como página.
          { key: "X-Content-Type-Options", value: "nosniff" },
          // A URL do anexo (/uploads/UUID) é o que protege o documento do
          // cliente. Sem essa política ela ia inteira no cabeçalho Referer
          // pra qualquer site externo que o operador abrisse a partir do CRM.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Força HTTPS nas próximas visitas (evita downgrade pra HTTP).
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          // Microfone fica liberado só pra origem (a gravação de áudio do chat
          // usa); câmera, geolocalização e pagamento ficam desligados.
          { key: "Permissions-Policy", value: "camera=(), geolocation=(), payment=(), microphone=(self)" },
        ],
      },
    ];
  },
};

export default nextConfig;
