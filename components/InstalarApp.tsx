"use client";

import { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";

// Registra o service worker e, para quem ainda não instalou o app, mostra como instalar:
// no Android oferece o botão de instalar; no iPhone ensina o passo a passo (a Apple não deixa o site instalar sozinho).
const CHAVE = "instalar-app-dispensado-em";
const DIAS_SEM_INSISTIR = 30;

type EventoInstalar = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const jaInstalado = () =>
  window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

export default function InstalarApp() {
  const [evento, setEvento] = useState<EventoInstalar | null>(null);
  const [ios, setIos] = useState(false);
  const [mostrar, setMostrar] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
    if (jaInstalado()) return;
    try {
      const quando = Number(localStorage.getItem(CHAVE) || 0);
      if (quando && Date.now() - quando < DIAS_SEM_INSISTIR * 86_400_000) return;
    } catch {}

    const ehIos = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (ehIos) { setIos(true); setMostrar(true); return; }

    const antes = (e: Event) => { e.preventDefault(); setEvento(e as EventoInstalar); setMostrar(true); };
    const instalado = () => setMostrar(false);
    window.addEventListener("beforeinstallprompt", antes);
    window.addEventListener("appinstalled", instalado);
    return () => { window.removeEventListener("beforeinstallprompt", antes); window.removeEventListener("appinstalled", instalado); };
  }, []);

  const dispensar = () => {
    setMostrar(false);
    try { localStorage.setItem(CHAVE, String(Date.now())); } catch {}
  };

  const instalar = async () => {
    if (!evento) return;
    await evento.prompt();
    await evento.userChoice.catch(() => {});
    setEvento(null);
    setMostrar(false);
  };

  if (!mostrar) return null;

  return (
    <div role="region" aria-label="Instalar o app" className="mb-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 flex items-start gap-3">
      <div className="mt-0.5 text-amber-400 shrink-0">{ios ? <Share className="w-5 h-5" /> : <Download className="w-5 h-5" />}</div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-white">Instale o app no seu celular</p>
        {ios ? (
          <p className="text-xs text-gray-300 mt-1 leading-relaxed">
            No Safari, toque em <strong>Compartilhar</strong> (o quadrado com a seta para cima) e depois em <strong>Adicionar à Tela de Início</strong>. O ícone do Agenda Pro vai aparecer junto com seus outros apps.
          </p>
        ) : (
          <>
            <p className="text-xs text-gray-300 mt-1 leading-relaxed">Abra suas aulas com um toque, direto da tela inicial, sem digitar o endereço.</p>
            <button onClick={instalar} className="mt-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-gray-900 text-xs font-black uppercase tracking-widest">Instalar app</button>
          </>
        )}
      </div>
      <button onClick={dispensar} aria-label="Dispensar" className="p-1 text-gray-400 hover:text-white shrink-0"><X className="w-4 h-4" /></button>
    </div>
  );
}
