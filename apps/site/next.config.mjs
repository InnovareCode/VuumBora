/** @type {import('next').NextConfig} */
const nextConfig = {
  // Exportação estática: publica em qualquer hospedagem, sem servidor Node.
  output: 'export',
  // Sem servidor rodando no destino final, a API de otimização de imagem do
  // Next não está disponível — serve os arquivos originais como estão.
  images: { unoptimized: true },
  // @vuumbora/tokens expõe TS fonte direto (sem passo de build próprio, ver
  // packages/tokens/package.json) — o Next precisa transpilar esse pacote.
  transpilePackages: ['@vuumbora/tokens'],
  // Gera index.html por pasta (ex.: out/sobre/index.html) — compatível com a
  // maioria dos hosts estáticos que servem diretórios literais.
  trailingSlash: true,
  reactStrictMode: true,
};

export default nextConfig;
