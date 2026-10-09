"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAppContext, Student, PaymentMethod } from "../AppContext";
import { createAgendaStudent, updateAgendaStudent, deleteAgendaStudent, createAgendaLesson, resendActivationEmail, createGradeInvoices } from "../agenda/actions";
import { sendManualNotification, broadcastToMyStudents } from "@/app/actions/notification.actions";
import { UserPlus, Users, Edit3, Trash2, Package, CheckCircle, XCircle, AlertCircle, CalendarClock, BadgePercent, Bell, Megaphone } from "lucide-react";
import { Lesson } from "@/types/lesson";
import { maskCPF, unmask, getLocalISODate, addMonthsKeepDay } from "@/lib/utils";
import { emailFailureText } from "@/lib/email-failure";
import NotificationComposer from "@/components/NotificationComposer";
import PhoneInput from "@/components/ui/PhoneInput";
import { useSortableRows, SortableTh } from "@/lib/sortable-rows";

// Ordem de urgência da coluna Status: quem precisa de atenção primeiro.
const STATUS_PRIORITY: Record<string, number> = { bloqueado: 0, inativo: 1, ativo: 2 };
// Aluno sem vencimento (aula avulsa) vai para o fim da ordem crescente, não para
// o começo — string vazia ordenaria antes de qualquer data real.
const NO_EXPIRATION = '9999-12-31';

export default function AlunosPage() {
  const router = useRouter();
  const { students, setStudents, reloadLoadedLessons, instruments, teacherProfile, refreshStudents } = useAppContext();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState<Partial<Student>>({});
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // instruments vem do AppContext — sem fetch extra
  const dynamicInstruments = instruments.length ? instruments : ["violão", "guitarra", "piano"];

  // Grade Semanal (padrão recorrente)
  const [gradeModal, setGradeModal] = useState<{ student: Student } | null>(null);
  const [gradeForm, setGradeForm] = useState({ weekday: '1', startTime: '10:00', weeks: 'auto' });
  const [savingGrade, setSavingGrade] = useState(false);

  // Aviso manual: student definido = individual; sem student = todos os alunos.
  const [notifyTarget, setNotifyTarget] = useState<{ student?: Student } | null>(null);
  const activeStudentsCount = useMemo(
    () => students.filter((s) => s.status === 'ativo').length,
    [students]
  );

  // `expirationdate` e `status` mudam por fora desta tela (baixa no Financeiro,
  // cron de cobrança, webhook do Asaas). Sem este refetch a lista mostrava o
  // vencimento antigo até um F5 — e pior: salvar a ficha nesse estado velho
  // regravava o valor desatualizado no banco. O maxAge evita refazer a busca
  // logo após o seed do servidor.
  useEffect(() => {
    refreshStudents({ maxAgeMs: 30_000 });
  }, [refreshStudents]);

  // A ficha do aluno (/alunos/[id]) tem um botão "Editar" que volta para cá com
  // ?editar=<id>: abre o formulário de edição desse aluno e limpa o endereço.
  // window.location em vez de useSearchParams para não exigir <Suspense>.
  useEffect(() => {
    if (students.length === 0) return;
    const id = new URLSearchParams(window.location.search).get('editar');
    if (!id) return;
    const alvo = students.find(s => s.id === id);
    window.history.replaceState(null, '', '/alunos');
    if (!alvo) return;
    setFormData({ ...alvo, cpf: alvo.cpf ? maskCPF(alvo.cpf) : '', phone: alvo.phone || '' });
    setIsModalOpen(true);
  }, [students]);

  // Uma ordenação só, consumida pelos cards (mobile) e pela tabela (desktop) —
  // reordenar em cada um copiaria o array duas vezes por render, e o componente
  // re-renderiza a cada tecla digitada num modal. O padrão (nome ↑) é o que a
  // tela já usava antes de a ordenação por coluna existir.
  const { sorted: sortedStudents, sort, toggle } = useSortableRows(students, { key: 'name', dir: 'asc' }, {
    name: (s: Student) => s.name,
    expirationdate: (s: Student) => s.expirationdate || NO_EXPIRATION,
    lessonPrice: (s: Student) => Number(s.lessonPrice) || 0,
    status: (s: Student) => STATUS_PRIORITY[s.status] ?? 99,
  });

  const handleSendNotification = async (title: string, message: string, sendEmail: boolean) => {
    if (notifyTarget?.student) {
      const result = await sendManualNotification(notifyTarget.student.id, { title, message, sendEmail });
      if (result.success) {
        if (sendEmail && (result.emailed ?? 0) === 0) {
          showNotification(`Aviso salvo no app de ${notifyTarget.student.name}, mas o e-mail não foi enviado: ${emailFailureText(result.emailFail)}`, 'error');
        } else {
          showNotification(`Aviso enviado para ${notifyTarget.student.name}.`, 'success');
        }
        return { ok: true };
      }
      return { ok: false, msg: result.error };
    }
    const result = await broadcastToMyStudents({ title, message, sendEmail });
    if (result.success) {
      const failed = sendEmail ? (result.emailTotal ?? 0) - (result.emailed ?? 0) : 0;
      if (failed > 0) {
        showNotification(`Aviso salvo no app de ${result.count} aluno(s), mas o e-mail falhou para ${failed} dele(s): ${emailFailureText(result.emailFail)}`, 'error');
      } else {
        showNotification(`Aviso enviado para ${result.count} aluno(s).`, 'success');
      }
      return { ok: true };
    }
    return { ok: false, msg: result.error };
  };

  const showNotification = (message: string, type: 'success' | 'error') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const openNewModal = () => {
    setFormData({
      status: "ativo",
      paymentMethod: "Pix",
      instrument: dynamicInstruments[0] || "Violão",
      lessonPrice: 450,
      discountType: "percent",
      discountValue: 0,
    });
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    const cleanData = {
      ...formData,
      cpf: formData.cpf ? unmask(formData.cpf) : '',
      // Não usa unmask() aqui: o telefone pode vir com "+DDI" (PhoneInput),
      // e unmask() derrubaria o "+". O servidor normaliza (mantém o "+").
      phone: formData.phone || '',
    };

    if (formData.id) {
      // Transição para Inativo: oferece cancelar as aulas futuras e avisar o aluno
      const current = students.find(s => s.id === formData.id);
      let cancelFutureLessons = false;
      if (formData.status === 'inativo' && current && current.status !== 'inativo') {
        cancelFutureLessons = confirm(
          `Cancelar também todas as aulas futuras de ${current.name} e avisá-lo(a) por notificação e e-mail?\n\nOK = inativar e cancelar as aulas\nCancelar = apenas inativar, mantendo as aulas`
        );
      }
      // Só mandamos `expirationdate` se o professor mexeu no campo. O vencimento
      // avança sozinho a cada baixa de pagamento; reenviar o valor com que a tela
      // foi carregada empurrava o ciclo de volta para trás no banco.
      const payload: Partial<Student> = { ...cleanData };
      if (current && (payload.expirationdate ?? '') === (current.expirationdate ?? '')) {
        delete payload.expirationdate;
      }

      const result = await updateAgendaStudent(formData.id, payload, { cancelFutureLessons });
      if (result.success) {
        // `payload`, não `formData`: sem o expirationdate intocado, o valor que
        // já estava no contexto (o do banco) permanece.
        setStudents(students.map(s => s.id === formData.id ? { ...s, ...payload } as Student : s));
        // Nome e instrumento vivem copiados na aula, e o AppProvider fica no
        // layout — sem este reload a agenda continuaria com o valor antigo em
        // memória até um F5. Incondicional: o servidor reconcilia as aulas em
        // TODO save (inclusive reparando as que já estavam dessincronizadas no
        // banco), e comparar com o estado local mascarava justamente esses
        // reparos — o valor local já estava "certo", então o reload não rodava.
        reloadLoadedLessons();
        if (result.warning) {
          showNotification(result.warning, "error");
        } else if ((result.cancelledCount ?? 0) > 0) {
          showNotification(`Aluno inativado, ${result.cancelledCount} aula(s) futura(s) canceladas e aluno avisado.`, "success");
        } else {
          showNotification("Aluno atualizado com sucesso!", "success");
        }
        setIsModalOpen(false);
        setFormData({});
      } else {
        showNotification(result.error || "Erro ao atualizar o aluno. Tente novamente.", "error");
      }
    } else {
      const result = await createAgendaStudent(cleanData);
      if (result.success) {
        await refreshStudents();
        showNotification("Aluno cadastrado com sucesso!", "success");
        setIsModalOpen(false);
        setFormData({});
      } else {
        showNotification(result.error || "Erro ao criar o aluno. Tente novamente.", "error");
      }
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm("Tem certeza que deseja excluir este aluno? As aulas futuras dele serão canceladas e ele será avisado por e-mail.")) {
      const ok = await deleteAgendaStudent(id);
      if (ok) {
        setStudents(students.filter(s => s.id !== id));
        showNotification("Aluno removido da base de dados.", "success");
      } else {
        showNotification("Erro ao excluir o aluno. Tente novamente.", "error");
      }
    }
  };

  const handleGrade = async () => {
    if (!gradeModal) return;
    setSavingGrade(true);
    const teacherName = teacherProfile?.fname || teacherProfile?.name || '';
    const weekday = parseInt(gradeForm.weekday); // 0=Dom, 1=Seg...
    // Encontrar próxima ocorrência do dia da semana
    const today = new Date();
    const daysUntil = (weekday - today.getDay() + 7) % 7 || 7;
    const firstDate = new Date(today);
    firstDate.setDate(today.getDate() + daysUntil);
    const firstDateStr = getLocalISODate(firstDate);
    // "Mês completo" = 1 mês a partir da primeira aula (exclusivo: a aula que
    // cai exatamente na virada pertence ao ciclo seguinte), não até o fim do
    // mês de calendário — senão uma grade iniciada dia 17 parava em 3 aulas.
    const weeks = gradeForm.weeks === 'auto'
      ? (() => {
          const limitStr = addMonthsKeepDay(firstDateStr, 1);
          let count = 0;
          const cursor = new Date(firstDate);
          while (getLocalISODate(cursor) < limitStr) { count++; cursor.setDate(cursor.getDate() + 7); }
          return count;
        })()
      : parseInt(gradeForm.weeks);
    const [h, m] = gradeForm.startTime.split(':').map(Number);
    const endH = Math.floor((h * 60 + m + 50) / 60) % 24;
    const endM = (h * 60 + m + 50) % 60;
    const endTime = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
    const lesson: Lesson = {
      id: '',
      studentName: gradeModal.student.name,
      teacherName,
      instrument: gradeModal.student.instrument as any,
      date: firstDateStr,
      startTime: gradeForm.startTime,
      endTime,
      status: 'agendada',
    };
    const res = await createAgendaLesson(lesson, weeks);
    if (res.success) {
      const weekdayNames = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
      const pkg = (gradeModal.student.packagetype || 'avulsa').toLowerCase();
      if (pkg !== 'avulsa' && gradeModal.student.lessonPrice > 0) {
        // "Mês completo" pode ter 5 semanas — mas é 1 mensalidade, não ceil(5/4)=2.
        const months = gradeForm.weeks === 'auto' ? 1 : Math.max(1, Math.ceil(weeks / 4));
        await createGradeInvoices(gradeModal.student.id, months);
      }
      showNotification(`Grade criada! ${weeks} aula(s) toda ${weekdayNames[weekday]} às ${gradeForm.startTime}.`, 'success');
      reloadLoadedLessons();
    } else {
      // Mostra o conflito real (data + com o que bateu) em vez de "erro genérico".
      showNotification(res.error || 'Erro ao criar grade. Tente novamente.', 'error');
    }
    setSavingGrade(false);
    setGradeModal(null);
  };

  return (
    <div className="flex flex-col w-full h-full bg-gray-900 p-4 md:p-8 rounded-tl-[2rem] animate-fade-in gap-8">

      {/* Cabeçalho */}
      <div className="shrink-0 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl md:text-4xl font-black text-white tracking-tighter italic uppercase italic">
            Meus <span className="text-amber-500">Alunos</span>
          </h1>
          <p className="text-gray-500 text-sm mt-1 font-medium tracking-wide">Gerencie sua base de talentos e pacotes de aulas.</p>
        </div>
        
        <div className="flex items-center gap-3">
          <button
            onClick={() => setNotifyTarget({})}
            disabled={activeStudentsCount === 0}
            className="group bg-gray-800 hover:bg-gray-700 text-white font-black py-4 px-6 rounded-2xl border border-gray-700 transition-all flex items-center justify-center gap-2.5 uppercase tracking-widest text-xs active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
            title="Enviar um aviso para todos os alunos ativos"
          >
            <Megaphone className="w-5 h-5 text-amber-500 group-hover:scale-110 transition-transform" />
            Avisar todos
          </button>
          <button
            onClick={openNewModal}
            className="group bg-amber-500 hover:bg-amber-400 text-gray-900 font-black py-4 px-8 rounded-2xl shadow-xl shadow-amber-500/20 hover:shadow-amber-500/40 transition-all flex items-center justify-center gap-3 uppercase tracking-widest text-xs active:scale-95"
          >
            <UserPlus className="w-5 h-5 group-hover:scale-110 transition-transform" />
            Adicionar Aluno
          </button>
        </div>
      </div>

      {/* Notificação Flutuante / Toast */}
      {notification && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[9999] animate-fade-in-up">
          <div className={`flex items-center gap-3 px-6 py-4 rounded-2xl shadow-2xl border ${notification.type === 'success' ? 'bg-green-500/10 border-green-500/20 text-green-500' : 'bg-red-500/10 border-red-500/20 text-red-500'} backdrop-blur-xl`}>
             {notification.type === 'success' ? <CheckCircle className="w-6 h-6" /> : <AlertCircle className="w-6 h-6" />}
             <div>
               <p className="font-black text-sm uppercase tracking-widest">{notification.type === 'success' ? 'Sucesso!' : 'Ocorreu um Erro'}</p>
               <p className="font-bold text-xs opacity-80">{notification.message}</p>
             </div>
          </div>
        </div>
      )}

      {/* Lista de Alunos em Cards — Mobile / Tablet */}
      <div className="lg:hidden flex-1 min-h-0 overflow-y-auto -mx-1 px-1 space-y-3 scrollbar-thin scrollbar-thumb-gray-700">
        {students.length === 0 ? (
          <div className="flex flex-col items-center gap-4 opacity-40 py-20 text-center">
            <Users className="w-14 h-14 text-gray-600 mb-2" />
            <p className="text-lg font-bold text-gray-400">Nenhum aluno em sua base sonora</p>
            <p className="text-sm text-gray-500">Cadastre alunos para começar a gerenciar sua agenda.</p>
          </div>
        ) : (
          sortedStudents.map((student) => {
            // Comparação por string de data local — new Date('YYYY-MM-DD') vira meia-noite
            // UTC, que em UTC-3 já é a noite anterior: marcava expirado 3h cedo demais.
            const isFinished = student.expirationdate ? student.expirationdate < getLocalISODate() : false;
            const openEdit = () => {
              setFormData({
                ...student,
                cpf: student.cpf ? maskCPF(student.cpf) : '',
                phone: student.phone || '',
              });
              setIsModalOpen(true);
            };
            return (
              <div key={student.id} className="bg-gray-800/40 rounded-3xl border border-gray-800 ring-1 ring-white/5 shadow-xl p-4">
                <div className="flex items-start gap-3">
                  <button type="button" onClick={() => router.push(`/alunos/${student.id}`)} className="flex items-center gap-3 text-left flex-1 min-w-0" title={`Abrir ficha de ${student.name}`}>
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center text-xl font-black text-amber-500 border border-gray-700 shadow-lg shrink-0">
                      {student.name.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-white text-base tracking-tight truncate">{student.name}</p>
                      <p className="text-[10px] text-gray-500 font-medium uppercase tracking-widest truncate">{student.email || 'Sem e-mail'}</p>
                    </div>
                  </button>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => setNotifyTarget({ student })} className="p-2 text-gray-500 hover:text-sky-400 hover:bg-sky-500/10 rounded-xl transition-all" title="Enviar aviso">
                      <Bell className="w-5 h-5" />
                    </button>
                    <button onClick={() => { setGradeForm({ weekday: '1', startTime: '10:00', weeks: 'auto' }); setGradeModal({ student }); }} className="p-2 text-gray-500 hover:text-indigo-400 hover:bg-indigo-500/10 rounded-xl transition-all" title="Grade Semanal">
                      <CalendarClock className="w-5 h-5" />
                    </button>
                    <button onClick={openEdit} className="p-2 text-gray-500 hover:text-amber-500 hover:bg-amber-500/10 rounded-xl transition-all" title="Editar Ficha">
                      <Edit3 className="w-5 h-5" />
                    </button>
                    <button onClick={() => handleDelete(student.id)} className="p-2 text-gray-500 hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-all" title="Remover Aluno">
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 mt-4">
                  <span className="px-3 py-1.5 bg-indigo-500/10 text-indigo-400 rounded-lg text-xs font-black uppercase tracking-widest border border-indigo-500/20">
                    {student.instrument}
                  </span>
                  {student.packagetype && student.packagetype !== 'avulsa' ? (
                    <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest border ${isFinished ? 'bg-red-500/10 text-red-500 border-red-500/20' : 'bg-amber-500/10 text-amber-500 border-amber-500/20'}`}>
                      <Package className="w-3.5 h-3.5" />
                      {student.packagetype}{isFinished ? ' · Expirado' : ''}
                    </span>
                  ) : (
                    <span className="px-3 py-1.5 rounded-lg text-[10px] text-gray-500 font-bold uppercase tracking-widest border border-gray-700 italic">Aula Avulsa</span>
                  )}
                  <span className="ml-auto inline-flex flex-col items-end">
                    <span className="text-lg font-black text-emerald-400 leading-none">R$ {student.lessonPrice}</span>
                    <span className="text-[9px] text-gray-500 font-bold uppercase tracking-[0.2em] mt-0.5">{student.paymentMethod}</span>
                    {(student.discountValue ?? 0) > 0 && (
                      <span className="text-[9px] text-green-400 font-black uppercase tracking-widest mt-0.5">
                        {student.discountType === 'fixed' ? `−R$ ${student.discountValue}` : `−${student.discountValue}%`} créditos
                      </span>
                    )}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2 mt-4 pt-3 border-t border-gray-800">
                  {student.status === "ativo" ? (
                    <div className="flex items-center gap-1.5 px-3 py-1 bg-green-500/10 text-green-500 rounded-full border border-green-500/20">
                      <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                      <span className="text-[10px] font-black uppercase tracking-widest">Ativo</span>
                    </div>
                  ) : student.status === "bloqueado" ? (
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="flex items-center gap-1.5 px-3 py-1 bg-orange-500/15 text-orange-400 rounded-full border border-orange-500/30">
                        <div className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
                        <span className="text-[10px] font-black uppercase tracking-widest">Inadimplente</span>
                      </div>
                      <span className="text-[9px] text-orange-400/70 font-semibold">Aulas bloqueadas por débito</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="flex items-center gap-1.5 px-3 py-1 bg-red-500/10 text-red-500 rounded-full border border-red-500/20">
                        <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
                        <span className="text-[10px] font-black uppercase tracking-widest">Inativo</span>
                      </div>
                      <button
                        onClick={() => {
                          const link = `${window.location.origin}/confirmar-aluno/${student.id}`;
                          navigator.clipboard.writeText(link);
                          showNotification("Link de ativação copiado! Envie para o aluno.", "success");
                        }}
                        className="px-2 py-1 bg-amber-500/10 text-amber-500 hover:bg-amber-500 hover:text-gray-900 border border-amber-500/30 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all"
                      >
                        Link
                      </button>
                      {student.email && (
                        <button
                          onClick={async () => {
                            const result = await resendActivationEmail(student.id);
                            if (result.success) showNotification(`E-mail de ativação reenviado para ${student.email}!`, "success");
                            else showNotification(result.error || "Erro ao reenviar e-mail.", "error");
                          }}
                          className="px-2 py-1 bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500 hover:text-white border border-indigo-500/30 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all"
                        >
                          Email
                        </button>
                      )}
                    </div>
                  )}
                  {student.expirationdate && student.packagetype !== 'avulsa' && (
                    <span className={`text-[10px] font-bold ${isFinished ? 'text-red-500' : 'text-gray-500'}`}>
                      Vence: {student.expirationdate.split('-').reverse().join('/')}
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Grid de Alunos / Tabela Estilo Studio — Desktop */}
      <div className="hidden lg:block flex-1 min-h-0 bg-gray-800/40 rounded-[2rem] border border-gray-800 shadow-2xl overflow-hidden ring-1 ring-white/5">
        <div className="h-full overflow-auto scrollbar-thin scrollbar-thumb-gray-700">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-800/60 border-b border-gray-700">
                <SortableTh columnKey="name" sort={sort} onSort={toggle} className="px-8 py-6 text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">Aluno</SortableTh>
                <th className="px-8 py-6 text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">Instrumento</th>
                <SortableTh columnKey="expirationdate" sort={sort} onSort={toggle} className="px-8 py-6 text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] text-center">Controle de Pacotes</SortableTh>
                <SortableTh columnKey="lessonPrice" sort={sort} onSort={toggle} className="px-8 py-6 text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] text-center">Financeiro</SortableTh>
                <SortableTh columnKey="status" sort={sort} onSort={toggle} className="px-8 py-6 text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] text-center">Status</SortableTh>
                <th className="px-8 py-6 text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] text-right">Painel</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/50">
              {students.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-8 py-24 text-center">
                    <div className="flex flex-col items-center gap-4 opacity-40">
                      <Users className="w-16 h-16 text-gray-600 mb-2" />
                      <p className="text-lg font-bold text-gray-400">Nenhum aluno em sua base sonora</p>
                      <p className="text-sm">Cadastre alunos para começar a gerenciar sua agenda.</p>
                    </div>
                  </td>
                </tr>
              )}
              {sortedStudents.map((student) => {
                // Comparação por string de data local — new Date('YYYY-MM-DD') vira meia-noite
                // UTC, que em UTC-3 já é a noite anterior: marcava expirado 3h cedo demais.
                const isFinished = student.expirationdate ? student.expirationdate < getLocalISODate() : false;
                
                return (
                  <tr key={student.id} className="hover:bg-amber-500/[0.02] transition-colors group">
                    <td className="px-8 py-6">
                      <button
                        type="button"
                        onClick={() => router.push(`/alunos/${student.id}`)}
                        className="flex items-center gap-4 text-left rounded-2xl -m-2 p-2 hover:bg-amber-500/5 focus:outline-none focus:ring-2 focus:ring-amber-500/40 transition-colors w-full"
                        title={`Abrir ficha de ${student.name}`}
                      >
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center text-xl font-black text-amber-500 border border-gray-700 shadow-lg group-hover:scale-110 group-hover:rotate-3 transition-all duration-500">
                          {student.name.charAt(0)}
                        </div>
                        <div>
                          <p className="font-bold text-white text-base group-hover:text-amber-500 transition-colors tracking-tight">{student.name}</p>
                          <p className="text-[10px] text-gray-500 font-medium uppercase tracking-widest">{student.email}</p>
                        </div>
                      </button>
                    </td>
                    <td className="px-8 py-6">
                       <span className="px-3 py-1.5 bg-indigo-500/10 text-indigo-400 rounded-lg text-xs font-black uppercase tracking-widest border border-indigo-500/20">
                         {student.instrument}
                       </span>
                    </td>
                    <td className="px-8 py-6 text-center">
                      {student.packagetype && student.packagetype !== 'avulsa' ? (
                        <div className="flex flex-col items-center gap-2">
                          <div className="flex items-center gap-2">
                            <Package className={`w-4 h-4 ${isFinished ? 'text-red-500' : 'text-amber-500'}`} />
                            <span className="text-xs font-black uppercase text-gray-200">{student.packagetype}</span>
                          </div>
                          {student.expirationdate && (
                             <span className={`text-[10px] font-bold ${isFinished ? 'text-red-500' : 'text-gray-500'}`}>
                               Vence: {student.expirationdate.split('-').reverse().join('/')}
                             </span>
                          )}
                          {isFinished && (
                            <span className="text-[9px] font-black text-red-500 tracking-tighter uppercase animate-pulse">Expirado</span>
                          )}
                        </div>
                      ) : (
                        <div className="text-center">
                          <span className="text-[10px] text-gray-600 font-bold uppercase tracking-widest italic opacity-50">Aula Avulsa</span>
                        </div>
                      )}
                    </td>
                    <td className="px-8 py-6 text-center">
                       <div className="inline-flex flex-col items-center">
                          <span className="text-lg font-black text-emerald-400 leading-none">R$ {student.lessonPrice}</span>
                          <span className="text-[9px] text-gray-500 font-bold uppercase tracking-[0.2em] mt-1">{student.paymentMethod}</span>
                          {(student.discountValue ?? 0) > 0 && (
                            <span className="text-[9px] text-green-400 font-black uppercase tracking-widest mt-1">
                              {student.discountType === 'fixed' ? `−R$ ${student.discountValue}` : `−${student.discountValue}%`} créditos
                            </span>
                          )}
                       </div>
                    </td>
                    <td className="px-8 py-6 text-center">
                      <div className="flex justify-center">
                        {student.status === "ativo" ? (
                          <div className="flex items-center gap-1.5 px-3 py-1 bg-green-500/10 text-green-500 rounded-full border border-green-500/20">
                            <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                            <span className="text-[10px] font-black uppercase tracking-widest">Ativo</span>
                          </div>
                        ) : student.status === "bloqueado" ? (
                          <div className="flex flex-col items-center gap-1">
                            <div className="flex items-center gap-1.5 px-3 py-1 bg-orange-500/15 text-orange-400 rounded-full border border-orange-500/30">
                              <div className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
                              <span className="text-[10px] font-black uppercase tracking-widest">Inadimplente</span>
                            </div>
                            <span className="text-[9px] text-orange-400/60 font-semibold">débito em aberto</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1.5 px-3 py-1 bg-red-500/10 text-red-500 rounded-full border border-red-500/20">
                              <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
                              <span className="text-[10px] font-black uppercase tracking-widest">Inativo</span>
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                const link = `${window.location.origin}/confirmar-aluno/${student.id}`;
                                navigator.clipboard.writeText(link);
                                showNotification("Link de ativação copiado! Envie para o aluno.", "success");
                              }}
                              className="px-2 py-1 bg-amber-500/10 text-amber-500 hover:bg-amber-500 hover:text-gray-900 border border-amber-500/30 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all"
                              title="Copiar Link de Confirmação"
                            >
                              Link
                            </button>
                            {student.email && (
                              <button
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  const result = await resendActivationEmail(student.id);
                                  if (result.success) {
                                    showNotification(`E-mail de ativação reenviado para ${student.email}!`, "success");
                                  } else {
                                    showNotification(result.error || "Erro ao reenviar e-mail.", "error");
                                  }
                                }}
                                className="px-2 py-1 bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500 hover:text-white border border-indigo-500/30 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all"
                                title="Reenviar E-mail de Ativação"
                              >
                                Email
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-8 py-6 text-right">
                      <div className="flex items-center justify-end gap-2 px-2 transition-all">
                        <button
                          onClick={() => setNotifyTarget({ student })}
                          className="p-2.5 text-gray-500 hover:text-sky-400 hover:bg-sky-500/10 rounded-xl transition-all"
                          title="Enviar aviso"
                        >
                          <Bell className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => { setGradeForm({ weekday: '1', startTime: '10:00', weeks: 'auto' }); setGradeModal({ student }); }}
                          className="p-2.5 text-gray-500 hover:text-indigo-400 hover:bg-indigo-500/10 rounded-xl transition-all"
                          title="Grade Semanal"
                        >
                          <CalendarClock className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => {
                            setFormData({
                              ...student,
                              cpf: student.cpf ? maskCPF(student.cpf) : '',
                              phone: student.phone || '',
                            });
                            setIsModalOpen(true);
                          }}
                          className="p-2.5 text-gray-500 hover:text-amber-500 hover:bg-amber-500/10 rounded-xl transition-all"
                          title="Editar Ficha"
                        >
                          <Edit3 className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => handleDelete(student.id)}
                          className="p-2.5 text-gray-500 hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-all"
                          title="Remover Aluno"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL GRADE SEMANAL */}
      {gradeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 animate-fade-in">
          <div className="bg-gray-800/95 ring-1 ring-white/10 rounded-[2rem] w-full max-w-md shadow-2xl border border-gray-700/50 p-8">
            <div className="mb-6">
              <h2 className="text-2xl font-black text-white italic uppercase tracking-tighter">
                Grade <span className="text-indigo-400">Semanal</span>
              </h2>
              <p className="text-xs text-gray-500 mt-1 font-bold uppercase tracking-widest">
                Criar aulas recorrentes para {gradeModal.student.name}
              </p>
            </div>
            <div className="space-y-5">
              <div>
                <label className="block text-[10px] font-black text-gray-500 mb-2 uppercase tracking-widest">Dia da Semana</label>
                <select
                  value={gradeForm.weekday}
                  onChange={e => setGradeForm({ ...gradeForm, weekday: e.target.value })}
                  className="w-full bg-gray-900/50 border border-gray-700/50 rounded-xl p-3.5 text-white focus:border-indigo-500/50 outline-none font-bold appearance-none cursor-pointer"
                >
                  <option value="0">Domingo</option>
                  <option value="1">Segunda-feira</option>
                  <option value="2">Terça-feira</option>
                  <option value="3">Quarta-feira</option>
                  <option value="4">Quinta-feira</option>
                  <option value="5">Sexta-feira</option>
                  <option value="6">Sábado</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-black text-gray-500 mb-2 uppercase tracking-widest">Horário de Início</label>
                <input
                  type="time"
                  value={gradeForm.startTime}
                  onChange={e => setGradeForm({ ...gradeForm, startTime: e.target.value })}
                  className="w-full bg-gray-900/50 border border-gray-700/50 rounded-xl p-3.5 text-white focus:border-indigo-500/50 outline-none font-bold"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-gray-500 mb-2 uppercase tracking-widest">Duração da Grade</label>
                <select
                  value={gradeForm.weeks}
                  onChange={e => setGradeForm({ ...gradeForm, weeks: e.target.value })}
                  className="w-full bg-gray-900/50 border border-gray-700/50 rounded-xl p-3.5 text-white focus:border-indigo-500/50 outline-none font-bold appearance-none cursor-pointer"
                >
                  <option value="auto">Mês completo</option>
                  <option value="8">2 meses (8 semanas)</option>
                  <option value="12">1 trimestre (12 semanas)</option>
                  <option value="24">1 semestre (24 semanas)</option>
                </select>
              </div>
              <p className="text-xs text-indigo-400/80 bg-indigo-500/5 p-3 rounded-xl border border-indigo-500/10">
                As aulas serão criadas a partir da próxima ocorrência do dia selecionado, sem conflito com aulas já existentes.
              </p>
            </div>
            <div className="flex gap-3 mt-8">
              <button
                onClick={() => setGradeModal(null)}
                className="flex-1 px-4 py-3 text-sm font-bold text-gray-400 hover:text-white bg-gray-700/50 rounded-xl hover:bg-gray-700 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleGrade}
                disabled={savingGrade}
                className="flex-1 px-4 py-3 text-sm font-black text-gray-900 bg-indigo-500 hover:bg-indigo-400 rounded-xl transition-all disabled:opacity-50 shadow-[0_0_15px_rgba(99,102,241,0.2)]"
              >
                {savingGrade ? 'Criando...' : 'Criar Grade'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL REFINADO - ESTILO STUDIO */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/90 animate-fade-in">
          <div className="bg-gray-800/95 ring-1 ring-white/10 rounded-[2.5rem] w-full max-w-2xl shadow-[0_0_100px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col max-h-[95vh] border border-gray-700/50">
            <div className="px-10 py-8 border-b border-gray-700/50 bg-gradient-to-r from-gray-800 to-gray-800/50 flex justify-between items-center">
              <div>
                <h2 className="text-3xl font-black text-white italic uppercase tracking-tighter">
                  {formData.id ? 'Editar' : 'Novo'} <span className="text-amber-500">Aluno</span>
                </h2>
                <p className="text-xs text-gray-500 mt-1 font-bold uppercase tracking-widest">Sintonize os dados do aluno</p>
              </div>
              <button 
                onClick={() => setIsModalOpen(false)} 
                className="hover:rotate-90 transition-all duration-300 text-gray-500 hover:text-white bg-gray-700/50 p-3 rounded-2xl"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>
            
            <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-10 space-y-8 scrollbar-thin scrollbar-thumb-gray-700">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Nome */}
                <div className="md:col-span-2 group">
                  <label className="flex items-center gap-2 text-[10px] font-black text-gray-500 mb-3 uppercase tracking-[0.2em] group-focus-within:text-amber-500 transition-colors">
                    <Users className="w-3 h-3" /> Nome Completo
                  </label>
                  <input type="text" required value={formData.name || ""} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full bg-gray-900/50 border border-gray-700/50 rounded-2xl p-4 text-white focus:bg-gray-900 focus:border-amber-500/50 focus:ring-8 focus:ring-amber-500/5 outline-none transition-all placeholder-gray-700 font-bold tracking-tight" placeholder="Ex: Jimmy Page"/>
                </div>

                {/* Email */}
                <div className="group">
                  <label className="block text-[10px] font-black text-gray-500 mb-3 uppercase tracking-[0.2em] group-focus-within:text-amber-500 transition-colors">Email</label>
                  <input type="email" value={formData.email || ""} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full bg-gray-900/50 border border-gray-700/50 rounded-2xl p-4 text-white focus:bg-gray-900 focus:border-amber-500/50 outline-none transition-all font-bold" placeholder="Ex: aluno@email.com"/>
                </div>

                {/* CPF */}
                <div className="group">
                  <label className="block text-[10px] font-black text-gray-500 mb-3 uppercase tracking-[0.2em] group-focus-within:text-amber-500 transition-colors">CPF</label>
                  <input type="text" value={formData.cpf || ""} onChange={e => setFormData({...formData, cpf: maskCPF(e.target.value)})} className="w-full bg-gray-900/50 border border-gray-700/50 rounded-2xl p-4 text-white focus:bg-gray-900 focus:border-amber-500/50 outline-none transition-all font-bold" placeholder="000.000.000-00"/>
                </div>

                {/* Telefone */}
                <div className="group">
                  <label className="block text-[10px] font-black text-gray-500 mb-3 uppercase tracking-[0.2em] group-focus-within:text-amber-500 transition-colors">Telefone</label>
                  <PhoneInput
                    value={formData.phone || ""}
                    onChange={v => setFormData({ ...formData, phone: v })}
                    selectClassName="bg-gray-900/50 border border-gray-700/50 rounded-2xl p-4 text-white focus:bg-gray-900 focus:border-amber-500/50 outline-none transition-all font-bold"
                    inputClassName="w-full bg-gray-900/50 border border-gray-700/50 rounded-2xl p-4 text-white focus:bg-gray-900 focus:border-amber-500/50 outline-none transition-all font-bold"
                    placeholder="Ex: (11) 99999-0000"
                  />
                </div>

                {/* Instrumento */}
                <div className="group">
                  <label className="block text-[10px] font-black text-gray-500 mb-3 uppercase tracking-[0.2em] group-focus-within:text-amber-500 transition-colors">Instrumento</label>
                  <select required value={formData.instrument || ""} onChange={e => setFormData({...formData, instrument: e.target.value})} className="w-full bg-gray-900/50 border border-gray-700/50 rounded-2xl p-4 text-white focus:bg-gray-900 focus:border-amber-500/50 outline-none transition-all appearance-none cursor-pointer font-bold capitalize">
                    {dynamicInstruments.map(inst => (
                      <option key={inst} value={inst}>{inst}</option>
                    ))}
                  </select>
                </div>

                {/* Status */}
                <div className="group">
                  <label className="block text-[10px] font-black text-gray-500 mb-3 uppercase tracking-[0.2em] group-focus-within:text-amber-500 transition-colors">Status da Matrícula</label>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setFormData({...formData, status: 'ativo'})} className={`flex-1 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${formData.status === 'ativo' ? 'bg-green-500/20 text-green-400 border border-green-500/30 shadow-[0_0_15px_rgba(34,197,94,0.1)]' : 'bg-gray-900/50 text-gray-600 border border-gray-700/50'}`}>Ativo</button>
                    <button type="button" onClick={() => setFormData({...formData, status: 'inativo'})} className={`flex-1 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${formData.status === 'inativo' ? 'bg-red-500/20 text-red-100 border border-red-500/30' : 'bg-gray-900/50 text-gray-600 border border-gray-700/50'}`}>Inativo</button>
                  </div>
                </div>

                {/* CONTROLE DE PACOTES */}
                <div className="md:col-span-2 p-6 bg-amber-500/[0.03] rounded-3xl border border-amber-500/10 space-y-6">
                  <div className="flex items-center gap-2 mb-2">
                    <Package className="w-4 h-4 text-amber-500" />
                    <h3 className="text-xs font-black text-amber-500 uppercase tracking-widest">Controle de Pacotes</h3>
                  </div>
                  <div className="grid grid-cols-2 gap-6">
                    <div className="group">
                      <label className="block text-[9px] font-black text-gray-600 mb-2 uppercase tracking-widest">Tipo de Plano</label>
                      <select value={formData.packagetype || "avulsa"} onChange={e => setFormData({...formData, packagetype: e.target.value})} className="w-full bg-gray-950 border border-gray-800 rounded-xl p-3 text-white focus:border-amber-500/50 outline-none font-black text-center cursor-pointer appearance-none capitalize">
                        <option value="avulsa">Avulsa</option>
                        <option value="mensal">Mensal</option>
                        <option value="trimestral">Trimestral</option>
                        <option value="semestral">Semestral</option>
                      </select>
                    </div>
                    <div className="group">
                      <label className="block text-[9px] font-black text-gray-600 mb-2 uppercase tracking-widest">Vencimento</label>
                      <input type="date" value={formData.expirationdate || ""} onChange={e => setFormData({...formData, expirationdate: e.target.value})} className="w-full bg-gray-950 border border-gray-800 rounded-xl p-3 text-white focus:border-amber-500/50 outline-none font-black text-center"/>
                    </div>
                  </div>
                </div>
                {/* Valor e Pagamento */}
                <div className="group">
                  <label className="block text-[10px] font-black text-gray-500 mb-3 uppercase tracking-[0.2em] group-focus-within:text-emerald-500 transition-colors">Valor Base (R$)</label>
                  <input type="number" required value={formData.lessonPrice || ""} onChange={e => setFormData({...formData, lessonPrice: Number(e.target.value)})} className="w-full bg-gray-900/50 border border-gray-700/50 rounded-2xl p-4 text-white focus:bg-gray-900 focus:border-emerald-500/50 outline-none transition-all font-black"/>
                </div>
                <div className="group">
                  <label className="block text-[10px] font-black text-gray-500 mb-3 uppercase tracking-[0.2em] group-focus-within:text-amber-500 transition-colors">Forma de Recebimento</label>
                  <select required value={formData.paymentMethod || ""} onChange={e => setFormData({...formData, paymentMethod: e.target.value as PaymentMethod})} className="w-full bg-gray-900/50 border border-gray-700/50 rounded-2xl p-4 text-white focus:bg-gray-900 focus:border-amber-500/50 outline-none font-bold">
                    <option value="Pix">Pix</option>
                    <option value="Dinheiro">Dinheiro</option>
                    <option value="Cartão">Cartão</option>
                    <option value="Transferência">Banco / Transferência</option>
                  </select>
                </div>

                {/* DESCONTO EM COMPRAS DE CRÉDITOS */}
                <div className="md:col-span-2 p-6 bg-green-500/[0.03] rounded-3xl border border-green-500/10 space-y-6">
                  <div className="flex items-center gap-2 mb-2">
                    <BadgePercent className="w-4 h-4 text-green-400" />
                    <h3 className="text-xs font-black text-green-400 uppercase tracking-widest">Desconto em Compras de Créditos</h3>
                  </div>
                  <div className="grid grid-cols-2 gap-6">
                    <div className="group">
                      <label className="block text-[9px] font-black text-gray-600 mb-2 uppercase tracking-widest">Tipo de Desconto</label>
                      <select value={formData.discountType || "percent"} onChange={e => setFormData({...formData, discountType: e.target.value as "percent" | "fixed"})} className="w-full bg-gray-950 border border-gray-800 rounded-xl p-3 text-white focus:border-green-500/50 outline-none font-black text-center cursor-pointer appearance-none">
                        <option value="percent">Percentual (%)</option>
                        <option value="fixed">Valor fixo (R$)</option>
                      </select>
                    </div>
                    <div className="group">
                      <label className="block text-[9px] font-black text-gray-600 mb-2 uppercase tracking-widest">{(formData.discountType || "percent") === "percent" ? "Desconto (%)" : "Desconto (R$)"}</label>
                      <input type="number" min={0} max={(formData.discountType || "percent") === "percent" ? 100 : undefined} step="0.01" value={formData.discountValue ?? ""} onChange={e => setFormData({...formData, discountValue: e.target.value === "" ? 0 : Number(e.target.value)})} className="w-full bg-gray-950 border border-gray-800 rounded-xl p-3 text-white focus:border-green-500/50 outline-none font-black text-center" placeholder="0"/>
                    </div>
                  </div>
                  <p className="text-xs text-green-400/70 bg-green-500/5 p-3 rounded-xl border border-green-500/10">
                    Aplicado automaticamente sobre o preço dos pacotes quando este aluno comprar créditos. Deixe 0 para preço normal.
                  </p>
                </div>
            </div>

              {/* Botões do form */}
              <div className="pt-10 mt-6 border-t border-gray-700/50 flex flex-col-reverse sm:flex-row justify-end gap-4">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-8 py-4 text-xs font-black uppercase tracking-widest text-gray-500 hover:text-white transition-all">
                  Descartar Alterações
                </button>
                <button type="submit" className="px-12 py-4 bg-amber-500 hover:bg-amber-400 text-gray-900 text-xs font-black rounded-2xl shadow-xl shadow-amber-500/20 active:scale-95 transition-all uppercase tracking-widest">
                  Gravar Dados
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL AVISO MANUAL (individual ou para todos) */}
      <NotificationComposer
        open={notifyTarget !== null}
        onClose={() => setNotifyTarget(null)}
        heading={notifyTarget?.student ? `Avisar ${notifyTarget.student.name}` : 'Avisar todos os alunos'}
        subheading={
          notifyTarget?.student
            ? (notifyTarget.student.email || 'Sem e-mail cadastrado')
            : `${activeStudentsCount} aluno(s) ativo(s) receberão este aviso`
        }
        onSend={handleSendNotification}
      />
    </div>
  );
}
