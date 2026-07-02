/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // O middleware roda em todas as rotas (protege login), e por padrão o Next.js
    // só deixa passar até 10MB de corpo de requisição por ele — acima disso o
    // upload de anexos (zip, documentos, áudio gravado) falhava silenciosamente.
    proxyClientMaxBodySize: "50mb",
  },
};

export default nextConfig;
