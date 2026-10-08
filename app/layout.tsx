import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
});

export const metadata: Metadata = {
  title: "Agenda Pro Music",
  description: "Sistema de agendamento de aulas de música",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${outfit.variable} h-full antialiased font-sans dark`}
    >
      <body className="min-h-full flex flex-col font-sans bg-[#09090b] text-gray-100 selection:bg-amber-500/30 selection:text-amber-200">
        {/* Fundo "Studio Foam" / Radial Glow.
            Perf: antes eram discos de 600px com blur(150px) + mix-blend-screen
            animados com `pulse-ring` — que anima box-shadow, propriedade de
            PINTURA. Resultado: o navegador re-rasterizava dois blurs enormes a
            cada frame, em todas as páginas, o tempo todo (e ainda invalidava o
            backdrop de qualquer elemento translúcido por cima).
            Agora o brilho é um radial-gradient (mesmo perfil de um disco
            desfocado, sem filtro) e só `transform` anima — rodando no compositor
            (GPU), sem repintura. Caixa de 1200px = disco de 600px + o halo do blur. */}
        <div className="fixed inset-0 z-[-2] bg-[#09090b] overflow-hidden">
           <div className="absolute top-[-10%] right-[-10%] w-[600px] h-[600px] pointer-events-none">
             <div className="absolute -inset-[300px] animate-glow-breathe" style={{ animationDuration: '8s', background: 'radial-gradient(circle closest-side, rgba(245,158,11,0.0865) 0%, rgba(245,158,11,0.08) 25%, rgba(245,158,11,0.043) 50%, rgba(245,158,11,0.013) 75%, rgba(245,158,11,0) 100%)' }} />
           </div>
           <div className="absolute bottom-[-10%] left-[-10%] w-[600px] h-[600px] pointer-events-none">
             <div className="absolute -inset-[300px] animate-glow-breathe" style={{ animationDuration: '12s', background: 'radial-gradient(circle closest-side, rgba(217,119,6,0.043) 0%, rgba(217,119,6,0.04) 25%, rgba(217,119,6,0.0215) 50%, rgba(217,119,6,0.0065) 75%, rgba(217,119,6,0) 100%)' }} />
           </div>
        </div>

        {/* Textura de Filme/Analógico (Granulado) */}
        <div className="bg-noise" />
        
        {children}
      </body>
    </html>
  );
}
