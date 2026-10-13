import type { NextConfig } from "next";

// Cabeçalhos de segurança. Sem CSP de propósito (Firebase/EmailJS/Supabase exigiriam lista longa e frágil).
// microphone=(self): o gravador de áudio das tarefas precisa dele.
const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'microphone=(self), camera=(), geolocation=(), payment=()' },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }];
  },
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