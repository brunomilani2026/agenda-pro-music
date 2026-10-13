"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, RotateCcw, Square, Trash2 } from "lucide-react";
import { MAX_SEGUNDOS_GRAVACAO, extensaoDoMime, formatarDuracao, juntarTranscricao, mimeLimpo } from "@/lib/gravacao";

// Grava um áudio no navegador (MediaRecorder) e, quando o navegador permite (Chrome, Edge, Android),
// transcreve a fala em português ao mesmo tempo (reconhecimento de voz do navegador).
// O áudio só sai do computador quando o formulário é salvo.

type Props = {
  onAudio: (arquivo: File | null) => void;
  onTranscricao?: (texto: string) => void;
};

const TIPOS = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];

export default function GravadorAudio({ onAudio, onTranscricao }: Props) {
  const [estado, setEstado] = useState<"parado" | "gravando" | "pronto">("parado");
  const [segundos, setSegundos] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const [parcial, setParcial] = useState("");
  const [urlAudio, setUrlAudio] = useState<string | null>(null);
  const [transcreveu, setTranscreveu] = useState<null | boolean>(null);
  const [temTranscricao, setTemTranscricao] = useState(true);

  const gravador = useRef<MediaRecorder | null>(null);
  const fluxo = useRef<MediaStream | null>(null);
  const pedacos = useRef<Blob[]>([]);
  const reconhecedor = useRef<any>(null);
  const trechos = useRef<string[]>([]);
  const gravando = useRef(false);
  const relogio = useRef<ReturnType<typeof setInterval> | null>(null);
  const inicio = useRef(0);

  useEffect(() => {
    setTemTranscricao(typeof window !== "undefined" && !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition));
  }, []);

  const limparTudo = useCallback(() => {
    gravando.current = false;
    if (relogio.current) { clearInterval(relogio.current); relogio.current = null; }
    try { reconhecedor.current?.abort?.(); } catch { /* já parado */ }
    reconhecedor.current = null;
    fluxo.current?.getTracks().forEach(t => t.stop());
    fluxo.current = null;
  }, []);

  useEffect(() => () => { limparTudo(); }, [limparTudo]);
  useEffect(() => () => { if (urlAudio) URL.revokeObjectURL(urlAudio); }, [urlAudio]);

  const parar = useCallback(() => {
    if (!gravando.current) return;
    gravando.current = false;
    if (relogio.current) { clearInterval(relogio.current); relogio.current = null; }
    try { gravador.current?.stop(); } catch { /* já parado */ }
    try { reconhecedor.current?.stop?.(); } catch { /* já parado */ }
  }, []);

  const iniciar = async () => {
    setErro(null); setParcial(""); setTranscreveu(null);
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setErro("Este navegador não permite gravar áudio. Use o Chrome, o Edge ou o Safari atualizados.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      fluxo.current = stream;
      const tipo = TIPOS.find(t => MediaRecorder.isTypeSupported(t));
      const rec = new MediaRecorder(stream, tipo ? { mimeType: tipo } : undefined);
      pedacos.current = []; trechos.current = [];
      rec.ondataavailable = e => { if (e.data && e.data.size > 0) pedacos.current.push(e.data); };
      rec.onstop = () => {
        const mime = mimeLimpo(rec.mimeType || tipo || "audio/webm");
        const blob = new Blob(pedacos.current, { type: mime });
        const arquivo = new File([blob], `audio-tarefa.${extensaoDoMime(mime)}`, { type: mime });
        fluxo.current?.getTracks().forEach(t => t.stop());
        fluxo.current = null;
        setUrlAudio(prev => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(blob); });
        setEstado("pronto");
        onAudio(arquivo);
        // O reconhecimento termina um instante depois do áudio: espera um pouco pelo último trecho.
        setTimeout(() => {
          const texto = juntarTranscricao(trechos.current);
          setParcial("");
          setTranscreveu(!!texto);
          if (texto) onTranscricao?.(texto);
        }, 1200);
      };

      const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SR && onTranscricao) {
        const r = new SR();
        r.lang = "pt-BR"; r.continuous = true; r.interimResults = true;
        r.onresult = (e: any) => {
          let temp = "";
          for (let i = e.resultIndex; i < e.results.length; i++) {
            const res = e.results[i];
            if (res.isFinal) trechos.current.push(res[0].transcript); else temp += res[0].transcript;
          }
          setParcial(temp);
        };
        r.onerror = () => { /* sem fala, microfone ocupado etc.: o áudio continua sendo gravado */ };
        // O navegador encerra o reconhecimento sozinho depois de um silêncio: religa enquanto grava.
        r.onend = () => { if (gravando.current) { try { r.start(); } catch { /* já ativo */ } } };
        reconhecedor.current = r;
        try { r.start(); } catch { /* segue só com o áudio */ }
      }

      gravador.current = rec;
      gravando.current = true;
      inicio.current = Date.now();
      setSegundos(0);
      setEstado("gravando");
      rec.start(1000);
      relogio.current = setInterval(() => {
        const s = (Date.now() - inicio.current) / 1000;
        setSegundos(s);
        if (s >= MAX_SEGUNDOS_GRAVACAO) parar();
      }, 250);
    } catch (e: any) {
      limparTudo();
      setEstado("parado");
      setErro(e?.name === "NotAllowedError" || e?.name === "SecurityError"
        ? "O navegador bloqueou o microfone. Clique no cadeado ao lado do endereço do site, permita o microfone e tente de novo."
        : e?.name === "NotFoundError" ? "Nenhum microfone foi encontrado neste computador." : "Não foi possível usar o microfone.");
    }
  };

  const remover = () => {
    setUrlAudio(prev => { if (prev) URL.revokeObjectURL(prev); return null; });
    setEstado("parado"); setSegundos(0); setTranscreveu(null); setParcial("");
    onAudio(null);
  };

  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-900/40 p-3 space-y-2">
      {estado === "parado" && (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={iniciar} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-800 border border-gray-700 hover:border-amber-500/50 text-xs font-black uppercase tracking-widest text-white">
            <Mic className="w-4 h-4 text-amber-500" />Gravar áudio
          </button>
          <span className="text-xs text-gray-500">{temTranscricao ? "O que você falar também vira texto na descrição." : "Neste navegador o áudio é gravado, mas não é transcrito."}</span>
        </div>
      )}

      {estado === "gravando" && (
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <span className="relative flex h-3 w-3" aria-hidden="true"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" /><span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" /></span>
            <span className="text-sm font-bold text-white tabular-nums" role="timer" aria-label="Tempo de gravação">{formatarDuracao(segundos)} <span className="text-gray-500 font-medium">/ {formatarDuracao(MAX_SEGUNDOS_GRAVACAO)}</span></span>
            <button type="button" onClick={parar} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500/20 border border-red-500/40 text-red-300 text-xs font-black uppercase tracking-widest"><Square className="w-3.5 h-3.5" />Parar</button>
          </div>
          {parcial && <p className="text-xs text-gray-400 italic break-words">“{parcial}”</p>}
        </div>
      )}

      {estado === "pronto" && urlAudio && (
        <div className="space-y-2">
          <audio controls src={urlAudio} className="w-full" aria-label="Pré-visualização da gravação" />
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs text-gray-400">Gravado: {formatarDuracao(segundos)}. Será enviado ao aluno como material de apoio.</span>
            <button type="button" onClick={() => { remover(); iniciar(); }} className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-amber-500 hover:text-amber-400"><RotateCcw className="w-3.5 h-3.5" />Regravar</button>
            <button type="button" onClick={remover} className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-red-400 hover:text-red-300"><Trash2 className="w-3.5 h-3.5" />Remover</button>
          </div>
          {transcreveu === true && <p className="text-xs text-green-400">Texto acrescentado à descrição. Confira e corrija se precisar.</p>}
          {transcreveu === false && temTranscricao && <p className="text-xs text-amber-400">Não consegui entender a fala para transcrever. O áudio foi gravado normalmente.</p>}
        </div>
      )}

      {erro && <p role="alert" className="text-xs text-red-400 font-medium">{erro}</p>}
    </div>
  );
}
