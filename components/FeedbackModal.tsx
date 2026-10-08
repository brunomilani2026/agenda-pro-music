"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { MessageCircleHeart, Send, XCircle, AlertCircle, CheckCircle2 } from "lucide-react";
import StarRating from "@/components/ui/StarRating";
import { sendFeedback } from "@/app/actions/feedback.actions";

const MESSAGE_MAX = 1000;

interface FeedbackModalProps {
  open: boolean;
  onClose: () => void;
}

export default function FeedbackModal({ open, onClose }: FeedbackModalProps) {
  const [rating, setRating] = useState(0);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (open) {
      setRating(0);
      setMessage("");
      setError(null);
      setSending(false);
      setSent(false);
    }
  }, [open]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sending) return;
    setError(null);
    setSending(true);
    try {
      const result = await sendFeedback(rating, message);
      if (result.success) {
        setSent(true);
        setTimeout(onClose, 1500);
      } else {
        setError(result.error || "Não foi possível enviar. Tente novamente.");
      }
    } catch {
      setError("Erro inesperado ao enviar. Tente novamente.");
    } finally {
      setSending(false);
    }
  };

  const canSend = rating > 0 && !sending;

  // Portal no <body>: se um ancestral tiver transform (ex.: zoom da agenda),
  // position:fixed passa a se ancorar nele e o modal sobe/corta as estrelas.
  // No body, o overlay centraliza sempre na viewport real.
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/90 animate-fade-in">
      <div className="bg-gray-800/95 ring-1 ring-white/10 rounded-[2rem] w-full max-w-md shadow-2xl border border-gray-700/50 flex flex-col max-h-[95vh]">
        <div className="px-8 py-6 border-b border-gray-700/50 flex justify-between items-start gap-4">
          <div className="min-w-0">
            <h2 className="text-2xl font-black text-white italic uppercase tracking-tighter flex items-center gap-2">
              <MessageCircleHeart className="w-5 h-5 text-amber-500 shrink-0" />
              Dar feedback
            </h2>
            <p className="text-xs text-gray-500 mt-1 font-bold uppercase tracking-widest">
              O que você achou da plataforma?
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="hover:rotate-90 transition-all duration-300 text-gray-500 hover:text-white bg-gray-700/50 p-2.5 rounded-2xl shrink-0"
          >
            <XCircle className="w-5 h-5" />
          </button>
        </div>

        {sent ? (
          <div className="p-8 flex flex-col items-center gap-3 text-center">
            <CheckCircle2 className="w-10 h-10 text-amber-500" />
            <p className="text-white font-bold">Valeu pelo feedback!</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-8 space-y-6">
            <div className="flex justify-center">
              <StarRating value={rating} onChange={setRating} />
            </div>

            <div className="group">
              <label className="flex items-center justify-between text-[10px] font-black text-gray-500 mb-2 uppercase tracking-[0.2em] group-focus-within:text-amber-500 transition-colors">
                <span>Comentário (opcional)</span>
                <span className="text-gray-600 tabular-nums">{message.length}/{MESSAGE_MAX}</span>
              </label>
              <textarea
                rows={4}
                maxLength={MESSAGE_MAX}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="w-full bg-gray-900/50 border border-gray-700/50 rounded-2xl p-4 text-white focus:bg-gray-900 focus:border-amber-500/50 outline-none transition-all placeholder-gray-700 font-medium resize-none leading-relaxed"
                placeholder="Conte o que podemos melhorar..."
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm font-bold">
                <AlertCircle className="w-4 h-4 shrink-0" /> {error}
              </div>
            )}

            <div className="pt-2 flex flex-col-reverse sm:flex-row justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-6 py-3.5 text-xs font-black uppercase tracking-widest text-gray-400 hover:text-white bg-gray-700/50 rounded-2xl hover:bg-gray-700 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={!canSend}
                className="px-8 py-3.5 bg-amber-500 hover:bg-amber-400 text-gray-900 text-xs font-black rounded-2xl shadow-xl shadow-amber-500/20 active:scale-95 transition-all uppercase tracking-widest disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Send className="w-4 h-4" />
                {sending ? "Enviando..." : "Enviar"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body
  );
}
