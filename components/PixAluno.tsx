"use client";

import { useState } from "react";
import { Check, CheckCircle, Copy, Loader2 } from "lucide-react";
import { avisarPagamentoPix } from "@/app/(aluno)/actions";

/**
 * Pix estático não confirma sozinho: o aluno paga no app do banco e avisa o
 * professor, que confere o extrato e dá a baixa no financeiro.
 */
export function JaPagueiButton({
  paymentId,
  avisadoEm,
  onAvisado,
}: {
  paymentId: string;
  /** Preenchido se o aluno já avisou antes (recarregar a página não repete o aviso). */
  avisadoEm?: string;
  onAvisado?: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [avisado, setAvisado] = useState(!!avisadoEm);
  const [erro, setErro] = useState("");

  if (avisado) {
    return (
      <div className="w-full flex items-start gap-2 bg-sky-500/10 border border-sky-500/20 text-sky-300 rounded-xl p-4 text-sm">
        <CheckCircle className="w-5 h-5 shrink-0 mt-0.5" />
        <span>
          Aviso enviado! Seu professor vai conferir o Pix e confirmar o pagamento. Você será notificado quando for confirmado.
        </span>
      </div>
    );
  }

  const avisar = async () => {
    setLoading(true);
    setErro("");
    const res = await avisarPagamentoPix(paymentId);
    setLoading(false);
    if (res.success) {
      setAvisado(true);
      onAvisado?.();
    } else {
      setErro(res.error || "Não foi possível avisar o professor.");
    }
  };

  return (
    <div className="w-full">
      <button
        onClick={avisar}
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-gray-900 font-black py-3 px-6 rounded-xl transition-all active:scale-95"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
        Já paguei
      </button>
      <p className="text-xs text-gray-500 text-center mt-2">
        Clique só depois de concluir o Pix no app do banco. Seu professor será avisado para conferir.
      </p>
      {erro && <p className="text-xs text-red-400 text-center mt-2">{erro}</p>}
    </div>
  );
}

/** QR Code, "copia e cola" e botão "Já paguei" de uma fatura aberta. */
export function PixPagamentoCard({
  paymentId,
  amount,
  pixQrcode,
  pixPayload,
  avisadoEm,
  onAvisado,
}: {
  paymentId: string;
  amount: number;
  pixQrcode: string;
  pixPayload: string;
  avisadoEm?: string;
  onAvisado?: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const copiar = async () => {
    await navigator.clipboard.writeText(pixPayload);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col items-center gap-5">
      <p className="text-3xl font-black text-white">R$ {Number(amount).toFixed(2).replace(".", ",")}</p>
      {pixQrcode && (
        <div className="bg-white p-4 rounded-2xl border border-gray-200">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`data:image/png;base64,${pixQrcode}`} alt="QR Code Pix" className="w-56 h-56" />
        </div>
      )}
      <p className="text-sm text-gray-400 text-center">
        Escaneie o QR Code com o app do seu banco, <br /> ou copie o código Pix abaixo.
      </p>
      <div className="w-full bg-gray-900/50 border border-gray-700 rounded-xl p-4">
        <p className="text-xs text-gray-400 uppercase tracking-widest font-bold mb-2">Pix Copia e Cola</p>
        <div className="flex items-center gap-3">
          <p className="text-xs text-gray-300 font-mono truncate flex-1">{pixPayload}</p>
          <button
            onClick={copiar}
            className={`shrink-0 flex items-center gap-1.5 text-xs font-bold py-2 px-3 rounded-lg transition-all ${copied ? "bg-green-500/10 text-green-400 border border-green-500/20" : "bg-amber-500/10 text-amber-500 border border-amber-500/20 hover:bg-amber-500/20"}`}
          >
            {copied ? <><Check className="w-3.5 h-3.5" /> Copiado!</> : <><Copy className="w-3.5 h-3.5" /> Copiar</>}
          </button>
        </div>
      </div>
      <JaPagueiButton paymentId={paymentId} avisadoEm={avisadoEm} onAvisado={onAvisado} />
    </div>
  );
}
