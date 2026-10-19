"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, Mail, X } from "lucide-react";
import { fetchEmailsAluno, type EmailAluno } from "./emails-actions";
import { MODELOS_EMAIL, ROTULO_TIPO, TIPOS_EMAIL, type TipoEmail } from "@/lib/email-tipos";
import { emailFailureText } from "@/lib/email-failure";
import { diasSemLer } from "@/lib/email-lida";

const fmtDataHora = (iso: string) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })} ${d.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })}`;
};

function Leitura({ i }: { i: EmailAluno }) {
  if (i.lida === null || i.status === "falhou") return null;
  if (i.lida) return <span className="text-green-400">Aviso no app lido{i.lida_em ? ` em ${fmtDataHora(i.lida_em)}` : ""}</span>;
  const dias = diasSemLer(i.created_at);
  return <span className={dias ? "text-amber-400 font-bold" : "text-gray-400"}>{dias ? `Aviso no app não lido há ${dias} dias` : "Aviso no app não lido"}</span>;
}

function CartaoEmail({ titulo, texto, botao, url }: { titulo: string; texto: string | null; botao?: string | null; url?: string | null }) {
  // Prévia fiel ao que o aluno recebe: faixa escura com dourado, título, texto e botão.
  return (
    <div className="rounded-2xl overflow-hidden border border-gray-700 bg-white text-gray-800 max-w-lg mx-auto">
      <div className="bg-zinc-900 px-5 py-4 border-b-4 border-amber-500">
        <p className="text-amber-400 text-xs font-black uppercase tracking-widest">Agenda Pro Music</p>
        <p className="text-white text-lg font-bold mt-1 break-words">{titulo}</p>
      </div>
      <div className="px-5 py-5 text-sm leading-relaxed whitespace-pre-line break-words">{texto || "(sem texto)"}</div>
      {botao && (
        <div className="px-5 pb-6">
          <span className="inline-block bg-amber-500 text-zinc-900 font-bold text-sm px-5 py-3 rounded-xl">{botao}</span>
          {url && <p className="text-[11px] text-gray-400 mt-2 break-all">{url}</p>}
        </div>
      )}
    </div>
  );
}

export default function EmailsAba({ alunoId }: { alunoId: string }) {
  const [itens, setItens] = useState<EmailAluno[]>([]);
  const [disponivel, setDisponivel] = useState(true);
  const [emailAluno, setEmailAluno] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<TipoEmail | "todos">("todos");
  const [aberto, setAberto] = useState<EmailAluno | null>(null);
  const [modelos, setModelos] = useState(false);
  const [soNaoLidas, setSoNaoLidas] = useState(false);

  useEffect(() => {
    let vivo = true;
    fetchEmailsAluno(alunoId)
      .then(r => { if (!vivo) return; if (r.ok) { setDisponivel(r.disponivel); setEmailAluno(r.emailAluno); setItens(r.itens); } else setErro(r.error); })
      .catch(() => { if (vivo) setErro("Não foi possível carregar os e-mails."); })
      .finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
  }, [alunoId]);

  const trintaDias = useMemo(() => Date.now() - 30 * 86400000, []);
  const resumo = useMemo(() => {
    const r = Object.fromEntries(TIPOS_EMAIL.map(t => [t, { total: 0, falhas: 0, ultimo: "" as string }])) as Record<TipoEmail, { total: number; falhas: number; ultimo: string }>;
    for (const i of itens) {
      if (i.origem !== "email") continue;
      const x = r[i.tipo];
      if (!x.ultimo || i.created_at > x.ultimo) x.ultimo = i.created_at;
      if (new Date(i.created_at).getTime() >= trintaDias) { x.total++; if (i.status === "falhou") x.falhas++; }
    }
    return r;
  }, [itens, trintaDias]);
  const ultimo = itens.find(i => i.origem === "email");
  const naoLidas = itens.filter(i => i.lida === false && i.status !== "falhou").length;
  const visiveis = itens.filter(i => (filtro === "todos" || i.tipo === filtro) && (!soNaoLidas || (i.lida === false && i.status !== "falhou")));
  const tiposComItem = TIPOS_EMAIL.filter(t => itens.some(i => i.tipo === t));

  if (carregando) return <div className="space-y-3 animate-pulse" aria-busy="true"><div className="h-24 rounded-3xl bg-gray-800/60" /><div className="h-48 rounded-3xl bg-gray-800/60" /></div>;
  if (erro) return <p role="alert" className="text-sm text-red-400 font-medium">{erro}</p>;

  return (
    <div className="space-y-4">
      {!emailAluno && (
        <div role="alert" className="flex items-start gap-3 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />Este aluno não tem e-mail cadastrado: nenhum e-mail do sistema chega até ele.
        </div>
      )}
      {ultimo?.status === "falhou" && (
        <div role="alert" className="flex items-start gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />O último e-mail para este aluno falhou: {emailFailureText({ reason: (ultimo.fail_reason as never) ?? "api", detail: ultimo.fail_detail ?? undefined })}
        </div>
      )}

      {!disponivel ? (
        <section className="rounded-3xl border border-gray-800 bg-gray-800/40 p-5"><p className="text-sm text-gray-500">O registro de e-mails ainda não foi ativado no banco.</p></section>
      ) : (
        <>
          <section className="grid grid-cols-2 md:grid-cols-5 gap-3" aria-label="E-mails dos últimos 30 dias">
            {(["aula", "pagamento", "atraso", "tarefa", "manual"] as TipoEmail[]).map(t => (
              <button key={t} type="button" onClick={() => setFiltro(filtro === t ? "todos" : t)} className={`text-left rounded-2xl border p-4 transition ${filtro === t ? "border-amber-500 bg-amber-500/10" : "border-gray-800 bg-gray-800/40 hover:border-gray-700"}`}>
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">{ROTULO_TIPO[t]}</p>
                <p className="mt-1 text-2xl font-black text-white">{resumo[t].total}<span className="text-xs text-gray-500 font-medium"> em 30 dias</span></p>
                <p className={`text-xs mt-0.5 ${resumo[t].falhas ? "text-red-400" : "text-gray-500"}`}>{resumo[t].falhas ? `${resumo[t].falhas} falhou` : resumo[t].ultimo ? `último: ${fmtDataHora(resumo[t].ultimo).slice(0, 10)}` : "nenhum ainda"}</p>
              </button>
            ))}
          </section>

          <section className="rounded-3xl border border-gray-800 bg-gray-800/40 ring-1 ring-white/5 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <h2 className="text-xs font-black uppercase tracking-widest text-gray-400">E-mails para {emailAluno ?? "este aluno"}</h2>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setFiltro("todos")} className={`px-3 py-1.5 rounded-full border text-[10px] font-black uppercase tracking-widest ${filtro === "todos" ? "bg-amber-500 text-gray-900 border-amber-500" : "border-gray-700 text-gray-400 hover:text-white"}`}>Todos ({itens.length})</button>
                <button type="button" onClick={() => setSoNaoLidas(v => !v)} aria-pressed={soNaoLidas} className={`px-3 py-1.5 rounded-full border text-[10px] font-black uppercase tracking-widest ${soNaoLidas ? "bg-amber-500 text-gray-900 border-amber-500" : "border-gray-700 text-gray-400 hover:text-white"}`}>Não lidos ({naoLidas})</button>
                {tiposComItem.map(t => (
                  <button key={t} type="button" onClick={() => setFiltro(t)} className={`px-3 py-1.5 rounded-full border text-[10px] font-black uppercase tracking-widest ${filtro === t ? "bg-amber-500 text-gray-900 border-amber-500" : "border-gray-700 text-gray-400 hover:text-white"}`}>{ROTULO_TIPO[t]}</button>
                ))}
              </div>
            </div>
            {visiveis.length === 0 ? <p className="text-sm text-gray-500">Nenhum e-mail registrado ainda. Os próximos envios para este aluno aparecem aqui.</p> : (
              <ul className="divide-y divide-gray-800">
                {visiveis.map(i => (
                  <li key={i.id}>
                    <button type="button" onClick={() => setAberto(i)} className="w-full text-left py-3 flex items-start gap-3 hover:bg-white/[0.02] rounded-xl px-1">
                      <span className="mt-0.5 shrink-0">{i.status === "falhou" ? <AlertTriangle className="w-4 h-4 text-red-400" /> : i.status === "enviado" ? <CheckCircle2 className="w-4 h-4 text-green-400" /> : <Mail className="w-4 h-4 text-gray-500" />}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-bold text-white break-words">{i.title}</span>
                        <span className="block text-xs text-gray-500">{fmtDataHora(i.created_at)} · {ROTULO_TIPO[i.tipo]}</span>
                        <span className="block text-xs"><Leitura i={i} /></span>
                      </span>
                      <span className={`shrink-0 text-[10px] font-black uppercase tracking-widest ${i.status === "falhou" ? "text-red-400" : i.status === "enviado" ? "text-green-400" : "text-gray-500"}`}>
                        {i.status === "falhou" ? "Falhou" : i.status === "enviado" ? "Enviado" : "Aviso no portal"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-4 text-xs text-gray-500">&quot;Enviado&quot; significa que o provedor de e-mail aceitou o envio; não garante que o aluno abriu ou que não caiu no spam. &quot;Aviso no app lido&quot; vale para o aviso que sai junto no sino do aluno (quando ele abre o app); não indica que o e-mail foi aberto. &quot;Aviso no portal&quot; são avisos antigos, de antes do registro de e-mails existir: normalmente tiveram um e-mail espelho, sem garantia.</p>
          </section>

          <section className="rounded-3xl border border-gray-800 bg-gray-800/40 ring-1 ring-white/5 p-5">
            <button type="button" onClick={() => setModelos(v => !v)} className="w-full flex items-center justify-between text-left" aria-expanded={modelos}>
              <span className="text-xs font-black uppercase tracking-widest text-gray-400">Como cada e-mail chega ao aluno (modelos)</span>
              <ChevronDown className={`w-4 h-4 text-gray-500 transition ${modelos ? "rotate-180" : ""}`} />
            </button>
            {modelos && (
              <div className="mt-4 space-y-6">
                {MODELOS_EMAIL.map(m => (
                  <div key={m.nome}>
                    <p className="text-sm font-bold text-white">{m.nome} <span className="text-xs text-gray-500 font-normal">· {m.quando}</span></p>
                    <div className="mt-2"><CartaoEmail titulo={m.titulo} texto={m.texto} botao={m.botao} /></div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {aberto && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/70 p-0 sm:p-4" role="dialog" aria-modal="true" aria-label="Como o e-mail chegou">
          <div className="w-full sm:max-w-xl max-h-[90vh] overflow-y-auto bg-gray-900 border border-gray-800 rounded-t-3xl sm:rounded-3xl p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-black text-white">Como o e-mail chegou</h2>
                <p className="text-xs text-gray-500">{fmtDataHora(aberto.created_at)}{aberto.to_email ? ` · para ${aberto.to_email}` : ""}</p>
              </div>
              <button onClick={() => setAberto(null)} className="p-2 text-gray-400 hover:text-white" aria-label="Fechar"><X className="w-5 h-5" /></button>
            </div>
            {aberto.lida !== null && aberto.status !== "falhou" && <p className="text-xs"><Leitura i={aberto} /></p>}
            {aberto.status === "falhou" && <p role="alert" className="text-sm text-red-300">Falhou: {emailFailureText({ reason: (aberto.fail_reason as never) ?? "api", detail: aberto.fail_detail ?? undefined })}</p>}
            {aberto.status === "aviso" && <p className="text-xs text-amber-300">Aviso antigo do portal: o e-mail espelho provavelmente foi enviado com este texto, mas o envio não foi registrado.</p>}
            <CartaoEmail titulo={aberto.title} texto={aberto.message} botao={aberto.button_label} url={aberto.button_url} />
          </div>
        </div>
      )}
    </div>
  );
}
