"use client";

import { useState, useEffect } from "react";
import { Calendar, Clock, XCircle, RefreshCw, Plus, CheckCircle, AlertCircle, ChevronDown, ChevronUp, FileText, ExternalLink, CreditCard, Video } from "lucide-react";
import { fetchAlunoAulasPage, requestNewLesson, requestCancellation, requestReschedule, requestLessonUsingCredit, fetchTeacherAvailability, renegotiateStudentPayment } from "../../actions";
import { getLocalISODate, nowInSaoPaulo } from "@/lib/utils";

export default function AlunoAulasPage() {
  const [data, setData] = useState<{ upcoming: any[]; history: any[]; awaitingReschedule: any[]; rescheduleDeadline: string; meetLink: string | null }>({ upcoming: [], history: [], awaitingReschedule: [], rescheduleDeadline: '', meetLink: null });
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  const [notification, setNotification] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const [renegInvoice, setRenegInvoice] = useState<any | null>(null);
  const [renegDate, setRenegDate] = useState('');
  const [renegNotes, setRenegNotes] = useState('');
  const [renegLoading, setRenegLoading] = useState(false);

  const [modalType, setModalType] = useState<'new' | 'cancel' | 'reschedule' | 'reposicao' | null>(null);
  const [selectedLesson, setSelectedLesson] = useState<any>(null);
  const [formData, setFormData] = useState({ date: '', startTime: '', endTime: '', instrument: '', reason: '', repeatWeeks: '1' });
  const [availability, setAvailability] = useState<{ startTime: string, endTime: string, status: string, reason?: string }[]>([]);
  const [loadingAvailability, setLoadingAvailability] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [studentInstrument, setStudentInstrument] = useState('');

  const loadData = async () => {
    // Uma server action só (paraleliza no servidor): três chamadas separadas
    // do cliente rodariam em fila, uma após a outra.
    const { result, bills, perfil } = await fetchAlunoAulasPage();
    setData(result);
    setInvoices(bills);
    setStudentInstrument(perfil?.instrument || '');
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    if (formData.date && (modalType === 'new' || modalType === 'reschedule' || modalType === 'reposicao')) {
      setLoadingAvailability(true);
      fetchTeacherAvailability(formData.date).then(d => { setAvailability(d); setLoadingAvailability(false); });
    }
  }, [formData.date, modalType]);

  const showNotif = (msg: string, type: 'success' | 'error') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 5000);
  };

  const calculateEndTime = (startTime: string, duration = 50) => {
    if (!startTime) return "";
    const [h, m] = startTime.split(":").map(Number);
    const total = h * 60 + m + duration;
    return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  };

  const handleSubmitNew = async () => {
    if (!formData.date || !formData.startTime || !formData.endTime) return;
    setSubmitting(true);
    const weeks = parseInt(formData.repeatWeeks || '1');
    let allOk = true;
    for (let i = 0; i < weeks; i++) {
      const [y, mo, da] = formData.date.split('-').map(Number);
      const d = new Date(y, mo - 1, da + i * 7, 12, 0, 0);
      const dateStr = getLocalISODate(d);
      const res = await requestNewLesson({ requested_date: dateStr, requested_starttime: formData.startTime, requested_endtime: formData.endTime, instrument: formData.instrument, reason: formData.reason });
      if (!res.success) {
        if (res.error?.includes('créditos suficientes')) { showNotif('Créditos insuficientes! Redirecionando...', 'error'); setTimeout(() => { window.location.href = "/aluno/compra-creditos"; }, 1500); setSubmitting(false); return; }
        allOk = false; showNotif(res.error || 'Erro ao enviar.', 'error'); break;
      }
    }
    if (allOk) { showNotif(weeks > 1 ? `${weeks} solicitações enviadas!` : 'Solicitação enviada! Aguarde aprovação.', 'success'); setModalType(null); loadData(); }
    setSubmitting(false);
  };

  const handleCancel = async () => {
    if (!selectedLesson || !formData.reason) return;
    setSubmitting(true);
    const res = await requestCancellation(selectedLesson.id, formData.reason);
    if (res.success) { showNotif('Solicitação de cancelamento enviada!', 'success'); setModalType(null); loadData(); }
    else showNotif(res.error || 'Erro ao cancelar.', 'error');
    setSubmitting(false);
  };

  const handleReschedule = async () => {
    if (!selectedLesson || !formData.date || !formData.startTime || !formData.endTime) return;
    setSubmitting(true);
    const res = await requestReschedule(selectedLesson.id, { requested_date: formData.date, requested_starttime: formData.startTime, requested_endtime: formData.endTime, reason: formData.reason });
    if (res.success) { showNotif('Solicitação de remarcação enviada!', 'success'); setModalType(null); loadData(); }
    else showNotif(res.error || 'Erro ao remarcar.', 'error');
    setSubmitting(false);
  };

  const handleReplacementLesson = async () => {
    if (!selectedLesson || !formData.date || !formData.startTime || !formData.endTime) return;
    setSubmitting(true);
    const res = await requestLessonUsingCredit({ requested_date: formData.date, requested_starttime: formData.startTime, requested_endtime: formData.endTime, instrument: formData.instrument, reason: formData.reason, originLessonId: selectedLesson.id });
    if (res.success) { showNotif('Solicitação de reposição enviada! Aguarde aprovação.', 'success'); setModalType(null); loadData(); }
    else showNotif(res.error || 'Erro ao solicitar reposição.', 'error');
    setSubmitting(false);
  };

  const openReneg = (invoice: any) => {
    const d = new Date(); d.setDate(d.getDate() + 7);
    setRenegDate(getLocalISODate(d)); setRenegNotes(''); setRenegInvoice(invoice);
  };

  const handleGenerateLink = async (invoice: any) => {
    setRenegLoading(true);
    const res = await renegotiateStudentPayment(invoice.id, invoice.duedate, 'Geração de link de pagamento');
    if (res.success && res.invoiceUrl) { window.location.href = res.invoiceUrl; }
    else { showNotif(res.error || 'Erro ao gerar pagamento.', 'error'); setRenegLoading(false); }
  };

  const handleReneg = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    if (!renegInvoice) return;
    setRenegLoading(true);
    const res = await renegotiateStudentPayment(renegInvoice.id, renegDate, renegNotes);
    if (res.success) {
      if (res.invoiceUrl) { window.location.href = res.invoiceUrl; }
      else { showNotif(`Renegociação enviada! Novo vencimento: ${renegDate.split('-').reverse().join('/')}.`, 'success'); setRenegInvoice(null); loadData(); }
    } else { showNotif(res.error || 'Erro ao renegociar.', 'error'); }
    setRenegLoading(false);
  };

  const openModal = (type: typeof modalType, lesson?: any) => {
    setSelectedLesson(lesson || null);
    // Pré-preenche com o instrumento do cadastro (ou o da aula, na reposição/remarcação)
    setFormData({ date: '', startTime: '', endTime: '', instrument: lesson?.instrument || studentInstrument, reason: '', repeatWeeks: '1' });
    setModalType(type);
  };

  if (loading) return <div className="flex items-center justify-center h-full"><div className="animate-pulse text-amber-500 font-bold">Carregando aulas...</div></div>;

  return (
    <div className="flex flex-col w-full text-gray-100 bg-gray-900 p-4 md:p-8 rounded-tl-2xl space-y-6 animate-fade-in">

      {notification && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[100]">
          <div className={`flex items-center gap-3 px-6 py-4 rounded-2xl shadow-2xl border backdrop-blur-xl ${notification.type === 'success' ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
            {notification.type === 'success' ? <CheckCircle className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
            <p className="text-sm font-bold">{notification.msg}</p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">Minhas Aulas</h1>
          <p className="text-gray-400 text-sm mt-1">Gerencie suas aulas e faça solicitações.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => openModal('new')}
            className="bg-amber-500 hover:bg-amber-400 text-gray-900 font-bold py-3 px-5 rounded-xl shadow-xl transition-all hover:scale-[1.02] active:scale-95 flex items-center gap-2">
            <Plus className="w-5 h-5" /> Nova Aula
          </button>
        </div>
      </div>

      {/* Reposição liberada pelo professor — fica acima de tudo porque é um
          direito com prazo, não uma linha de histórico. */}
      {data.awaitingReschedule.length > 0 && (
        <div className="bg-purple-500/5 rounded-2xl border border-purple-500/30 shadow-xl overflow-hidden">
          <div className="p-5 border-b border-purple-500/20 flex items-start gap-3">
            <div className="w-10 h-10 shrink-0 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
              <RefreshCw className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">
                Você tem direito a {data.awaitingReschedule.length > 1 ? `${data.awaitingReschedule.length} aulas de reposição` : 'uma aula de reposição'}
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Escolha o novo horário — sem cobrança adicional.
                {data.rescheduleDeadline && ` Válido até ${data.rescheduleDeadline.split('-').reverse().join('/')}.`}
              </p>
            </div>
          </div>
          <div className="divide-y divide-purple-500/10">
            {data.awaitingReschedule.map((lesson) => (
              <div key={lesson.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-5">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-xl flex flex-col items-center justify-center border bg-purple-500/10 text-purple-400 border-purple-500/20">
                    <span className="text-sm font-black">{lesson.date.split('-')[2]}</span>
                    <span className="text-[10px] uppercase font-bold">{new Date(lesson.date + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}</span>
                  </div>
                  <div>
                    <p className="font-bold text-white capitalize">{lesson.instrument}</p>
                    <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                      <Clock className="w-3 h-3" /> {lesson.startTime} — {lesson.endTime}
                    </p>
                    <p className="text-[11px] text-purple-300/80 mt-1">Liberada pelo professor para você remarcar</p>
                  </div>
                </div>
                <button
                  onClick={() => openModal('reposicao', lesson)}
                  className="shrink-0 flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-500 text-white font-bold py-3 px-5 rounded-xl shadow-lg transition-all hover:scale-[1.02] active:scale-95"
                >
                  <RefreshCw className="w-4 h-4" /> Escolher novo horário
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Aulas Agendadas */}
      <div className="bg-gray-800 rounded-2xl border border-gray-700 shadow-xl overflow-hidden">
        <div className="p-5 border-b border-gray-700 bg-gray-800/80">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Calendar className="w-5 h-5 text-amber-500" /> Aulas Agendadas ({data.upcoming.length})
          </h2>
        </div>
        <div className="divide-y divide-gray-700/50">
          {data.upcoming.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-10">Nenhuma aula futura agendada.</p>
          ) : (
            data.upcoming.map((lesson) => {
              const awaitingPayment = lesson.status === 'aguardando_pagamento';
              return (
                <div key={lesson.id} className={`flex items-center justify-between p-5 hover:bg-gray-700/20 transition-colors ${awaitingPayment ? 'border-l-4 border-blue-500 bg-blue-500/5' : ''}`}>
                  <div className="flex items-center gap-4">
                    <div className={`w-14 h-14 rounded-xl flex flex-col items-center justify-center border ${awaitingPayment ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 'bg-amber-500/10 text-amber-500 border-amber-500/20'}`}>
                      <span className="text-sm font-black">{lesson.date.split('-')[2]}</span>
                      <span className="text-[10px] uppercase font-bold">{new Date(lesson.date + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}</span>
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-bold text-white capitalize">{lesson.instrument}</p>
                        {awaitingPayment && (
                          <span className="px-2 py-0.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-full text-[9px] font-black uppercase tracking-widest animate-pulse">
                            Aguardando Pagamento
                          </span>
                        )}
                        {lesson.rescheduledOnce && (
                          <span className="px-2 py-0.5 bg-purple-500/10 text-purple-400 border border-purple-500/20 rounded-full text-[9px] font-black uppercase tracking-widest" title="Esta aula já é resultado de uma remarcação e não pode ser remarcada novamente.">
                            Já remarcada
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5"><Clock className="w-3 h-3" /> {lesson.startTime} — {lesson.endTime}</p>
                      <p className="text-xs text-gray-500 mt-0.5">Prof. {lesson.teacherName}</p>
                      {awaitingPayment && (
                        <a href="/aluno/financeiro" className="inline-flex items-center gap-1 mt-2 text-[11px] font-bold text-blue-400 hover:text-blue-300 underline underline-offset-2 transition-colors">
                          <CreditCard className="w-3 h-3" /> Ir para Financeiro e pagar
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Sala virtual do professor: mesma para todas as aulas. Fica aqui
                        para o link continuar acessível se o e-mail de lembrete falhar. */}
                    {!awaitingPayment && data.meetLink && (
                      <a href={data.meetLink} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 border border-amber-500/20 text-[10px] font-black uppercase tracking-widest transition-colors">
                        <Video className="w-3.5 h-3.5" /> Entrar na aula
                      </a>
                    )}
                    {!awaitingPayment && lesson.canReschedule && (
                      <button onClick={() => openModal('reschedule', lesson)} className="p-2 text-gray-500 hover:text-amber-500 hover:bg-amber-500/10 rounded-lg transition-colors" title="Remarcar">
                        <RefreshCw className="w-4 h-4" />
                      </button>
                    )}
                    {lesson.canCancel ? (
                      <button onClick={() => openModal('cancel', lesson)} className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors" title="Cancelar">
                        <XCircle className="w-4 h-4" />
                      </button>
                    ) : (
                      <span className="px-2 py-1 text-[9px] font-bold uppercase tracking-widest text-gray-500 bg-gray-700/30 border border-gray-700 rounded-full" title="Cancelamentos e remarcações exigem aviso prévio de 6 horas.">
                        &lt; 6h
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Faturas */}
      {invoices.length > 0 && (
        <div className="bg-gray-800 rounded-2xl border border-red-500/20 shadow-xl overflow-hidden">
          <div className="p-5 border-b border-gray-700 bg-red-500/5 flex items-center gap-2">
            <FileText className="w-5 h-5 text-red-400" />
            <h2 className="text-lg font-bold text-white">Faturas Pendentes</h2>
            <span className="ml-auto text-xs text-red-400 font-bold">{invoices.length} fatura{invoices.length > 1 ? 's' : ''}</span>
          </div>
          <div className="divide-y divide-gray-700/50">
            {invoices.map((inv) => {
              const isOverdue = inv.status === 'vencido';
              return (
                <div key={inv.id} className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-5 ${isOverdue ? 'bg-red-500/5' : ''}`}>
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center border shrink-0 ${isOverdue ? 'bg-red-500/10 border-red-500/20 text-red-400' : 'bg-amber-500/10 border-amber-500/20 text-amber-500'}`}>
                      <span className="text-sm font-black">{inv.duedate.split('-')[2]}</span>
                      <span className="text-[10px] uppercase font-bold">{new Date(inv.duedate + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}</span>
                    </div>
                    <div>
                      <p className="font-bold text-white">R$ {Number(inv.amount).toFixed(2)}</p>
                      <p className="text-xs text-gray-400">Vence em {inv.duedate.split('-').reverse().join('/')}</p>
                      {inv.notes && <p className="text-xs text-gray-500 mt-0.5">{inv.notes}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                    <span className={`px-2.5 py-1 text-[10px] font-black uppercase tracking-wider border rounded-full ${isOverdue ? 'text-red-400 bg-red-500/10 border-red-500/20' : 'text-amber-500 bg-amber-500/10 border-amber-500/20'}`}>
                      {isOverdue ? 'Vencida' : 'Pendente'}
                    </span>
                    {inv.invoiceUrl ? (
                      <a href={inv.invoiceUrl} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 text-[10px] font-bold uppercase tracking-widest transition-colors">
                        <ExternalLink className="w-3 h-3" /> Ver fatura
                      </a>
                    ) : inv.status === 'pendente' && (
                      <button onClick={() => handleGenerateLink(inv)} disabled={renegLoading}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 border border-amber-500/20 text-[10px] font-black uppercase tracking-widest transition-colors disabled:opacity-50">
                        <ExternalLink className="w-3 h-3" /> Pagar Agora
                      </button>
                    )}
                    {isOverdue && (
                      <button onClick={() => openReneg(inv)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border border-purple-500/20 text-[10px] font-black uppercase tracking-widest transition-colors">
                        <RefreshCw className="w-3 h-3" /> Renegociar
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Histórico */}
      <div className="bg-gray-800 rounded-2xl border border-gray-700 shadow-xl overflow-hidden">
        <button onClick={() => setShowHistory(!showHistory)} className="w-full p-5 flex items-center justify-between hover:bg-gray-700/20 transition-colors">
          <h2 className="text-lg font-bold text-white">Histórico de Aulas ({data.history.length})</h2>
          {showHistory ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
        </button>
        {showHistory && (
          <div className="divide-y divide-gray-700/50 border-t border-gray-700">
            {data.history.length === 0 ? <p className="text-gray-500 text-sm text-center py-8">Nenhuma aula no histórico.</p> : (
              data.history.map((lesson) => (
                <div key={lesson.id} className="flex items-center gap-4 p-4">
                  <div className="w-10 h-10 bg-gray-700 text-gray-300 rounded-lg flex flex-col items-center justify-center text-xs font-bold">{lesson.date.split('-')[2]}</div>
                  <div className="flex-1">
                    <p className="text-sm text-white capitalize">{lesson.instrument}</p>
                    <p className="text-xs text-gray-500">{lesson.startTime} — {lesson.endTime}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded-full ${
                      lesson.status === 'realizada' ? 'text-green-400 bg-green-500/10 border border-green-500/20'
                        : lesson.status === 'remarcada' ? 'text-purple-400 bg-purple-500/10 border border-purple-500/20'
                        : 'text-red-400 bg-red-500/10 border border-red-500/20'
                    }`}>{lesson.status}</span>
                    {lesson.canReschedule && (
                      <button onClick={() => openModal('reposicao', lesson)} className="p-2 text-gray-500 hover:text-amber-500 hover:bg-amber-500/10 rounded-lg transition-colors" title="Usar crédito de reposição — Agendar reposição">
                        <RefreshCw className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Modal - Renegociação */}
      {renegInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4 animate-fade-in">
          <div className="bg-gray-800 ring-1 ring-purple-500/20 border border-gray-700 rounded-3xl shadow-2xl w-full max-w-md p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
                <RefreshCw className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <h3 className="text-xl font-black text-white">Renegociar Fatura</h3>
                <p className="text-xs text-gray-400">R$ {Number(renegInvoice.amount).toFixed(2)} · vencida em {renegInvoice.duedate.split('-').reverse().join('/')}</p>
              </div>
            </div>
            <form onSubmit={handleReneg} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1.5 uppercase tracking-widest">Novo vencimento *</label>
                <input type="date" required min={getLocalISODate()} value={renegDate} onChange={e => setRenegDate(e.target.value)}
                  className="w-full bg-gray-900/50 border border-gray-700 rounded-xl p-3 text-white focus:border-purple-500 focus:ring-2 focus:ring-purple-500/10 outline-none appearance-none uppercase" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1.5 uppercase tracking-widest">Justificativa</label>
                <textarea rows={3} value={renegNotes} onChange={e => setRenegNotes(e.target.value)}
                  className="w-full bg-gray-900/50 border border-gray-700 rounded-xl p-3 text-white focus:border-purple-500 focus:ring-2 focus:ring-purple-500/10 outline-none resize-none placeholder-gray-600"
                  placeholder="Ex: Dificuldades financeiras temporárias..." />
              </div>
              <p className="text-xs text-gray-400 leading-relaxed bg-purple-500/10 border border-purple-500/20 rounded-xl p-3">
                Um novo PIX será gerado com o novo vencimento. Seu professor será notificado e suas aulas poderão ser reagendadas após a regularização.
              </p>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setRenegInvoice(null)}
                  className="flex-1 px-4 py-3 text-sm font-semibold text-gray-300 bg-gray-700 hover:bg-gray-600 rounded-xl transition-colors">Cancelar</button>
                <button type="submit" disabled={renegLoading || !renegDate}
                  className="flex-1 px-4 py-3 text-sm font-bold text-white bg-purple-600 hover:bg-purple-500 rounded-xl transition-all disabled:opacity-50">
                  {renegLoading ? 'Processando...' : 'Confirmar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal - Nova / Remarcar / Cancelar / Reposição */}
      {(modalType === 'new' || modalType === 'cancel' || modalType === 'reschedule' || modalType === 'reposicao') && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col">

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-white rounded-t-3xl shrink-0">
              <div>
                <h3 className="text-xl font-black text-gray-900">
                  {modalType === 'new' && 'Solicitar Nova Aula'}
                  {modalType === 'cancel' && 'Cancelar Aula'}
                  {modalType === 'reschedule' && 'Remarcar Aula'}
                  {modalType === 'reposicao' && 'Agendar Reposição'}
                </h3>
                <p className="text-xs text-gray-500 mt-0.5 font-medium">
                  {modalType === 'cancel' ? 'Envie sua solicitação ao professor' : modalType === 'reposicao' ? 'Usando seu crédito de reposição — sem cobrança extra' : 'Planeje o horário com o professor'}
                </p>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {selectedLesson && (
                <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 text-xs text-gray-500">
                  Aula atual: <span className="text-gray-900 font-bold">{selectedLesson.date?.split('-').reverse().join('/')} às {selectedLesson.startTime}</span>
                </div>
              )}

              {(modalType === 'new' || modalType === 'reschedule' || modalType === 'reposicao') && (
                <>
                  <div className="group">
                    <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wider ml-1 group-focus-within:text-amber-600 transition-colors">Data desejada</label>
                    <input type="date" value={formData.date} min={getLocalISODate()}
                      onChange={e => setFormData({ ...formData, date: e.target.value })}
                      className="w-full bg-white border border-gray-300 rounded-xl p-3.5 text-gray-900 focus:bg-white focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10 outline-none transition-all hover:bg-gray-50 shadow-sm" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="group">
                      <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wider ml-1 group-focus-within:text-amber-600 transition-colors">Início</label>
                      <input type="time" step={1800} value={formData.startTime}
                        onChange={e => setFormData({ ...formData, startTime: e.target.value, endTime: calculateEndTime(e.target.value) })}
                        className="w-full bg-white border border-gray-300 rounded-xl p-3.5 text-gray-900 focus:bg-white focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10 outline-none transition-all hover:bg-gray-50 shadow-sm" />
                    </div>
                    <div className="group">
                      <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wider ml-1">Fim (50min)</label>
                      <input type="time" step={1800} readOnly value={formData.endTime}
                        className="w-full bg-gray-100 border border-gray-200 rounded-xl p-3.5 text-gray-500 outline-none cursor-not-allowed shadow-inner" />
                    </div>
                  </div>
                  <p className="text-[10px] text-gray-400 -mt-2 ml-1">Horário de Brasília (GMT-3)</p>

                  {/* Grade de disponibilidade */}
                  <div>
                    <label className="block text-xs font-bold text-amber-600 mb-2 uppercase tracking-wider ml-1">Disponibilidade do Professor</label>
                    <div className="bg-gray-50 rounded-xl border border-gray-200 p-3 max-h-40 overflow-y-auto shadow-inner">
                      {!formData.date ? (
                        <p className="text-center text-xs text-gray-400 py-3">Selecione uma data</p>
                      ) : loadingAvailability ? (
                        <p className="text-center text-xs text-gray-400 py-3 animate-pulse">Consultando agenda...</p>
                      ) : (
                        <div className="grid grid-cols-4 gap-1.5">
                          {(() => {
                            // Fuso de São Paulo, não o do dispositivo — o servidor valida
                            // "horário que já passou" em BRT e a grade precisa concordar.
                            const now = nowInSaoPaulo();
                            const todayStr = getLocalISODate(now);
                            const currentTimeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
                            const slots = Array.from({ length: 28 }, (_, i) => {
                              const hour = Math.floor(i / 2) + 8;
                              const min = (i % 2) * 30;
                              return `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '00')}`;
                            });
                            const isToday = formData.date === todayStr;
                            const futureSlots = isToday ? slots.filter(t => t > currentTimeStr) : slots;
                            const visibleSlots = futureSlots.filter(timeStr => {
                              const proposedEnd = calculateEndTime(timeStr);
                              return !availability.some(a => timeStr < a.endTime && proposedEnd > a.startTime);
                            });
                            if (visibleSlots.length === 0) {
                              // Dizer o motivo real: folga/bloqueio de dia inteiro ≠ "horários de hoje já passaram".
                              const fullDayBlock = availability.find(a => a.startTime <= slots[0] && a.endTime >= slots[slots.length - 1]);
                              const msg = fullDayBlock
                                ? `Dia indisponível: ${fullDayBlock.reason || 'agenda bloqueada pelo professor'}. Escolha outra data.`
                                : isToday && futureSlots.length === 0
                                  ? 'Não há mais horários disponíveis para hoje. Escolha outra data.'
                                  : 'Não há horários disponíveis nesta data. Escolha outra data.';
                              return <p className="col-span-4 text-center text-xs text-gray-400 py-3">{msg}</p>;
                            }
                            return visibleSlots.map(timeStr => (
                              <button key={timeStr}
                                onClick={() => setFormData({ ...formData, startTime: timeStr, endTime: calculateEndTime(timeStr) })}
                                className={`p-1.5 rounded-lg text-[10px] font-bold transition-all border ${formData.startTime === timeStr ? 'bg-amber-500 border-amber-400 text-white shadow-md' : 'bg-white border-gray-300 text-gray-700 hover:border-amber-400 hover:bg-amber-50'}`}>
                                {timeStr}
                              </button>
                            ));
                          })()}
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}

              {modalType === 'reposicao' && (
                <p className="text-xs text-amber-700 bg-amber-50 p-3 rounded-xl border border-amber-200">
                  ✓ Crédito de reposição detectado. Ao confirmar, sua aula será agendada sem nenhuma cobrança adicional.
                </p>
              )}

              {(modalType === 'new' || modalType === 'reposicao') && (
                <div className="group">
                  <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wider ml-1 group-focus-within:text-amber-600 transition-colors">Instrumento</label>
                  <input type="text" value={formData.instrument}
                    onChange={e => setFormData({ ...formData, instrument: e.target.value })}
                    placeholder="Ex: Violão"
                    className="w-full bg-white border border-gray-300 rounded-xl p-3.5 text-gray-900 focus:bg-white focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10 outline-none transition-all hover:bg-gray-50 shadow-sm placeholder-gray-400" />
                </div>
              )}

              {modalType === 'new' && (
                <div className="group">
                  <label className="block text-xs font-bold text-amber-600 mb-1.5 uppercase tracking-wider ml-1">Repetir semanalmente?</label>
                  <select value={formData.repeatWeeks} onChange={e => setFormData({ ...formData, repeatWeeks: e.target.value })}
                    className="w-full bg-white border border-amber-300 rounded-xl p-3.5 text-gray-900 focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10 outline-none transition-all hover:bg-amber-50 shadow-sm appearance-none cursor-pointer font-semibold">
                    <option value="1">Não repetir</option>
                    <option value="4">1 mês</option>
                    <option value="12">3 meses</option>
                    <option value="24">6 meses</option>
                  </select>
                </div>
              )}

              <div className="group">
                <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wider ml-1 group-focus-within:text-amber-600 transition-colors">
                  {modalType === 'cancel' ? 'Motivo do cancelamento *' : 'Observações'}
                </label>
                <textarea rows={3} value={formData.reason} onChange={e => setFormData({ ...formData, reason: e.target.value })}
                  className="w-full bg-white border border-gray-300 rounded-xl p-3.5 text-gray-900 focus:bg-white focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10 outline-none resize-none transition-all hover:bg-gray-50 shadow-sm placeholder-gray-400"
                  placeholder={modalType === 'cancel' ? 'Ex: Imprevisto pessoal...' : 'Opcional'} />
              </div>

              {modalType === 'cancel' && (
                <p className="text-xs text-amber-700 bg-amber-50 p-3 rounded-xl border border-amber-200">
                  ⚠ Cancelamentos exigem aviso prévio de 6 horas. Apenas o seu primeiro cancelamento gera um crédito de reposição (30 dias); os seguintes não geram crédito.
                </p>
              )}
            </div>

            {/* Footer */}
            <div className="flex gap-3 px-6 py-5 border-t border-gray-200 bg-gray-50 rounded-b-3xl shrink-0">
              <button onClick={() => setModalType(null)}
                className="flex-1 px-4 py-3 text-sm font-semibold text-gray-600 bg-white border border-gray-300 hover:bg-gray-100 rounded-xl transition-colors shadow-sm">
                Voltar
              </button>
              <button disabled={submitting}
                onClick={() => { modalType === 'new' ? handleSubmitNew() : modalType === 'cancel' ? handleCancel() : modalType === 'reposicao' ? handleReplacementLesson() : handleReschedule(); }}
                className={`flex-1 px-4 py-3 text-sm font-black rounded-xl transition-all disabled:opacity-50 shadow-lg ${modalType === 'cancel' ? 'bg-red-500 hover:bg-red-400 text-white' : 'bg-amber-500 hover:bg-amber-400 text-gray-900'}`}>
                {submitting ? 'Enviando...' : modalType === 'cancel' ? 'Confirmar Cancelamento' : modalType === 'reposicao' ? 'Confirmar Reposição' : 'Enviar Solicitação'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
