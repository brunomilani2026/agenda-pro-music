"use client";

import { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";
import { salvarAssinatura } from "@/app/(aluno)/push-actions";

// Convite para receber avisos de aula e pagamento no celular (Web Push).
// No iPhone só funciona depois de instalar o app (Adicionar à Tela de Início) — por isso o convite só aparece nesse caso.
const CHAVE = "ativar-avisos-dispensado-em";
const DIAS_SEM_INSISTIR = 14;

const chavePublica = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

function paraUint8(base64: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const bruto = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(bruto.length));
  for (let i = 0; i < bruto.length; i++) out[i] = bruto.charCodeAt(i);
  return out;
}

const instalado = () =>
  window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

export default function AtivarAvisos() {
  const [mostrar, setMostrar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    if (!chavePublica || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return;
    const ehIos = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (ehIos && !instalado()) return; // iPhone: só depois de instalar
    if (Notification.permission === "denied") return;

    (async () => {
      const reg = await navigator.serviceWorker.ready.catch(() => null);
      if (!reg) return;
      const sub = await reg.pushManager.getSubscription();
      if (Notification.permission === "granted" && sub) {
        // Já ativo neste aparelho: só renova o cadastro no servidor, sem incomodar.
        salvarAssinatura(sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } }).catch(() => {});
        return;
      }
      try {
        const quando = Number(localStorage.getItem(CHAVE) || 0);
        if (quando && Date.now() - quando < DIAS_SEM_INSISTIR * 86_400_000) return;
      } catch {}
      setMostrar(true);
    })();
  }, []);

  const dispensar = () => {
    setMostrar(false);
    try { localStorage.setItem(CHAVE, String(Date.now())); } catch {}
  };

  const ativar = async () => {
    setErro(null);
    setOcupado(true);
    try {
      const permissao = await Notification.requestPermission();
      if (permissao !== "granted") { setErro("Sem a permissão do celular não dá para enviar avisos. Você pode liberar depois nas configurações do aparelho."); return; }
      const reg = await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: paraUint8(chavePublica!) }));
      const r = await salvarAssinatura(sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } });
      if (!r.ok) { setErro("Não foi possível ativar agora. Tente de novo em instantes."); return; }
      setMostrar(false);
    } catch {
      setErro("Não foi possível ativar os avisos neste aparelho.");
    } finally {
      setOcupado(false);
    }
  };

  if (!mostrar) return null;

  return (
    <div role="region" aria-label="Ativar avisos" className="mb-4 rounded-2xl border border-sky-500/30 bg-sky-500/10 p-4 flex items-start gap-3">
      <div className="mt-0.5 text-sky-400 shrink-0"><Bell className="w-5 h-5" /></div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-white">Receba avisos no celular</p>
        <p className="text-xs text-gray-300 mt-1 leading-relaxed">Lembrete de aula, mudanças de horário e pagamentos, direto na tela do seu celular.</p>
        {erro && <p role="alert" className="text-xs text-red-300 mt-2">{erro}</p>}
        <button onClick={ativar} disabled={ocupado} className="mt-2 px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-gray-900 text-xs font-black uppercase tracking-widest disabled:opacity-50">
          {ocupado ? "Ativando…" : "Ativar avisos"}
        </button>
      </div>
      <button onClick={dispensar} aria-label="Dispensar" className="p-1 text-gray-400 hover:text-white shrink-0"><X className="w-4 h-4" /></button>
    </div>
  );
}
