import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // lucide-react exporta centenas de ícones de um índice só; sem isto, o
  // bundler resolve o pacote inteiro antes de descartar o que não é usado.
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'firebasestorage.googleapis.com',
      },
      {
        protocol: 'https',
        hostname: 'bangas-85bd5.firebasestorage.app',
      },
      ],
  },
};

export default nextConfig;