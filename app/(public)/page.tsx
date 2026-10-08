import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#050507] text-gray-100 flex flex-col selection:bg-amber-500/30 overflow-x-hidden font-sans relative">
      {/* Noise background from globals.css */}
      <div className="bg-noise" />

      {/* Navbar */}
      <nav className="sticky top-0 z-50 backdrop-blur-md bg-[#050507]/80 border-b border-gray-800/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 sm:gap-3 group cursor-pointer min-w-0">
             <div className="relative w-10 h-10 sm:w-12 sm:h-12 overflow-hidden rounded-2xl shrink-0">
               <div className="absolute inset-0 bg-indigo-500/20 blur-lg group-hover:bg-amber-500/30 transition-colors" />
               <Image
                 src="/Logo.png"
                 alt="Logo"
                 fill
                 sizes="48px"
                 className="object-cover relative z-10 scale-110"
               />
             </div>
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-lg sm:text-2xl font-black tracking-tighter text-white italic uppercase leading-none">
                  AGENDA PRO
                </span>
                <span className="text-lg sm:text-2xl font-black tracking-tighter text-amber-500 italic uppercase leading-none">
                  MUSIC
                </span>
              </div>
              <span className="text-[10px] font-bold tracking-[0.4em] text-indigo-400 uppercase ml-0.5 opacity-80 mt-1 hidden lg:inline">
                GESTÃO PARA MÚSICOS
              </span>
          </div>

          <div className="flex items-center gap-2 sm:gap-4 shrink-0">
            {/* Abaixo de 640px mostramos apenas o Login: a própria tela de login
                oferece o link para criar conta. */}
            <Link
              href="/login"
              className="px-5 py-3 bg-amber-500 hover:bg-amber-400 text-gray-900 text-[11px] font-black rounded-2xl transition-all active:scale-95 shadow-xl shadow-amber-500/20 uppercase tracking-widest whitespace-nowrap sm:hidden"
            >
              Login
            </Link>
            <Link
              href="/login"
              className="px-5 py-2.5 text-[11px] font-bold text-gray-400 hover:text-white transition-colors uppercase tracking-widest hidden sm:block"
            >
              Login
            </Link>
            <Link
              href="/cadastro"
              className="hidden sm:block px-8 py-3 bg-amber-500 hover:bg-amber-400 text-gray-900 text-xs font-black rounded-2xl transition-all hover:scale-105 active:scale-95 shadow-xl shadow-amber-500/20 uppercase tracking-widest whitespace-nowrap"
            >
              Cadastre-se
            </Link>
          </div>
        </div>
      </nav>

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative pt-16 sm:pt-24 pb-24 sm:pb-32 overflow-hidden">
          {/* Subtle Musical Floating Elements */}
          <div className="absolute top-32 left-[12%] opacity-20 animate-ambient-note select-none text-amber-500 text-5xl pointer-events-none">♪</div>
          <div className="absolute top-64 right-[10%] opacity-15 animate-ambient-note [animation-delay:3s] select-none text-indigo-400 text-4xl pointer-events-none">♫</div>
          <div className="absolute bottom-40 left-[18%] opacity-10 animate-ambient-note [animation-delay:5s] select-none text-gray-500 text-6xl pointer-events-none">♩</div>
          <div className="absolute bottom-64 right-[25%] opacity-10 animate-ambient-note [animation-delay:2s] select-none text-purple-500 text-3xl pointer-events-none">♬</div>

          <div className="absolute inset-0 z-0">
             <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[1000px] bg-indigo-500/5 rounded-full blur-[120px] animate-pulse" />
             <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-amber-500/5 rounded-full blur-[100px] animate-pulse" style={{ animationDelay: '2s' }} />
          </div>

          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
            <div className="text-center">
               <h1 className="block text-4xl sm:text-7xl lg:text-9xl font-black mb-8 sm:mb-12 animate-pop-in italic uppercase leading-none py-6 sm:py-10 px-2 sm:px-4 tracking-normal text-center w-full">
                  <span className="inline-block px-2 sm:px-10 pb-2 sm:pb-4">&nbsp;O Som da sua</span> <br />
                  <span className="inline-block text-transparent bg-clip-text bg-gradient-to-r from-amber-500 via-amber-400 to-amber-600 drop-shadow-[0_0_15px_rgba(245,158,11,0.4)] py-3 sm:py-6 px-4 sm:px-16">Organização</span>
               </h1>
               
               <p className="max-w-xl mx-auto text-base sm:text-xl text-gray-400 mb-14 animate-pop-in [animation-delay:200ms] opacity-0 [animation-fill-mode:forwards] font-medium leading-relaxed">
                  Gestão de alunos, aulas e finanças em uma interface <br className="hidden md:block" />
                  estúdio de alta fidelidade.
               </p>

               <div className="flex flex-col sm:flex-row items-center justify-center gap-6 animate-pop-in [animation-delay:400ms] opacity-0 [animation-fill-mode:forwards]">
                  <Link 
                    href="/cadastro" 
                    className="group w-full sm:w-auto px-12 py-5 bg-amber-500 hover:bg-amber-400 text-gray-900 font-black rounded-2xl transition-all shadow-2xl shadow-amber-500/30 flex items-center justify-center gap-3 text-sm tracking-widest uppercase active:scale-95"
                  >
                    Criar Conta
                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </Link>
               </div>

               <p className="mt-8 text-xs sm:text-sm text-gray-500 font-medium animate-pop-in [animation-delay:500ms] opacity-0 [animation-fill-mode:forwards]">
                  Já tem uma conta?{" "}
                  <Link
                    href="/login"
                    className="text-amber-500 hover:text-amber-400 font-black uppercase tracking-widest underline underline-offset-4 decoration-amber-500/40 hover:decoration-amber-400 transition-colors"
                  >
                    Entrar
                  </Link>
               </p>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="py-20 border-t border-gray-800/50 bg-[#09090b]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <div className="flex items-center justify-center gap-3 mb-8 opacity-50 grayscale hover:grayscale-0 transition-all cursor-crosshair">
               <Image src="/Logo.png" alt="Footer Logo" width={30} height={30} />
               <span className="text-xl font-black text-amber-500 italic tracking-tighter">AGENDA PRO MUSIC</span>
            </div>
            <p className="text-[10px] text-gray-600 font-bold uppercase tracking-[0.4em]">© 2026 Agenda Pro Music todos direitos reservados</p>
        </div>
      </footer>
    </div>
  );
}
