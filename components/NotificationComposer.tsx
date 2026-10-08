"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Bell, Mail, Send, XCircle, AlertCircle } from "lucide-react";

const TITLE_MAX = 120;
const MESSAGE_MAX = 1000;

interface NotificationComposerProps {
  open: boolean;
  onClose: () => void;
  /** Título do modal, ex.: "Avisar João" ou "Comunicado a todos os alunos". */
  heading: string;
  /** Linha de apoio, ex.: "12 alunos ativos receberão este aviso". */
  subheading?: string;
  /**
   * Envia o aviso. Deve retornar { ok, msg }. Em sucesso, o modal fecha e o
   * chamador exibe o toast; em falha, a mensagem aparece inline no modal.
   */
  onSend: (title: string, message: string, sendEmail: boolean) => Promise<{ ok: boolean; msg?: string }>;
}

export default function NotificationComposer({ open, onClose, heading, subheading, onSend }: NotificationComposerProps) {
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [sendEmail, setSendEmail] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Zera o formulário sempre que o modal abre.
  useEffect(() => {
    if (open) {
      setTitle("");
      setMessage("");
      setSendEmail(true);
      setError(null);
      setSending(false);
    }
  }, [open]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sending) return;
    setError(null);
    setSending(true);
    try {
      const result = await onSend(title.trim(), message.trim(), sendEmail);
      if (result.ok) {
        onClose();
      } else {
        setError(result.msg || "Não foi possível enviar. Tente novamente.");
      }
    } catch {
      setError("Erro inesperado ao enviar. Tente novamente.");
    } finally {
      setSending(false);
    }
  };

  const canSend = title.trim().length > 0 && message.trim().length > 0 && !sending;

  // Portal no <body>: ancestral com transform (ex.: zoom da agenda) faria o
  // position:fixed ancorar nele e o modal subir/cortar. Mesmo padrão do FeedbackModal.
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/90 animate-fade-in">
      <div className="bg-gray-800/95 ring-1 ring-white/10 rounded-[2rem] w-full max-w-lg shadow-2xl border border-gray-700/50 flex flex-col max-h-[95vh]">
        {/* Cabeçalho */}
        <div className="px-8 py-6 border-b border-gray-700/50 flex justify-between items-start gap-4">
          <div className="min-w-0">
            <h2 className="text-2xl font-black text-white italic uppercase tracking-tighter flex items-center gap-2">
              <Bell className="w-5 h-5 text-amber-500 shrink-0" />
              <span className="truncate">{heading}</span>
            </h2>
            {subheading && (
              <p className="text-xs text-gray-500 mt-1 font-bold uppercase tracking-widest">{subheading}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="hover:rotate-90 transition-all duration-300 text-gray-500 hover:text-white bg-gray-700/50 p-2.5 rounded-2xl shrink-0"
          >
            <XCircle className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-8 space-y-6 scrollbar-thin scrollbar-thumb-gray-700">
          {/* Título */}
          <div className="group">
            <label className="flex items-center justify-between text-[10px] font-black text-gray-500 mb-2 uppercase tracking-[0.2em] group-focus-within:text-amber-500 transition-colors">
              <span>Título</span>
              <span className="text-gray-600 tabular-nums">{title.length}/{TITLE_MAX}</span>
            </label>
            <input
              type="text"
              required
              maxLength={TITLE_MAX}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-gray-900/50 border border-gray-700/50 rounded-2xl p-4 text-white focus:bg-gray-900 focus:border-amber-500/50 outline-none transition-all placeholder-gray-700 font-bold"
              placeholder="Ex: Aula de sábado remarcada"
            />
          </div>

          {/* Mensagem */}
          <div className="group">
            <label className="flex items-center justify-between text-[10px] font-black text-gray-500 mb-2 uppercase tracking-[0.2em] group-focus-within:text-amber-500 transition-colors">
              <span>Mensagem</span>
              <span className="text-gray-600 tabular-nums">{message.length}/{MESSAGE_MAX}</span>
            </label>
            <textarea
              required
              rows={5}
              maxLength={MESSAGE_MAX}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full bg-gray-900/50 border border-gray-700/50 rounded-2xl p-4 text-white focus:bg-gray-900 focus:border-amber-500/50 outline-none transition-all placeholder-gray-700 font-medium resize-none leading-relaxed"
              placeholder="Escreva o aviso que o aluno verá nas notificações..."
            />
          </div>

          {/* Toggle e-mail */}
          <button
            type="button"
            onClick={() => setSendEmail((v) => !v)}
            className={`w-full flex items-center gap-3 p-4 rounded-2xl border transition-all text-left ${
              sendEmail
                ? "bg-amber-500/[0.06] border-amber-500/30"
                : "bg-gray-900/40 border-gray-700/50"
            }`}
          >
            <div className={`w-10 h-6 rounded-full p-1 transition-colors shrink-0 ${sendEmail ? "bg-amber-500" : "bg-gray-600"}`}>
              <div className={`w-4 h-4 rounded-full bg-white transition-transform ${sendEmail ? "translate-x-4" : ""}`} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-white flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-amber-500" /> Enviar também por e-mail
              </p>
              <p className="text-[11px] text-gray-500 font-medium">
                Além da notificação no app, o aluno recebe um e-mail.
              </p>
            </div>
          </button>

          {error && (
            <div className="flex items-center gap-2 text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm font-bold">
              <AlertCircle className="w-4 h-4 shrink-0" /> {error}
            </div>
          )}

          {/* Ações */}
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
              {sending ? "Enviando..." : "Enviar aviso"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
