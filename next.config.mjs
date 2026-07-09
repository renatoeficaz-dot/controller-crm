/** @type {import('next').NextConfig} */
const nextConfig = {
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
};

export default nextConfig;
