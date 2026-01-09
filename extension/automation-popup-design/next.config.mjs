/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",

  // Para extensão: evita o otimizador do Next (que exige server)
  images: { unoptimized: true },

  // Importante: faz o export gerar paths que funcionam dentro do chrome-extension://
  assetPrefix: "./",

  // Ajuda a ter rotas exportadas como pastas com index.html
  trailingSlash: true,

  // Eu NÃO recomendo ignorar erros de TS em extensão (mas mantive porque você colocou)
  typescript: { ignoreBuildErrors: true },
};

export default nextConfig;
