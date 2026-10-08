"use client";

import { useState, useMemo, useCallback, FormEvent, useEffect, useRef, memo } from "react";
import Link from "next/link";
import Button from "@/components/ui/Button";
import PhoneInput from "@/components/ui/PhoneInput";
import { getWeekDates, getLocalISODate, maskCPF } from "@/lib/utils";
import { Lesson, Instrument } from "@/types/lesson";
import { useAppContext } from "../AppContext";
import { fetchAgendaLessons, createAgendaLesson, updateAgendaLesson, deleteAgendaLesson, deleteAgendaLessonScope, countAgendaLessonsForDelete, fetchAgendaStudents, createAgendaStudent, autoCreatePaymentForLesson, rescheduleLessonByTeacher, releaseLessonForStudentReschedule, fetchBlockedSlots, fetchAgendaMeta, createBlockedSlot, deleteBlockedSlot, deleteBlockedSlotSeries, fetchDaysOff, toggleDayOff } from "./actions";
import type { DeleteLessonScope } from "./actions";
import { CheckCircle, AlertCircle, RefreshCw, Lock, Trash2, CalendarOff, AlertTriangle, UserCheck } from "lucide-react";
import { isOverdueCancelNote, isOverduePayment, normalizeStudentName } from "@/lib/lesson-cancel-reasons";

const HOURS_LIST = Array.from({ length: 31 }, (_, i) => {
  const h = Math.floor(i / 2) + 8;
  const m = (i % 2) * 30;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}); // 08:00 to 23:00

const HOURS = Array.from({ length: 16 }, (_, i) => i + 8); // For grid rendering

function countWeekdayOccurrencesInMonth(dateStr: string): number {
  const start = new Date(dateStr + 'T12:00:00');
  const month = start.getMonth();
  let count = 0;
  const cursor = new Date(start);
  while (cursor.getMonth() === month) {
    count++;
    cursor.setDate(cursor.getDate() + 7);
  }
  return count;
}

// Dia da semana por extenso de uma data ISO, lida ao meio-dia para não
// escorregar de fuso. Nomeia a série no modal de exclusão ("as próximas de
// terça às 15:00"), que é como o professor enxerga a recorrência.
function weekdayLabel(iso?: string): string {
  if (!iso) return '';
  const names = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  return names[new Date(`${iso}T12:00:00`).getDay()] || '';
}

// Componente isolado para a linha "agora" — só ele re-renderiza a cada minuto
const NowLine = memo(function NowLine({ weekDatesStr }: { weekDatesStr: string[] }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(id);
  }, []);

  const localRealToday = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const isThisWeek = weekDatesStr.includes(localRealToday);
  if (!isThisWeek || now.getHours() < 8) return null;

  const topPx = ((now.getHours() + now.getMinutes() / 60) - 8) * 80;
  const timeLabel = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  return (
    <div
      className="absolute pointer-events-none z-30"
      style={{ top: `${topPx}px`, left: '12.5%', right: 0 }}
    >
      <div className="absolute left-0 right-0 border-t-2 border-red-400/80" />
      <div className="absolute -left-3 -top-[7px] flex items-center gap-1.5">
        <span className="relative flex h-3.5 w-3.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-red-500" />
        </span>
        <span className="text-[10px] font-bold text-red-400 bg-gray-900/90 px-1.5 py-0.5 rounded-full border border-red-500/30 leading-none">
          {timeLabel}
        </span>
      </div>
    </div>
  );
});

// Fundo estático da grade (linhas de hora + colunas dos dias). Não depende de
// nenhum estado da página, mas ficava inline no AgendaPage — que re-renderiza a
// cada tecla digitada em qualquer modal — recriando ~130 elementos toda vez.
// Com memo (sem props) o React pula a subárvore inteira.
const HourGridBackground = memo(function HourGridBackground() {
  return (
    <div className="w-full absolute inset-0 grid grid-rows-[repeat(16,minmax(64px,1fr))] md:grid-rows-[repeat(16,minmax(80px,1fr))]">
      {HOURS.map((h) => (
        <div key={h} className="border-b border-gray-700/50 w-full grid grid-cols-8 relative">
          <div className="col-span-1 border-r border-gray-700 p-2">
            <span className="text-xs text-gray-500 block text-right pr-2">
              {h.toString().padStart(2, '0')}:00
            </span>
            <span className="text-[10px] text-gray-600/70 block text-right pr-2 mt-3 md:mt-5">
              {h.toString().padStart(2, '0')}:30
            </span>
          </div>
          {/* Linha pontilhada na metade (representa o slot de :30) */}
          <div className="absolute left-[12.5%] right-0 top-1/2 border-t border-dashed border-gray-700/30 pointer-events-none" />
          {/* Colunas vazias para compor a grade perfeitamente */}
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className={`col-span-1 border-r border-gray-700/50 ${i === 6 ? 'border-transparent' : ''}`} />
          ))}
        </div>
      ))}
    </div>
  );
});

/**
 * Posição vertical de um bloco na grade (16 linhas de 80px, 08:00–24:00).
 * Recorta contra a janela visível em vez de descartar o bloco inteiro: uma aula
 * ou bloqueio que começa antes das 08:00 sumia da grade, mas continuava valendo
 * na checagem de conflito, e o professor não via por que o horário estava ocupado.
 * Devolve null quando o bloco cai totalmente fora da janela.
 */
function getBlockGeometry(startTime: string, endTime: string): { top: number; height: number } | null {
  const [startH, startM] = startTime.split(":").map(Number);
  const [endH, endM] = endTime.split(":").map(Number);
  if ([startH, startM, endH, endM].some(Number.isNaN)) return null;

  const rawTop = ((startH + startM / 60) - 8) * 80;
  const rawBottom = ((endH + endM / 60) - 8) * 80;
  if (rawBottom <= 0 || rawTop >= 16 * 80) return null;

  const top = Math.max(0, rawTop);
  const height = Math.min(16 * 80, rawBottom) - top;
  if (height <= 0) return null;

  return { top, height };
}

export default function AgendaPage() {
  const {
    lessons: allLessons, setLessons: setAllLessons,
    students: mockStudents, setStudents,
    payments, teacherProfile, instruments: contextInstruments,
    isRangeLoaded, ensureRangeLoaded, reloadLoadedLessons, refreshPayments,
  } = useAppContext();
  const [recurrenceWeeks, setRecurrenceWeeks] = useState(1);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll para o horário atual ao montar
  useEffect(() => {
    if (scrollRef.current) {
      const currentHour = new Date().getHours();
      const scrollToHour = Math.max(currentHour - 8, 0);
      const targetScroll = scrollToHour * 80 - scrollRef.current.clientHeight / 3;
      scrollRef.current.scrollTo({ top: Math.max(targetScroll, 0), behavior: "smooth" });
    }
  }, []);

  const [currentDate, setCurrentDate] = useState(new Date());

  // Custom Date Picker State no formato Dark Bubble
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [pickerDate, setPickerDate] = useState(new Date());

  const [selectedDateStr, setSelectedDateStr] = useState<string>(
    getLocalISODate(new Date())
  );

  // Estados do Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingLesson, setEditingLesson] = useState<Lesson | null>(null);
  const [formData, setFormData] = useState<Partial<Lesson>>({});
  const [isSaving, setIsSaving] = useState(false);

  // Liberação da aula para o próprio aluno remarcar (painel dentro do modal)
  const [showReleaseConfirm, setShowReleaseConfirm] = useState(false);
  const [releaseReason, setReleaseReason] = useState('');
  const [isReleasing, setIsReleasing] = useState(false);

  // Remarcação dentro do modal Editar Aula (quando Status = "Remarcada")
  const [remarcarNovaData, setRemarcarNovaData] = useState('');
  const [remarcarNovoHorario, setRemarcarNovoHorario] = useState('');
  const [remarcarMotivo, setRemarcarMotivo] = useState('');

  // Estados do Modal de Remarcação pelo Professor (modal separado)
  const [rescheduleLesson, setRescheduleLesson] = useState<Lesson | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleStartTime, setRescheduleStartTime] = useState('');
  const [rescheduleReason, setRescheduleReason] = useState('');
  const [isRescheduling, setIsRescheduling] = useState(false);

  const rescheduleEndTime = useMemo(() => {
    if (!rescheduleStartTime) return '';
    const [h, m] = rescheduleStartTime.split(':').map(Number);
    const total = h * 60 + m + 50;
    return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  }, [rescheduleStartTime]);

  const handleRescheduleByTeacher = async () => {
    if (!rescheduleLesson || !rescheduleDate || !rescheduleStartTime) return;
    // Guarda: aula ainda não sincronizada com o banco (id temporário/otimista)
    if (!rescheduleLesson.id || rescheduleLesson.id.startsWith('temp-')) {
      showNotification('Esta aula ainda está sincronizando. Atualize a página e tente novamente.', 'error');
      return;
    }
    setIsRescheduling(true);
    const res = await rescheduleLessonByTeacher(rescheduleLesson.id, rescheduleDate, rescheduleStartTime, rescheduleEndTime, rescheduleReason);
    if (res.success) {
      // Sincroniza com o banco: original vira "remarcada" e a nova aula recebe
      // id real. Recarrega só a janela já carregada — buscar o histórico
      // inteiro aqui anularia a janela logo na primeira remarcação.
      await reloadLoadedLessons();
      if (res.warning) {
        showNotification(res.warning, 'error');
      } else {
        showNotification('Aula remarcada com sucesso! O aluno foi notificado.', 'success');
      }
      setRescheduleLesson(null);
    } else {
      showNotification(res.error || 'Erro ao remarcar aula.', 'error');
    }
    setIsRescheduling(false);
  };

  // Estados de Horários Bloqueados
  const [blockedSlots, setBlockedSlots] = useState<{ id: string; date: string; starttime: string; endtime: string; reason?: string }[]>([]);
  const [isBlockModalOpen, setIsBlockModalOpen] = useState(false);
  const [blockForm, setBlockForm] = useState({ date: '', starttime: '08:00', endtime: '09:00', reason: '', wholeDay: false, wholeWeek: false, repeatWeeks: 1 });
  const [isSavingBlock, setIsSavingBlock] = useState(false);

  // Estados de Folgas Semanais
  const [daysOff, setDaysOff] = useState<{ id: string; day_of_week: number; reason?: string }[]>([]);
  const [isDaysOffModalOpen, setIsDaysOffModalOpen] = useState(false);
  const [daysOffReason, setDaysOffReason] = useState('');

  const openBlockModal = (dateOverride?: string, timeOverride?: string) => {
    const start = timeOverride || '10:00';
    const [h, m] = start.split(':').map(Number);
    const total = h * 60 + m + 60;
    const endtime = `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
    setBlockForm({ date: dateOverride || selectedDateStr, starttime: start, endtime, reason: '', wholeDay: false, wholeWeek: false, repeatWeeks: 1 });
    setIsBlockModalOpen(true);
  };

  const handleSaveBlock = async () => {
    setIsSavingBlock(true);
    const starttime = blockForm.wholeDay ? '00:00' : blockForm.starttime;
    const endtime = blockForm.wholeDay ? '23:59' : blockForm.endtime;
    const res = await createBlockedSlot({
      date: blockForm.wholeWeek ? undefined : blockForm.date,
      starttime,
      endtime,
      reason: blockForm.reason || undefined,
      wholeWeek: blockForm.wholeWeek,
      weekDates: blockForm.wholeWeek ? weekDatesStr : undefined,
      repeatWeeks: blockForm.wholeWeek ? undefined : blockForm.repeatWeeks,
    });
    if (res.success && res.slots) {
      setBlockedSlots(prev => [...prev, ...res.slots!]);
      const n = res.slots.length;
      showNotification(
        blockForm.wholeWeek ? 'Semana inteira bloqueada.'
          : n > 1 ? `${n} bloqueios criados (repetição semanal).`
          : blockForm.wholeDay ? 'Dia inteiro bloqueado.'
          : 'Horário bloqueado.',
        'success'
      );
      setIsBlockModalOpen(false);
    } else {
      showNotification(res.error || 'Erro ao bloquear horário.', 'error');
    }
    setIsSavingBlock(false);
  };

  // Bloqueio selecionado para exclusão — abre o modal de escolha (só este dia
  // ou a série inteira) em vez de apagar direto no clique.
  const [blockToDelete, setBlockToDelete] = useState<{ id: string; date: string; starttime: string; endtime: string; reason?: string } | null>(null);
  const [isDeletingBlock, setIsDeletingBlock] = useState(false);

  const handleDeleteBlockChoice = async (scope: 'this' | 4 | 12 | 24) => {
    if (!blockToDelete) return;
    setIsDeletingBlock(true);
    if (scope === 'this') {
      const ok = await deleteBlockedSlot(blockToDelete.id);
      if (ok) {
        setBlockedSlots(prev => prev.filter(b => b.id !== blockToDelete.id));
        showNotification('Bloqueio removido.', 'success');
      } else {
        showNotification('Erro ao remover bloqueio.', 'error');
      }
    } else {
      const res = await deleteBlockedSlotSeries({
        date: blockToDelete.date,
        starttime: blockToDelete.starttime,
        endtime: blockToDelete.endtime,
        reason: blockToDelete.reason,
        weeks: scope,
      });
      if (res.success) {
        const idsSet = new Set(res.deletedIds || []);
        setBlockedSlots(prev => prev.filter(b => !idsSet.has(b.id)));
        showNotification(`${res.deletedIds?.length || 0} bloqueio(s) removido(s).`, 'success');
      } else {
        showNotification(res.error || 'Erro ao remover bloqueios.', 'error');
      }
    }
    setIsDeletingBlock(false);
    setBlockToDelete(null);
  };

  // Usado pelo "Liberar horário" da aula cancelada por inadimplência.
  const [isDeletingLessonId, setIsDeletingLessonId] = useState<string | null>(null);
  const removeLesson = async (lessonId: string, confirmMsg: string, okMsg: string, errMsg: string) => {
    if (!window.confirm(confirmMsg)) return;
    setIsDeletingLessonId(lessonId);
    const ok = await deleteAgendaLesson(lessonId);
    if (ok) {
      setAllLessons(prev => prev.filter(l => l.id !== lessonId));
      showNotification(okMsg, 'success');
    } else {
      showNotification(errMsg, 'error');
    }
    setIsDeletingLessonId(null);
  };

  // Exclusão com escopo, no espírito do Google Agenda. Antes só dava para
  // apagar aula por aula: quando o aluno mudava de dia, a recorrência antiga
  // inteira tinha que ser removida uma a uma. Os números de cada opção vêm do
  // servidor antes de confirmar — ninguém apaga um trimestre às cegas.
  const [lessonToDelete, setLessonToDelete] = useState<Lesson | null>(null);
  const [deleteCounts, setDeleteCounts] = useState<{ following: number; student: number } | null>(null);
  const [isDeletingScope, setIsDeletingScope] = useState(false);
  // Gerar crédito de reposição antes de excluir a série (aluno mudou de horário)
  const [generateCreditOnDelete, setGenerateCreditOnDelete] = useState(false);

  const openDeleteLesson = (lesson: Lesson) => {
    setLessonToDelete(lesson);
    setDeleteCounts(null);
    setGenerateCreditOnDelete(false);
    countAgendaLessonsForDelete(lesson.id).then(setDeleteCounts);
  };

  const handleDeleteLessonScope = async (scope: DeleteLessonScope) => {
    if (!lessonToDelete) return;
    setIsDeletingScope(true);

    // Quando o professor pede reposição + exclui em lote, a aula clicada
    // vira 'remarcada' com crédito gerado ANTES das demais serem apagadas.
    // Se releaseLessonForStudentReschedule falhar, a exclusão continua —
    // melhor perder o crédito do que não excluir a série.
    if (generateCreditOnDelete && scope !== 'this') {
      const creditRes = await releaseLessonForStudentReschedule(lessonToDelete.id);
      if (!creditRes.success) {
        showNotification(creditRes.error || 'Não foi possível gerar o crédito de reposição.', 'error');
        setIsDeletingScope(false);
        return;
      }
    }

    const res = await deleteAgendaLessonScope(lessonToDelete.id, scope);
    if (res.success) {
      const idsSet = new Set(res.deletedIds);
      setAllLessons(prev => prev.filter(l => !idsSet.has(l.id)));
      const creditMsg = generateCreditOnDelete && scope !== 'this' ? ' Crédito de reposição gerado.' : '';
      showNotification(
        (res.deletedIds.length > 1 ? `${res.deletedIds.length} aulas excluídas.` : 'Aula excluída.') + creditMsg,
        'success'
      );
      setLessonToDelete(null);
    } else {
      showNotification(res.error || 'Erro ao excluir a aula.', 'error');
    }
    setIsDeletingScope(false);
  };

  // A aula em atraso não é editável na grade, então esta é a única saída para
  // devolver o horário: some da agenda e o slot fica livre para outro aluno.
  const handleReleaseOverdueSlot = (lesson: Lesson) => removeLesson(
    lesson.id,
    `Liberar o horário de ${lesson.studentName}? A aula cancelada some da agenda e o horário fica livre para outro aluno.`,
    'Horário liberado.',
    'Erro ao liberar o horário.'
  );

  const handleToggleDayOff = async (dayIndex: number) => {
    const isOff = daysOff.some(d => d.day_of_week === dayIndex);
    const ok = await toggleDayOff(dayIndex, !isOff, daysOffReason || undefined);
    if (ok) {
      // Recarrega do banco para garantir sincronismo
      fetchDaysOff().then(setDaysOff);
    } else {
      showNotification('Erro ao salvar folga. Verifique se a tabela foi criada no Supabase.', 'error');
    }
  };

  // Estados do Cadastro Rápido de Aluno
  const [isNewStudentModalOpen, setIsNewStudentModalOpen] = useState(false);
  const [newStudentData, setNewStudentData] = useState<any>({ name: "", phone: "", email: "", cpf: "", instrument: "Violão", packagetype: "avulsa", expirationdate: "", lessonprice: "" });
  const [isSavingStudent, setIsSavingStudent] = useState(false);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showNotification = (message: string, type: 'success' | 'error') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  };

  // Dados do professor e instrumentos vêm do AppContext — sem server action extra
  const activeTeacherName = teacherProfile?.name || teacherProfile?.fname || "Professor(a)";
  const dynamicInstruments = contextInstruments.length ? contextInstruments : ["violao", "guitarra"];

  const weekDatesStr = useMemo(() => getWeekDates(currentDate), [currentDate]);

  // Folga semanal da data (day_of_week segue getDay(): 0=Dom..6=Sáb)
  const getDayOff = (dateStr: string) =>
    daysOff.find(d => d.day_of_week === new Date(dateStr + "T12:00:00").getDay());

  // Alunos com pagamento em atraso — mesma régua do Financeiro (vencido, ou
  // pendente com vencimento no passado) mais o bloqueio por inadimplência.
  // Pagamentos e alunos já vêm no contexto: nenhuma busca extra.
  const overdueStudentNames = useMemo(() => {
    const todayIso = getLocalISODate(new Date());
    const names = new Set<string>();
    for (const p of payments) {
      // `Payment.date` da UI é o duedate do banco (ver mapPayments).
      if (isOverduePayment({ status: p.status, duedate: p.date }, todayIso)) {
        names.add(normalizeStudentName(p.studentName));
      }
    }
    for (const s of mockStudents) {
      if (s.status === 'bloqueado') names.add(normalizeStudentName(s.name));
    }
    return names;
  }, [payments, mockStudents]);

  /**
   * Aula cancelada automaticamente pela inadimplência de um aluno que continua
   * devendo. Ela some da grade quando o aluno quita (vira cancelamento comum),
   * que é o momento em que o horário deve mesmo voltar a ficar livre.
   */
  const isOverdueLesson = useCallback((l: Lesson) =>
    l.status === "cancelada"
    && isOverdueCancelNote(l.notes)
    && overdueStudentNames.has(normalizeStudentName(l.studentName)),
    [overdueStudentNames]
  );

  // Canceladas e remarcadas ficam fora da grade — o horário volta a aparecer
  // livre, que é o que ele de fato está (nenhuma das duas segura o slot no
  // checkOverlap). O registro continua no banco: é ele que ancora o crédito de
  // reposição (credit.origin_lesson_fk) e o histórico da remarcação.
  // Exceção: as canceladas por inadimplência de quem ainda deve continuam
  // visíveis (em rosé) e continuam ocupando o horário, para o professor
  // enxergar a agenda futura em vez de ver o slot sumir.
  const weeklyLessons = useMemo(() => {
    return allLessons.filter(l => weekDatesStr.includes(l.date) && l.status !== "cancelada" && l.status !== "remarcada");
  }, [allLessons, weekDatesStr]);

  const weeklyOverdueLessons = useMemo(() => {
    return allLessons.filter(l => weekDatesStr.includes(l.date) && isOverdueLesson(l));
  }, [allLessons, weekDatesStr, isOverdueLesson]);

  // Folgas só precisam ser buscadas junto com os bloqueios da PRIMEIRA semana.
  const metaLoadedRef = useRef(false);

  useEffect(() => {
    if (!weekDatesStr.length) return;
    let cancelled = false;

    if (!metaLoadedRef.current) {
      // Abertura: bloqueios + folgas numa server action só (as do cliente rodam
      // em fila). As folgas independem da semana, então são aplicadas mesmo se
      // esta execução do efeito já foi cancelada.
      metaLoadedRef.current = true;
      fetchAgendaMeta(weekDatesStr).then(({ blockedSlots: slots, daysOff: off }) => {
        setDaysOff(off);
        if (!cancelled) setBlockedSlots(slots);
      });
    } else {
      fetchBlockedSlots(weekDatesStr).then(slots => {
        if (!cancelled) setBlockedSlots(slots);
      });
    }

    // As aulas em memória cobrem uma janela (ver lib/lesson-window.ts: 2 meses atrás a 7 à frente).
    // Navegar para fora dela busca só a semana pedida, sob demanda.
    const [from, to] = [weekDatesStr[0], weekDatesStr[weekDatesStr.length - 1]];
    if (isRangeLoaded(from, to)) return;

    // O estado de "semana carregando" (isWeekLoading) foi removido: nada o lia,
    // então cada navegação para fora da janela só gerava dois re-renders da
    // página inteira à toa. A grade segue mostrando o que já está em memória
    // até a busca terminar.
    ensureRangeLoaded(from, to);

    return () => { cancelled = true; };
  }, [weekDatesStr, isRangeLoaded, ensureRangeLoaded]);

  // Carrega folgas do banco ao ABRIR o modal de folgas.
  // Antes a dependência era o booleano cru, então refazia a busca também ao fechar.
  // A carga da MONTAGEM não é feita aqui: vem junto com os bloqueios, numa server
  // action só (fetchAgendaMeta, no efeito da semana acima) — por isso a 1ª
  // execução deste efeito é pulada.
  const daysOffMountHandledRef = useRef(false);
  useEffect(() => {
    if (!daysOffMountHandledRef.current) {
      daysOffMountHandledRef.current = true;
      return;
    }
    if (isDaysOffModalOpen === false && daysOff.length) return;
    fetchDaysOff().then(setDaysOff);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDaysOffModalOpen]);

  // Mesma régua da grade semanal: remarcada e cancelada saem da lista do dia.
  const selectedDayLessons = useMemo(() => {
    return allLessons
      .filter((l) => l.date === selectedDateStr
        && l.status !== "remarcada"
        && (l.status !== "cancelada" || isOverdueLesson(l)))
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [allLessons, selectedDateStr, isOverdueLesson]);

  // Navegação
  const handlePrevWeek = () => {
    const d = new Date(currentDate);
    d.setDate(d.getDate() - 7);
    setCurrentDate(d);
  };

  const handleNextWeek = () => {
    const d = new Date(currentDate);
    d.setDate(d.getDate() + 7);
    setCurrentDate(d);
  };

  const handleToday = () => {
    const today = new Date();
    setCurrentDate(today);
    setSelectedDateStr(getLocalISODate(today));
  };

  // Funções do Pseudo-Date-Picker
  const handleOpenDatePicker = () => {
    setPickerDate(new Date(currentDate));
    setShowDatePicker(!showDatePicker);
  };

  const jumpToDate = (day: number) => {
    const d = new Date(pickerDate.getFullYear(), pickerDate.getMonth(), day, 12, 0, 0);
    setCurrentDate(d);
    setSelectedDateStr(getLocalISODate(d));
    setShowDatePicker(false);
  };

  const pickerDaysInMonth = new Date(pickerDate.getFullYear(), pickerDate.getMonth() + 1, 0).getDate();
  const pickerFirstDay = new Date(pickerDate.getFullYear(), pickerDate.getMonth(), 1).getDay(); // 0 is Sunday
  const daysArray = Array.from({ length: pickerDaysInMonth }, (_, i) => i + 1);

  // Helpers
  const calculateEndTime = (startTime: string) => {
    const [h, m] = startTime.split(":").map(Number);
    if (isNaN(h) || isNaN(m)) return "";
    const totalMinutes = h * 60 + m + 50;
    const endH = Math.floor(totalMinutes / 60) % 24;
    const endM = totalMinutes % 60;
    return `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;
  };

  // Funções do Modal
  const openNewLessonModal = (dateOverride?: string, timeOverride?: string) => {
    setEditingLesson(null);
    const start = timeOverride || "10:00";
    setFormData({
      date: dateOverride || selectedDateStr,
      startTime: start,
      endTime: calculateEndTime(start),
      status: "agendada",
      // Default casado com o aluno default logo abaixo (mockStudents[0]) — o
      // primeiro instrumento da lista raramente é o do aluno e gerava aulas
      // gravadas com instrumento errado quando o professor não mexia no select.
      instrument: ((mockStudents[0]?.instrument || dynamicInstruments[0] || "violao") as Instrument),
      teacherName: activeTeacherName,
      studentName: mockStudents.length > 0 ? mockStudents[0].name : "Aluno Indefinido"
    });
    setRecurrenceWeeks(1);
    setIsModalOpen(true);
  };

  const openEditLessonModal = (lesson: Lesson) => {
    setEditingLesson(lesson);
    setFormData({ ...lesson, endTime: calculateEndTime(lesson.startTime) });
    setRecurrenceWeeks(1);
    setRemarcarNovaData('');
    setRemarcarNovoHorario('');
    setRemarcarMotivo('');
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingLesson(null);
    setRecurrenceWeeks(1);
    setShowReleaseConfirm(false);
    setReleaseReason('');
    setRemarcarNovaData('');
    setRemarcarNovoHorario('');
    setRemarcarMotivo('');
  };

  /**
   * "Deixar o aluno remarcar": o aluno avisou que não pode vir e o professor
   * devolve a escolha do horário para ele. Diferente do botão "Remarcar" da
   * lista do dia, onde quem escolhe a nova data é o professor.
   */
  const handleReleaseForStudentReschedule = async () => {
    if (!editingLesson) return;
    // Guarda: aula ainda não sincronizada com o banco (id temporário/otimista).
    if (!editingLesson.id || editingLesson.id.startsWith('temp-')) {
      showNotification('Esta aula ainda está sincronizando. Atualize a página e tente novamente.', 'error');
      return;
    }
    setIsReleasing(true);
    const res = await releaseLessonForStudentReschedule(editingLesson.id, releaseReason.trim() || undefined);
    if (res.success) {
      await reloadLoadedLessons();
      showNotification(
        res.warning || 'Aula liberada! O aluno foi avisado e já pode escolher o novo horário.',
        res.warning ? 'error' : 'success'
      );
      handleCloseModal();
    } else {
      showNotification(res.error || 'Erro ao liberar a aula para remarcação.', 'error');
    }
    setIsReleasing(false);
  };

  /**
   * Conflito segundo as aulas EM MEMÓRIA. É só um atalho de UX para dar
   * resposta instantânea — o servidor é a autoridade.
   *
   * 'unknown' quando a data está fora da janela carregada: aí não há aula
   * nenhuma em memória, e responder "livre" agendaria por cima de uma aula
   * existente sem avisar ninguém. Só 'conflict' bloqueia aqui; 'free' e
   * 'unknown' seguem para o servidor decidir.
   */
  const checkOverlapLocal = (
    date: string, start: string, end: string, excludeId?: string
  ): 'conflict' | 'free' | 'unknown' => {
    if (!isRangeLoaded(date, date)) return 'unknown';

    const toMin = (t: string) => {
      const [h, m] = t.split(":").map(Number);
      return h * 60 + m;
    };
    const newStartMin = toMin(start);
    const newEndMin = toMin(end);

    const found = allLessons.some(l => {
      if (l.date !== date) return false;
      // A cancelada por inadimplência é a única que continua segurando o
      // horário — some da regra geral abaixo de propósito.
      if (l.status === "remarcada") return false;
      if (l.status === "cancelada" && !isOverdueLesson(l)) return false;
      if (excludeId && l.id === excludeId) return false;

      const extStartMin = toMin(l.startTime);
      const extEndMin = toMin(l.endTime);

      return (newStartMin < extEndMin) && (newEndMin > extStartMin);
    });

    return found ? 'conflict' : 'free';
  };

  /** A aula em atraso que ocupa o intervalo, para explicar o conflito por nome. */
  const findOverdueConflict = (
    date: string, start: string, end: string, excludeId?: string
  ): Lesson | undefined => {
    const toMin = (t: string) => {
      const [h, m] = t.split(":").map(Number);
      return h * 60 + m;
    };
    const newStartMin = toMin(start);
    const newEndMin = toMin(end);

    return allLessons.find(l =>
      l.date === date
      && isOverdueLesson(l)
      && !(excludeId && l.id === excludeId)
      && newStartMin < toMin(l.endTime)
      && newEndMin > toMin(l.startTime)
    );
  };


  const handleSaveLesson = async (e: FormEvent) => {
    e.preventDefault();

    // Escolheu "Remarcada": pula todo o fluxo de edição normal e reaproveita a
    // MESMA action do botão "Remarcar" da lista do dia — já valida conflito no
    // NOVO horário, cria a aula nova e notifica.
    if (editingLesson && formData.status === 'remarcada') {
      if (!remarcarNovaData || !remarcarNovoHorario) {
        showNotification('Escolha a nova data e o novo horário para remarcar.', 'error');
        return;
      }
      if (!editingLesson.id || editingLesson.id.startsWith('temp-')) {
        showNotification('Esta aula ainda está sincronizando. Atualize a página e tente novamente.', 'error');
        return;
      }
      setIsSaving(true);
      const novoTermino = calculateEndTime(remarcarNovoHorario);
      const res = await rescheduleLessonByTeacher(editingLesson.id, remarcarNovaData, remarcarNovoHorario, novoTermino, remarcarMotivo);
      setIsSaving(false);
      if (res.success) {
        await reloadLoadedLessons();
        showNotification(res.warning || 'Aula remarcada com sucesso! O aluno foi notificado.', res.warning ? 'error' : 'success');
        handleCloseModal();
      } else {
        showNotification(res.error || 'Erro ao remarcar aula.', 'error');
      }
      return;
    }

    if (!formData.studentName || !formData.date || !formData.startTime || !formData.endTime) return;

    // Bloqueio de data retroativa — só aplica quando data/hora muda ou é nova aula
    const isDateTimeChanged = !editingLesson ||
      editingLesson.date !== formData.date ||
      editingLesson.startTime !== formData.startTime;

    if (isDateTimeChanged) {
      const lessonDateTime = new Date(`${formData.date}T${formData.startTime}:00`);
      if (lessonDateTime < new Date()) {
        showNotification("Não é possível agendar uma aula em data ou horário que já passou.", "error");
        return;
      }
    }

    if (isDateTimeChanged) {
      const off = getDayOff(formData.date);
      if (off) {
        showNotification(`Este dia é folga${off.reason ? ` (${off.reason})` : ''}. Desmarque em "Dias de Folga" para agendar.`, "error");
        return;
      }
    }

    // Só o conflito CONHECIDO corta aqui (feedback instantâneo). 'free' e
    // 'unknown' vão para o servidor, que valida contra o banco inteiro.
    if (checkOverlapLocal(formData.date, formData.startTime, formData.endTime, editingLesson?.id) === 'conflict') {
      // Mensagem específica quando quem segura o horário é uma aula em atraso:
      // "já existe uma aula" confundiria, já que ela aparece como cancelada.
      const held = findOverdueConflict(formData.date, formData.startTime, formData.endTime, editingLesson?.id);
      showNotification(
        held
          ? `${held.studentName} está com pagamento em atraso e o horário segue reservado. Use "Liberar horário" em Aulas do Dia se quiser usá-lo.`
          : "Conflito de horário! Já existe uma aula agendada neste intervalo de tempo.",
        "error"
      );
      return;
    }

    setIsSaving(true);

    // Lógica de Desconto de Pacote (RF06)
    const wasRealizada = editingLesson?.status === "realizada";
    const isRealizada = formData.status === "realizada";

    if (isRealizada && !wasRealizada) {
      const updatedStudents = mockStudents.map(s => {
        if (s.name === formData.studentName) return { ...s, usedLessons: (s.usedLessons || 0) + 1 };
        return s;
      });
      setStudents(updatedStudents);
    } else if (!isRealizada && wasRealizada) {
      const updatedStudents = mockStudents.map(s => {
        if (s.name === formData.studentName) return { ...s, usedLessons: Math.max((s.usedLessons || 0) - 1, 0) };
        return s;
      });
      setStudents(updatedStudents);
    }

    if (editingLesson) {
      // Update otimista no lugar — inclusive quando o horário muda. Antes a
      // edição marcava a original como "remarcada" e criava outra, deixando um
      // card fantasma roxo; e o retorno do create era descartado, então um
      // conflito virava "Aula confirmada e gravada!" com a original já perdida.
      // Agora é um update só, validado no servidor, que notifica aluno e professor.
      const previous = allLessons;
      setAllLessons(prev => prev.map(l =>
        l.id === editingLesson.id ? { ...l, ...formData } as Lesson : l
      ));

      const updateRes = await updateAgendaLesson(editingLesson.id, formData);

      if (!updateRes.success) {
        setAllLessons(previous); // desfaz o otimista
        showNotification(updateRes.error || "Erro ao gravar a aula. Atualize a página e tente novamente.", "error");
        setIsSaving(false);
        return;
      }

      // Gerar cobrança automaticamente ao marcar como realizada
      if (isRealizada && !wasRealizada && formData.studentName) {
        await autoCreatePaymentForLesson(formData.studentName);
        // Atualiza o painel Financeiro imediatamente — sem isto o lançamento
        // recém-criado só apareceria após F5 ou navegação.
        await refreshPayments();
      }

      showNotification(updateRes.warning ?? "Aula confirmada e gravada!", updateRes.warning ? "error" : "success");
    } else {
      const weeks = recurrenceWeeks === 0 && formData.date
        ? countWeekdayOccurrencesInMonth(formData.date)
        : recurrenceWeeks;
      const res = await createAgendaLesson(formData as Lesson, weeks);
      if (res.success) {
        // Recarrega só a janela já carregada para as aulas receberem id real
        // (evita "Aula não encontrada" ao remarcar em seguida).
        await reloadLoadedLessons();
        showNotification("Aula criada com sucesso!", "success");
      } else {
        showNotification(res.error || "Ocorreu um erro ao gravar a aula.", "error");
      }
    }

    setIsSaving(false);
    handleCloseModal();
  };

  const handleSaveNewStudent = async () => {
    if (!newStudentData.name) return;
    setIsSavingStudent(true);
    
    const payload = {
      ...newStudentData,
      lessonprice: Number(newStudentData.lessonprice) || 0
    };

    const result = await createAgendaStudent(payload);
    
    if (result.success) {
      const freshStudents = await fetchAgendaStudents();
      setStudents(freshStudents);
      setFormData({ ...formData, studentName: newStudentData.name, instrument: newStudentData.instrument });
      setNewStudentData({ name: "", phone: "", email: "", cpf: "", instrument: "Violão", packagetype: "avulsa", expirationdate: "", lessonprice: "" });
      showNotification("Sintonia fina! Aluno gravado na base.", "success");
      setIsNewStudentModalOpen(false);
    } else {
      showNotification(result.error || "Erro ao criar aluno. Verifique a conexão com o banco.", "error");
    }
    
    setIsSavingStudent(false);
  };

  const dayNames = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

  const getStatusColor = (status: string) => {
    switch (status) {
      case "agendada":
        return "bg-amber-500/10 text-amber-500 border-l-4 border-l-amber-500 border-y border-y-amber-500/20 border-r border-r-amber-500/20 hover:bg-amber-500/20";
      case "aguardando_pagamento":
        return "bg-blue-500/10 text-blue-400 border-l-4 border-l-blue-500 border-y border-y-blue-500/20 border-r border-r-blue-500/20 hover:bg-blue-500/20";
      case "realizada":
        return "bg-green-500/10 text-green-500 border-l-4 border-l-green-500 border-y border-y-green-500/20 border-r border-r-green-500/20 hover:bg-green-500/20";
      case "cancelada":
        return "bg-red-500/10 text-red-500 border-l-4 border-l-red-500 border-y border-y-red-500/20 border-r border-r-red-500/20 hover:bg-red-500/20";
      case "remarcada":
        return "bg-purple-500/10 text-purple-400 border-l-4 border-l-purple-500 border-y border-y-purple-500/20 border-r border-r-purple-500/20 hover:bg-purple-500/20";
      default:
        return "bg-gray-500/10 text-gray-300 border-l-4 border-l-gray-500 border-gray-600";
    }
  };

  const getStatusDot = (status: string) => {
    switch (status) {
      case "agendada": return "bg-amber-500";
      case "aguardando_pagamento": return "bg-blue-500";
      case "realizada": return "bg-green-500";
      case "cancelada": return "bg-red-500";
      case "remarcada": return "bg-purple-500";
      default: return "bg-gray-500";
    }
  };

  const monthLabel = currentDate.toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="flex flex-col lg:flex-row min-h-full w-full gap-6 text-gray-100 bg-gray-900 -m-4 md:-m-6 p-4 md:p-6 rounded-tl-2xl relative">
      
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

      {/* Esquerda: Calendário e Grade */}
      <div className="flex-1 flex flex-col min-w-0 h-full">
        {/* Header da Agenda */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 flex-wrap">
          <div className="flex items-center gap-3 sm:gap-4 flex-wrap">

            <div className="relative">
              <div
                className="relative group cursor-pointer flex items-center gap-1"
                title="Selecionar mês/ano"
                onClick={handleOpenDatePicker}
              >
                <h1 className="text-xl font-bold capitalize text-white group-hover:text-amber-500 transition-colors">
                  {monthLabel}
                </h1>
                <svg className={`w-5 h-5 text-gray-400 group-hover:text-amber-500 transition-transform ${showDatePicker ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                </svg>
              </div>

              {showDatePicker && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowDatePicker(false)} />
                  <div className="absolute top-full left-0 mt-3 bg-gray-800 border border-gray-600 rounded-xl shadow-2xl p-4 z-50 w-64 max-w-[calc(100vw-2rem)] animate-slide-in">
                    <div className="flex justify-between items-center mb-4">
                      <button
                        onClick={(e) => { e.stopPropagation(); setPickerDate(new Date(pickerDate.getFullYear(), pickerDate.getMonth() - 1, 1)); }}
                        className="p-1 hover:bg-gray-700 rounded-md text-gray-400 hover:text-white transition-colors"
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
                      </button>
                      <span className="text-white font-semibold text-sm capitalize">
                        {pickerDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
                      </span>
                      <button
                        onClick={(e) => { e.stopPropagation(); setPickerDate(new Date(pickerDate.getFullYear(), pickerDate.getMonth() + 1, 1)); }}
                        className="p-1 hover:bg-gray-700 rounded-md text-gray-400 hover:text-white transition-colors"
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
                      </button>
                    </div>
                    <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-gray-500 mb-2 font-bold uppercase tracking-wider">
                      <span>D</span><span>S</span><span>T</span><span>Q</span><span>Q</span><span>S</span><span>S</span>
                    </div>
                    <div className="grid grid-cols-7 gap-1 text-sm">
                      {Array.from({ length: pickerFirstDay }).map((_, i) => <span key={`empty-${i}`} />)}
                      {daysArray.map(d => {
                        const isSelected = currentDate.getDate() === d && currentDate.getMonth() === pickerDate.getMonth() && currentDate.getFullYear() === pickerDate.getFullYear();
                        return (
                          <button
                            key={d}
                            onClick={(e) => { e.stopPropagation(); jumpToDate(d); }}
                            className={`w-7 h-7 mx-auto rounded-full flex items-center justify-center transition-colors 
                              ${isSelected ? 'bg-amber-500 text-gray-900 font-bold shadow-md shadow-amber-500/20'
                                : 'text-gray-300 hover:bg-gray-700'}`}
                          >
                            {d}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="flex items-center bg-gray-800 rounded-lg p-1 border border-gray-700">
              <button
                onClick={handlePrevWeek}
                className="p-1.5 hover:bg-gray-700 rounded-md text-gray-400 hover:text-white transition-colors"
                aria-label="Semana Anterior"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
                </svg>
              </button>
              <button
                onClick={handleToday}
                className="px-3 py-1 text-sm font-medium text-gray-300 hover:text-white hover:bg-gray-700 rounded-md transition-colors"
              >
                Hoje
              </button>
              <button
                onClick={handleNextWeek}
                className="p-1.5 hover:bg-gray-700 rounded-md text-gray-400 hover:text-white transition-colors"
                aria-label="Próxima Semana"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              </button>
            </div>
          </div>

          <button
            onClick={() => setIsDaysOffModalOpen(true)}
            className="bg-gray-700 hover:bg-gray-600 text-gray-200 font-semibold py-2 px-4 rounded-lg border border-gray-600 transition-all flex items-center gap-2"
          >
            <CalendarOff className="w-4 h-4 text-purple-400" />
            Dias de Folga
          </button>
          <button
            onClick={() => openBlockModal()}
            className="bg-gray-700 hover:bg-gray-600 text-gray-200 font-semibold py-2 px-4 rounded-lg border border-gray-600 transition-all flex items-center gap-2"
          >
            <Lock className="w-4 h-4 text-red-400" />
            Bloquear Horário
          </button>
          <button
            onClick={() => openNewLessonModal()}
            className="bg-amber-500 hover:bg-amber-600 text-gray-900 font-semibold py-2 px-4 rounded-lg shadow-md shadow-amber-500/20 transition-all flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Nova Aula
          </button>
        </div>

        {/* Grade CSS (Week Grid) */}
        <div className="flex-1 bg-gray-800 border border-gray-700 rounded-xl shadow-xl flex flex-col overflow-hidden">
          {/* Corpo da Grade scrollável */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto overflow-x-auto relative scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-transparent"
          >
            {/* Cabeçalho dos Dias (Sticky, dentro do container para compensar barra de rolagem) */}
            <div className="sticky top-0 z-40 grid grid-cols-8 border-b border-gray-700 bg-gray-800/95 shadow-sm min-w-[560px]">
              {/* Coluna de Horários (vazia no topo) */}
              <div className="col-span-1 border-r border-gray-700 p-2 lg:p-3 flex items-end justify-center">
                <span className="text-xs text-gray-500 font-medium tracking-wider">GMT-3</span>
              </div>

              {/* Dias da semana */}
              {weekDatesStr.map((dateStr, idx) => {
                const dateObj = new Date(dateStr + "T12:00:00");
                const isSelected = dateStr === selectedDateStr;

                return (
                  <div
                    key={dateStr}
                    onClick={() => setSelectedDateStr(dateStr)}
                    className={`col-span-1 border-r border-gray-700 p-2 lg:p-3 flex flex-col items-center justify-center cursor-pointer transition-all duration-200 active:scale-95 select-none ${isSelected ? "bg-gray-800/80 shadow-[inset_0_0_15px_rgba(245,158,11,0.05)]" : "hover:bg-gray-700/30"
                      }`}
                  >
                    <span className={`text-[10px] sm:text-xs font-bold uppercase tracking-widest transition-colors ${isSelected ? 'text-amber-500 drop-shadow-[0_0_5px_rgba(245,158,11,0.8)]' : 'text-gray-400'
                      }`}>
                      {dayNames[idx]}
                    </span>
                    <div className={`mt-1 text-lg lg:text-xl font-black rounded-full w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center transition-all duration-300 ${isSelected ? 'bg-amber-500 text-gray-900 shadow-[0_0_20px_rgba(245,158,11,0.5)] scale-110 -translate-y-0.5' : 'text-gray-200'
                      }`}>
                      {dateObj.getDate()}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="h-[1024px] md:h-[1280px] relative w-full min-w-[560px]">
              {/* Linhas de Horas no background — com marcação de meia-hora */}
              <HourGridBackground />

              {/* Aulas renderizadas por cima */}
              <div className="absolute inset-0 grid grid-cols-8 pointer-events-none">
                <div className="col-span-1" />
                {weekDatesStr.map((dateStr) => {
                  const dayLessons = weeklyLessons.filter(l => l.date === dateStr);
                  const localRealToday = getLocalISODate(new Date());
                  const isRealTodayString = dateStr === localRealToday;

                  return (
                    <div
                      key={dateStr}
                      className="col-span-1 relative pointer-events-auto h-full border-r border-transparent cursor-pointer group"
                      onClick={(e) => {
                        // Impede que clique no card propague para criar aula
                        if ((e.target as HTMLElement).closest('.lesson-card')) return;
                        const off = getDayOff(dateStr);
                        if (off) {
                          showNotification(`Este dia é folga${off.reason ? ` (${off.reason})` : ''}. Desmarque em "Dias de Folga" para agendar.`, 'error');
                          return;
                        }
                        const rect = e.currentTarget.getBoundingClientRect();
                        const yOffset = e.clientY - rect.top;
                        
                        // Calcula a hora (cada hora tem 80px)
                        const clickedFraction = yOffset / 80;
                        const clickedHourInt = 8 + Math.floor(clickedFraction);
                        
                        // Se clicou na metade de baixo do bloco (yOffset mod 80 >= 40), marca como 30 min
                        const isHalf = (yOffset % 80) >= 40;
                        const minuteStr = isHalf ? "30" : "00";

                        if (clickedHourInt >= 8 && clickedHourInt <= 23) {
                          openNewLessonModal(dateStr, `${String(clickedHourInt).padStart(2, '0')}:${minuteStr}`);
                        }
                      }}
                    >
                      {/* Efeito Hover nas colunas de horas */}
                      <div className="absolute inset-0 w-full h-full opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity bg-white/[0.02]" />

                      {/* Overlay de folga semanal — cobre a coluna inteira */}
                      {(() => {
                        const off = getDayOff(dateStr);
                        if (!off) return null;
                        return (
                          <div
                            className="absolute inset-0 pointer-events-none border-x border-purple-500/20"
                            style={{ background: 'repeating-linear-gradient(45deg, rgba(168,85,247,0.08), rgba(168,85,247,0.08) 4px, rgba(168,85,247,0.02) 4px, rgba(168,85,247,0.02) 10px)' }}
                            title={`Folga${off.reason ? `: ${off.reason}` : ''}`}
                          >
                            <div className="sticky top-0 flex items-center justify-center gap-1 py-1 text-[10px] font-bold text-purple-300/80">
                              <CalendarOff className="w-3 h-3" />
                              <span className="truncate">{off.reason || 'Folga'}</span>
                            </div>
                          </div>
                        );
                      })()}

                      {/* Aulas em atraso: pintadas ANTES das ativas e com z-0,
                          para que qualquer aula real fique por cima. */}
                      {weeklyOverdueLessons.filter(l => l.date === dateStr).map(lesson => {
                        const geo = getBlockGeometry(lesson.startTime, lesson.endTime);
                        if (!geo) return null;

                        return (
                          <div
                            key={lesson.id}
                            onClick={(e) => e.stopPropagation()}
                            className="lesson-card absolute left-1 right-1 z-0 rounded-md text-xs p-1.5 overflow-hidden cursor-default bg-rose-500/15 text-rose-300 border-l-4 border-l-rose-500 border-y border-r border-dashed border-rose-500/50"
                            style={{ top: `${geo.top}px`, height: `${geo.height - 2}px` }}
                            title={`Pagamento de ${lesson.studentName} em atraso — a aula foi cancelada automaticamente, mas o horário segue reservado. Regularize em Financeiro.`}
                          >
                            <div className="font-semibold truncate flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3 shrink-0" />
                              <span className="truncate">{lesson.studentName}</span>
                            </div>
                            <div className="text-[10px] opacity-80 flex items-center justify-between">
                              <span>{lesson.startTime}</span>
                              <span className="capitalize">{lesson.instrument}</span>
                            </div>
                            <div className="text-[9px] font-bold uppercase tracking-wider mt-0.5">
                              Em atraso
                            </div>
                          </div>
                        );
                      })}

                      {dayLessons.map(lesson => {
                        const geo = getBlockGeometry(lesson.startTime, lesson.endTime);
                        if (!geo) return null;
                        const { top, height } = geo;

                        return (
                          <div
                            key={lesson.id}
                            onClick={() => openEditLessonModal(lesson)}
                            className={`lesson-card absolute left-1 right-1 z-10 rounded-md text-xs p-1.5 overflow-hidden shadow-sm transition-all hover:scale-[1.02] cursor-pointer ${getStatusColor(lesson.status)}`}
                            style={{ top: `${top}px`, height: `${height - 2}px` }}
                            title={`${lesson.studentName} - ${lesson.instrument} (${lesson.startTime} - ${lesson.endTime})`}
                          >
                            <div className="font-semibold truncate">{lesson.studentName}</div>
                            <div className="text-[10px] opacity-80 flex items-center justify-between">
                              <span>{lesson.startTime}</span>
                              <span className="capitalize">{lesson.instrument}</span>
                            </div>
                            {lesson.status === "remarcada" && (
                              <div className="text-[9px] mt-0.5 line-through opacity-75">
                                Remarcada
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {blockedSlots.filter(b => b.date === dateStr).map(block => {
                        const geo = getBlockGeometry(block.starttime, block.endtime);
                        if (!geo) return null;
                        const { top, height } = geo;
                        return (
                          <div
                            key={block.id}
                            onClick={(e) => { e.stopPropagation(); setBlockToDelete(block); }}
                            className="lesson-card absolute left-1 right-1 rounded-md text-xs p-1.5 overflow-hidden cursor-pointer group border border-red-500/30"
                            style={{ top: `${top}px`, height: `${height - 2}px`, background: 'repeating-linear-gradient(45deg, rgba(239,68,68,0.12), rgba(239,68,68,0.12) 4px, rgba(239,68,68,0.04) 4px, rgba(239,68,68,0.04) 10px)' }}
                            title={`Bloqueado${block.reason ? `: ${block.reason}` : ''} — clique para remover`}
                          >
                            <div className="flex items-center gap-1 text-red-400 font-semibold">
                              <Lock className="w-3 h-3 shrink-0" />
                              <span className="truncate text-[10px]">{block.reason || 'Bloqueado'}</span>
                            </div>
                            <div className="text-[9px] text-red-400/70">{block.starttime} – {block.endtime}</div>
                            <div className="absolute inset-0 bg-red-500/10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                              <Trash2 className="w-4 h-4 text-red-400" />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )
                })}
              </div>

              {/* Linha "agora" isolada em componente próprio — só ela re-renderiza por minuto */}
              <NowLine weekDatesStr={weekDatesStr} />
            </div>
          </div>
        </div>
      </div>

      {/* Direita: Aulas do Dia Selecionado */}
      <div className="w-full lg:w-80 bg-gray-800 rounded-xl shadow-xl border border-gray-700 flex flex-col mt-6 lg:mt-0 max-h-[70vh] lg:max-h-[calc(100vh-80px)] lg:h-full">
        <div className="p-5 border-b border-gray-700 bg-gray-800/80 rounded-t-xl shrink-0">
          <h2 className="text-lg font-bold text-white mb-1">Aulas do Dia</h2>
          <p className="text-sm text-amber-500 font-medium">
            {new Date(selectedDateStr + "T12:00:00").toLocaleDateString("pt-BR", {
              weekday: "long",
              day: "2-digit",
              month: "long"
            })}
          </p>
        </div>

        <div key={selectedDateStr} className="flex-1 overflow-y-auto p-5 scrollbar-thin scrollbar-thumb-gray-600 animate-pop-in">
          {selectedDayLessons.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-3 opacity-60">
              <svg className="w-12 h-12 text-gray-500" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
              <p className="text-gray-400 text-sm">Nenhuma aula marcada<br />para esta data.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {selectedDayLessons.map(lesson => {
                const isOverdue = isOverdueLesson(lesson);
                return (
                <div
                  key={lesson.id}
                  onClick={isOverdue ? undefined : () => openEditLessonModal(lesson)}
                  className={`group relative rounded-lg p-3 border transition-all overflow-hidden ${
                    isOverdue
                      ? "bg-rose-500/[0.07] border-rose-500/40 cursor-default"
                      : "bg-gray-700/30 border-gray-600 hover:border-amber-500/50 hover:bg-gray-700/50 cursor-pointer"
                  }`}
                >
                  {/* Nota Ambiente - aparece ocasionalmente, suave */}
                  <span
                    className="absolute top-1 right-2 text-amber-500/50 text-xs animate-ambient-note z-0 select-none"
                    style={{ animationDelay: `${lesson.id.charCodeAt(0) % 7}s` }}
                  >♪</span>

                  <div className="relative z-10 flex justify-between items-start mb-2">
                    <span className="text-xs font-mono text-gray-400 font-medium">
                      {lesson.startTime} - {lesson.endTime}
                    </span>
                    {isOverdue ? (
                      <span className="flex items-center gap-1.5 text-[10px] uppercase font-bold tracking-wider text-rose-400">
                        <AlertTriangle className="w-3 h-3" />
                        Pagamento em atraso
                      </span>
                    ) : (
                    <span className={`flex items-center gap-1.5 text-[10px] uppercase font-bold tracking-wider ${lesson.status === "agendada" ? "text-amber-500" :
                        lesson.status === "aguardando_pagamento" ? "text-blue-400" :
                          lesson.status === "realizada" ? "text-green-500" :
                            lesson.status === "cancelada" ? "text-red-500" :
                            "text-purple-400"
                      }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${getStatusDot(lesson.status)}`}></span>
                      {lesson.status}
                    </span>
                    )}
                  </div>

                  <h3 className="font-medium text-gray-100 flex items-center gap-2">
                    <Link
                      href="/alunos"
                      onClick={(e) => e.stopPropagation()}
                      title={`Abrir ficha de ${lesson.studentName}`}
                      className="hover:text-amber-500 hover:underline transition-colors"
                    >
                      {lesson.studentName}
                    </Link>
                  </h3>

                  <div className="flex items-center gap-2 mt-2 text-xs text-gray-400">
                    <span className="bg-gray-800 px-2 py-1 rounded-md capitalize border border-gray-700">
                      {lesson.instrument}
                    </span>
                    <span className="truncate flex-1">
                      {lesson.teacherName}
                    </span>
                  </div>

                  {/* Na aula em atraso a nota É o motivo do cancelamento, que o
                      selo acima já comunica — repeti-la só ocupa espaço. */}
                  {lesson.notes && !isOverdue && (
                    <div className="mt-3 text-xs bg-gray-800 p-2 rounded text-gray-400 border border-gray-700/50">
                      <strong>Nota: </strong> {lesson.notes}
                    </div>
                  )}

                  {isOverdue && (
                    <div className="mt-3 flex items-center justify-end gap-2" onClick={e => e.stopPropagation()}>
                      <Link
                        href="/financeiro"
                        className="flex items-center gap-1.5 text-[10px] font-bold text-rose-400 hover:text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 px-2.5 py-1 rounded-lg transition-colors"
                      >
                        Ver no Financeiro
                      </Link>
                      <button
                        onClick={() => handleReleaseOverdueSlot(lesson)}
                        disabled={isDeletingLessonId === lesson.id}
                        className="flex items-center gap-1.5 text-[10px] font-bold text-gray-300 hover:text-white bg-gray-700/60 hover:bg-gray-700 border border-gray-600 px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50"
                        title="Remove a aula cancelada e libera o horário para outro aluno"
                      >
                        <Trash2 className="w-3 h-3" /> {isDeletingLessonId === lesson.id ? 'Liberando...' : 'Liberar horário'}
                      </button>
                    </div>
                  )}

                  {(lesson.status === 'agendada' || lesson.status === 'aguardando_pagamento') && (
                    <div className="mt-3 flex justify-end gap-2" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => {
                          setRescheduleLesson(lesson);
                          setRescheduleDate('');
                          setRescheduleStartTime('');
                          setRescheduleReason('');
                        }}
                        className="flex items-center gap-1.5 text-[10px] font-bold text-amber-500 hover:text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 px-2.5 py-1 rounded-lg transition-colors"
                      >
                        <RefreshCw className="w-3 h-3" /> Remarcar
                      </button>
                      <button
                        onClick={() => openDeleteLesson(lesson)}
                        className="flex items-center gap-1.5 text-[10px] font-bold text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 px-2.5 py-1 rounded-lg transition-colors"
                        title="Excluir só esta aula, a série toda ou todas as aulas do aluno"
                      >
                        <Trash2 className="w-3 h-3" /> Excluir
                      </button>
                    </div>
                  )}

                  {/* O botão de excluir registro "remarcada" saiu junto com a
                      aula: a remarcada não aparece mais na lista, e apagá-la
                      revogava o crédito de reposição do aluno
                      (deleteLessonsWithCleanup) sem que o professor soubesse. */}
                </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Modal de Dias de Folga */}
      {isDaysOffModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4 animate-fade-in">
          <div className="bg-gray-800 border border-gray-700 rounded-3xl shadow-2xl w-full max-w-md p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
                <CalendarOff className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <h3 className="text-xl font-black text-white">Dias de Folga</h3>
                <p className="text-xs text-gray-400">Dias da semana em que você não dá aulas</p>
              </div>
            </div>
            <div className="space-y-2 mb-5">
              {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((day, i) => {
                const isOff = daysOff.some(d => d.day_of_week === i);
                return (
                  <button key={i} onClick={() => handleToggleDayOff(i)}
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-all ${isOff ? 'bg-purple-500/10 border-purple-500/30 text-purple-300' : 'bg-gray-700/50 border-gray-600/50 text-gray-400 hover:bg-gray-700'}`}>
                    <span className="font-bold text-sm">{day}</span>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${isOff ? 'bg-purple-500/20 text-purple-300' : 'bg-gray-600 text-gray-500'}`}>
                      {isOff ? 'Folga' : 'Trabalho'}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="mb-4">
              <label className="block text-xs font-bold text-gray-400 mb-1.5 uppercase tracking-widest">Motivo padrão (opcional)</label>
              <input type="text" placeholder="Ex: Dia de descanso" value={daysOffReason}
                onChange={e => setDaysOffReason(e.target.value)}
                className="w-full bg-gray-900/50 border border-gray-700 rounded-xl p-3 text-white focus:border-purple-500 focus:ring-2 focus:ring-purple-500/10 outline-none placeholder-gray-600" />
            </div>
            <button onClick={() => setIsDaysOffModalOpen(false)}
              className="w-full px-4 py-3 text-sm font-semibold text-gray-300 bg-gray-700 hover:bg-gray-600 rounded-xl transition-colors">
              Fechar
            </button>
          </div>
        </div>
      )}

      {/* Modal de Bloqueio de Horário */}
      {isBlockModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4 animate-fade-in">
          <div className="bg-gray-800 border border-gray-700 rounded-3xl shadow-2xl w-full max-w-md p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                <Lock className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <h3 className="text-xl font-black text-white">Bloquear Horário</h3>
                <p className="text-xs text-gray-400">Este horário ficará indisponível para os alunos</p>
              </div>
            </div>
            <div className="space-y-4">
              {/* Opções rápidas */}
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setBlockForm(p => ({ ...p, wholeDay: !p.wholeDay, wholeWeek: false }))}
                  className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all ${blockForm.wholeDay ? 'bg-red-500/20 border-red-500/40 text-red-300' : 'bg-gray-700/50 border-gray-600/50 text-gray-400 hover:bg-gray-700'}`}>
                  Dia inteiro
                </button>
                <button onClick={() => setBlockForm(p => ({ ...p, wholeWeek: !p.wholeWeek, wholeDay: p.wholeWeek ? false : p.wholeDay }))}
                  className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all ${blockForm.wholeWeek ? 'bg-red-500/20 border-red-500/40 text-red-300' : 'bg-gray-700/50 border-gray-600/50 text-gray-400 hover:bg-gray-700'}`}>
                  Semana inteira
                </button>
              </div>

              {!blockForm.wholeWeek && (
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-1.5 uppercase tracking-widest">Data *</label>
                  <input type="date" value={blockForm.date} onChange={e => setBlockForm(p => ({ ...p, date: e.target.value }))}
                    className="w-full bg-gray-900/50 border border-gray-700 rounded-xl p-3 text-white focus:border-red-500 focus:ring-2 focus:ring-red-500/10 outline-none appearance-none" />
                </div>
              )}

              {!blockForm.wholeDay && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-400 mb-1.5 uppercase tracking-widest">Início *</label>
                    <select value={blockForm.starttime} onChange={e => setBlockForm(p => ({ ...p, starttime: e.target.value }))}
                      className="w-full bg-gray-900/50 border border-gray-700 rounded-xl p-3 text-white focus:border-red-500 outline-none">
                      {HOURS_LIST.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-400 mb-1.5 uppercase tracking-widest">Fim *</label>
                    <select value={blockForm.endtime} onChange={e => setBlockForm(p => ({ ...p, endtime: e.target.value }))}
                      className="w-full bg-gray-900/50 border border-gray-700 rounded-xl p-3 text-white focus:border-red-500 outline-none">
                      {HOURS_LIST.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                </div>
              )}

              {!blockForm.wholeWeek && (
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-1.5 uppercase tracking-widest">Repetir semanalmente</label>
                  <select value={blockForm.repeatWeeks} onChange={e => setBlockForm(p => ({ ...p, repeatWeeks: parseInt(e.target.value) }))}
                    className="w-full bg-gray-900/50 border border-gray-700 rounded-xl p-3 text-white focus:border-red-500 outline-none">
                    <option value={1}>Não repetir</option>
                    <option value={4}>1 mês (4 semanas)</option>
                    <option value={12}>3 meses (12 semanas)</option>
                    <option value={24}>6 meses (24 semanas)</option>
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1.5 uppercase tracking-widest">Motivo (opcional)</label>
                <input type="text" placeholder="Ex: Consulta médica, reunião..." value={blockForm.reason}
                  onChange={e => setBlockForm(p => ({ ...p, reason: e.target.value }))}
                  className="w-full bg-gray-900/50 border border-gray-700 rounded-xl p-3 text-white focus:border-red-500 focus:ring-2 focus:ring-red-500/10 outline-none placeholder-gray-600" />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setIsBlockModalOpen(false)}
                className="flex-1 px-4 py-3 text-sm font-semibold text-gray-300 bg-gray-700 hover:bg-gray-600 rounded-xl transition-colors">
                Cancelar
              </button>
              <button onClick={handleSaveBlock} disabled={isSavingBlock || (!blockForm.wholeWeek && !blockForm.date)}
                className="flex-1 px-4 py-3 text-sm font-bold text-white bg-red-600 hover:bg-red-500 rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                <Lock className="w-4 h-4" />
                {isSavingBlock ? 'Salvando...' : 'Bloquear'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de confirmação ao remover bloqueio — só este dia ou a série inteira */}
      {blockToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4 animate-fade-in">
          <div className="bg-gray-800 border border-gray-700 rounded-3xl shadow-2xl w-full max-w-md p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <h3 className="text-xl font-black text-white">Remover Bloqueio</h3>
                <p className="text-xs text-gray-400">
                  {blockToDelete.reason || 'Bloqueado'} · {blockToDelete.starttime} – {blockToDelete.endtime}
                </p>
              </div>
            </div>
            <div className="space-y-2">
              <button onClick={() => handleDeleteBlockChoice('this')} disabled={isDeletingBlock}
                className="w-full text-left px-4 py-3 rounded-xl text-sm font-semibold text-gray-200 bg-gray-700/50 hover:bg-gray-700 border border-gray-600/50 transition-colors disabled:opacity-50">
                Somente este dia
              </button>
              <button onClick={() => handleDeleteBlockChoice(4)} disabled={isDeletingBlock}
                className="w-full text-left px-4 py-3 rounded-xl text-sm font-semibold text-gray-200 bg-gray-700/50 hover:bg-gray-700 border border-gray-600/50 transition-colors disabled:opacity-50">
                Série mensal (4 semanas) a partir daqui
              </button>
              <button onClick={() => handleDeleteBlockChoice(12)} disabled={isDeletingBlock}
                className="w-full text-left px-4 py-3 rounded-xl text-sm font-semibold text-gray-200 bg-gray-700/50 hover:bg-gray-700 border border-gray-600/50 transition-colors disabled:opacity-50">
                Série trimestral (12 semanas) a partir daqui
              </button>
              <button onClick={() => handleDeleteBlockChoice(24)} disabled={isDeletingBlock}
                className="w-full text-left px-4 py-3 rounded-xl text-sm font-semibold text-gray-200 bg-gray-700/50 hover:bg-gray-700 border border-gray-600/50 transition-colors disabled:opacity-50">
                Série semestral (24 semanas) a partir daqui
              </button>
            </div>
            <button onClick={() => setBlockToDelete(null)} disabled={isDeletingBlock}
              className="w-full mt-4 px-4 py-3 text-sm font-semibold text-gray-300 bg-gray-700 hover:bg-gray-600 rounded-xl transition-colors disabled:opacity-50">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Modal de exclusão de aula — só esta, a série ou todas do aluno */}
      {lessonToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4 animate-fade-in">
          <div className="bg-gray-800 border border-gray-700 rounded-3xl shadow-2xl w-full max-w-md p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <h3 className="text-xl font-black text-white">Excluir Aula</h3>
                <p className="text-xs text-gray-400">
                  {lessonToDelete.studentName} · {lessonToDelete.date?.split('-').reverse().join('/')} às {lessonToDelete.startTime}
                </p>
              </div>
            </div>

            {/* Opção de reposição: só faz sentido ao excluir mais de uma aula */}
            <label className="flex items-start gap-3 mb-4 p-3 rounded-xl border border-amber-500/20 bg-amber-500/5 cursor-pointer select-none">
              <input
                id="generate-credit-checkbox"
                type="checkbox"
                checked={generateCreditOnDelete}
                onChange={e => setGenerateCreditOnDelete(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded accent-amber-500 shrink-0"
              />
              <div>
                <p className="text-xs font-black text-amber-400 uppercase tracking-widest">Gerar 1 crédito de reposição</p>
                <p className="text-[10px] text-gray-400 mt-0.5">
                  O aluno poderá escolher um novo horário sem cobrança adicional.
                  Ideal quando o aluno mudou de horário e tem direito a uma aula de reposição.
                  Não tem efeito ao excluir só esta aula.
                </p>
              </div>
            </label>

            <div className="space-y-2">
              <button onClick={() => handleDeleteLessonScope('this')} disabled={isDeletingScope}
                className="w-full text-left px-4 py-3 rounded-xl text-sm font-semibold text-gray-200 bg-gray-700/50 hover:bg-gray-700 border border-gray-600/50 transition-colors disabled:opacity-50">
                Somente esta aula
              </button>
              <button onClick={() => handleDeleteLessonScope('following')} disabled={isDeletingScope || !deleteCounts}
                className="w-full text-left px-4 py-3 rounded-xl text-sm font-semibold text-gray-200 bg-gray-700/50 hover:bg-gray-700 border border-gray-600/50 transition-colors disabled:opacity-50">
                Esta e as próximas de {weekdayLabel(lessonToDelete.date)} às {lessonToDelete.startTime}
                <span className="block text-[11px] font-normal text-gray-400 mt-0.5">
                  {deleteCounts ? `${deleteCounts.following} aula(s)` : 'calculando...'}
                </span>
              </button>
              <button onClick={() => handleDeleteLessonScope('student')} disabled={isDeletingScope || !deleteCounts}
                className="w-full text-left px-4 py-3 rounded-xl text-sm font-semibold text-gray-200 bg-gray-700/50 hover:bg-gray-700 border border-gray-600/50 transition-colors disabled:opacity-50">
                Todas as aulas futuras de {lessonToDelete.studentName}
                <span className="block text-[11px] font-normal text-gray-400 mt-0.5">
                  {deleteCounts ? `${deleteCounts.student} aula(s), em qualquer dia e horário` : 'calculando...'}
                </span>
              </button>
            </div>
            <p className="text-[11px] text-gray-500 mt-4 leading-relaxed">
              Aulas já realizadas e canceladas ficam de fora — elas sustentam o histórico e o financeiro.
            </p>
            <button onClick={() => setLessonToDelete(null)} disabled={isDeletingScope}
              className="w-full mt-4 px-4 py-3 text-sm font-semibold text-gray-300 bg-gray-700 hover:bg-gray-600 rounded-xl transition-colors disabled:opacity-50">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Modal de Remarcação pelo Professor */}
      {rescheduleLesson && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4 animate-fade-in">
          <div className="bg-white border border-gray-200 rounded-3xl shadow-2xl w-full max-w-md p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center">
                <RefreshCw className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h3 className="text-xl font-black text-gray-900">Remarcar Aula</h3>
                <p className="text-xs text-gray-500">
                  {rescheduleLesson.studentName} · {rescheduleLesson.date?.split('-').reverse().join('/')} às {rescheduleLesson.startTime}
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-widest">Nova data *</label>
                <input
                  type="date"
                  min={getLocalISODate()}
                  value={rescheduleDate}
                  onChange={e => setRescheduleDate(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-gray-900 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/10 outline-none appearance-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-widest">Novo horário *</label>
                  <select
                    value={rescheduleStartTime}
                    onChange={e => setRescheduleStartTime(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-gray-900 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/10 outline-none appearance-none"
                  >
                    <option value="">Selecione</option>
                    {HOURS_LIST.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-widest">Término (50 min)</label>
                  <input
                    readOnly
                    value={rescheduleEndTime}
                    className="w-full bg-gray-100 border border-gray-200 rounded-xl p-3 text-gray-600 outline-none cursor-not-allowed"
                  />
                </div>
              </div>
              <p className="text-[10px] text-gray-400 -mt-2 ml-1">Horário de Brasília (GMT-3)</p>

              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-widest">Motivo (opcional)</label>
                <textarea
                  rows={3}
                  value={rescheduleReason}
                  onChange={e => setRescheduleReason(e.target.value)}
                  placeholder="Ex: Compromisso imprevisto..."
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-gray-900 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/10 outline-none resize-none placeholder-gray-400"
                />
              </div>

              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3">
                A aula atual será marcada como <strong>remarcada</strong> e uma nova aula será criada no horário escolhido. O aluno será notificado.
              </p>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setRescheduleLesson(null)}
                className="flex-1 px-4 py-3 text-sm font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleRescheduleByTeacher}
                disabled={isRescheduling || !rescheduleDate || !rescheduleStartTime}
                className="flex-1 px-4 py-3 text-sm font-black text-gray-900 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 rounded-xl transition-all"
              >
                {isRescheduling ? 'Remarcando...' : 'Confirmar Remarcação'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Nova/Editar Aula */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4 sm:p-6 animate-fade-in">
        <div className="relative bg-white ring-1 ring-black/5 border border-gray-200 rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col transform transition-all">
            
            {/* Modal Interno de Cadastro Rápido de Aluno Externo/Mapeado */}
            {isNewStudentModalOpen && (
              <div className="absolute inset-0 z-50 flex flex-col bg-gray-900/95 backdrop-blur-md p-6 sm:p-8 animate-fade-in overflow-y-auto">
                <div className="flex items-center justify-between border-b border-gray-700 pb-4 mb-4">
                  <div>
                    <h4 className="text-xl font-black text-amber-500">Novo Aluno</h4>
                    <p className="text-xs text-gray-400 mt-1">Cadastro ágil do aluno</p>
                  </div>
                  <button type="button" onClick={() => setIsNewStudentModalOpen(false)} className="text-gray-400 hover:text-white p-2">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="flex-1 space-y-4">
                  
                  {notification && (
                    <div className={`flex items-center gap-2 p-3 rounded-xl border ${notification.type === 'success' ? 'bg-green-500/10 border-green-500/20 text-green-500' : 'bg-red-500/10 border-red-500/20 text-red-500'} animate-fade-in-up`}>
                       {notification.type === 'success' ? <CheckCircle className="w-5 h-5 flex-shrink-0" /> : <AlertCircle className="w-5 h-5 flex-shrink-0" />}
                       <p className="text-xs font-bold">{notification.message}</p>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-bold text-gray-400 mb-1">Nome do Aluno</label>
                    <input type="text" value={newStudentData.name} onChange={e => setNewStudentData({ ...newStudentData, name: e.target.value })} className="w-full bg-gray-800 border border-gray-700 rounded-xl p-3 text-white focus:border-amber-500 outline-none" placeholder="Ex: Lucas Mendonça" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-400 mb-1">Email</label>
                      <input type="email" value={newStudentData.email} onChange={e => setNewStudentData({ ...newStudentData, email: e.target.value })} className="w-full bg-gray-800 border border-gray-700 rounded-xl p-3 text-white focus:border-amber-500 outline-none" placeholder="aluno@email.com" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-400 mb-1">Telefone</label>
                      <PhoneInput
                        value={newStudentData.phone}
                        onChange={v => setNewStudentData({ ...newStudentData, phone: v })}
                        selectClassName="bg-gray-800 border border-gray-700 rounded-xl p-3 text-white focus:border-amber-500 outline-none"
                        inputClassName="w-full bg-gray-800 border border-gray-700 rounded-xl p-3 text-white focus:border-amber-500 outline-none"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-400 mb-1">CPF</label>
                      <input type="text" value={newStudentData.cpf} onChange={e => setNewStudentData({ ...newStudentData, cpf: maskCPF(e.target.value) })} className="w-full bg-gray-800 border border-gray-700 rounded-xl p-3 text-white focus:border-amber-500 outline-none" placeholder="000.000.000-00" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-400 mb-1">Instrumento</label>
                      <select value={newStudentData.instrument} onChange={e => setNewStudentData({ ...newStudentData, instrument: e.target.value })} className="w-full bg-gray-800 border border-gray-700 rounded-xl p-3 text-white focus:border-amber-500 outline-none capitalize">
                         {dynamicInstruments.map(inst => (
                           <option key={inst} value={inst}>{inst}</option>
                         ))}
                      </select>
                    </div>
                  </div>
                  {/* Removido campos de Total Aulas e Aulas Usadas a pedido do usuário */}
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 mb-1">Pacote</label>
                      <select value={newStudentData.packagetype} onChange={e => setNewStudentData({ ...newStudentData, packagetype: e.target.value })} className="w-full bg-gray-800 border border-gray-700 rounded-xl p-3 text-white focus:border-amber-500 outline-none capitalize">
                        <option value="avulsa">Avulsa</option>
                        <option value="mensal">Mensal</option>
                        <option value="trimestral">Trimestral</option>
                        <option value="semestral">Semestral</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 mb-1">Vencimento</label>
                      <input type="date" value={newStudentData.expirationdate} onChange={e => setNewStudentData({ ...newStudentData, expirationdate: e.target.value })} className="w-full bg-gray-800 border border-gray-700 rounded-xl p-3 text-white focus:border-amber-500 outline-none" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 mb-1">Valor (R$)</label>
                      <input type="number" step="0.01" value={newStudentData.lessonprice} onChange={e => setNewStudentData({ ...newStudentData, lessonprice: e.target.value })} className="w-full bg-gray-800 border border-gray-700 rounded-xl p-3 text-white focus:border-amber-500 outline-none" placeholder="0.00" />
                    </div>
                  </div>
                  <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                     <p className="text-xs text-amber-500 font-bold">Nota: O aluno começará como inativo até confirmar via link.</p>
                  </div>
                </div>
                <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-gray-700 shrink-0">
                  <button type="button" onClick={() => setIsNewStudentModalOpen(false)} className="px-4 py-3 rounded-xl text-sm font-semibold text-gray-300 bg-gray-800 border border-gray-600 hover:bg-gray-700 transition">Cancelar</button>
                  <button type="button" onClick={handleSaveNewStudent} disabled={isSavingStudent} className="px-6 py-3 rounded-xl text-sm font-black bg-amber-500 hover:bg-amber-400 text-gray-900 disabled:opacity-50 transition shadow-[0_0_15px_rgba(245,158,11,0.2)]">
                    {isSavingStudent ? "Cadastrando..." : "Cadastrar Aluno"}
                  </button>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between px-5 sm:px-8 py-5 sm:py-6 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-white shrink-0">
              <div>
                <h3 className="text-2xl font-black text-gray-900">
                  {editingLesson ? "Editar Aula" : "Nova Aula"}
                </h3>
                <p className="text-sm text-gray-500 mt-1 font-medium tracking-wide">Planeje o horário com o aluno</p>
              </div>
              <button onClick={handleCloseModal} className="text-gray-500 hover:text-gray-900 transition-colors bg-gray-100 hover:bg-gray-200 p-2 rounded-lg">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSaveLesson} className="flex-1 overflow-y-auto p-5 sm:p-8 space-y-5 sm:space-y-6 scrollbar-thin scrollbar-thumb-gray-300">
              <div className="group">
                <div className="flex justify-between items-center mb-1.5 ml-1">
                  <label className="text-xs font-bold text-gray-600 uppercase tracking-wider group-focus-within:text-amber-600 transition-colors">Aluno</label>
                  <button type="button" onClick={() => setIsNewStudentModalOpen(true)} className="text-[10px] bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full font-bold text-amber-500 hover:text-amber-400 hover:bg-amber-500/20 transition-colors">
                    + Novo Aluno
                  </button>
                </div>
                <select
                  required
                  value={formData.studentName || ""}
                  onChange={e => {
                    const studentName = e.target.value;
                    const matchedStudent = mockStudents.find(s => s.name === studentName);
                    setFormData({
                      ...formData,
                      studentName,
                      instrument: (matchedStudent?.instrument || formData.instrument || "violao") as Instrument
                    });
                  }}
                  className="w-full bg-white border border-gray-300 rounded-xl p-3.5 text-gray-900 focus:bg-white focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10 outline-none transition-all hover:bg-gray-50 shadow-sm appearance-none cursor-pointer"
                >
                  <option value="" disabled>Selecione o aluno</option>
                  {mockStudents.map(s => (
                    <option key={s.id} value={s.name}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="group">
                  <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wider ml-1 group-focus-within:text-amber-600 transition-colors">Professor</label>
                  <input
                    type="text"
                    required
                    readOnly
                    value={formData.teacherName || activeTeacherName}
                    className="w-full bg-gray-100 border border-gray-200 rounded-xl p-3.5 text-gray-600 font-bold focus:outline-none cursor-not-allowed shadow-inner opacity-90"
                    title="Seu nome vem automaticamente do seu login."
                  />
                </div>
                <div className="group">
                  <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wider ml-1 group-focus-within:text-amber-600 transition-colors">Instrumento</label>
                  <select
                    required
                    value={formData.instrument || "violao"}
                    onChange={e => setFormData({ ...formData, instrument: e.target.value as Instrument })}
                    className="w-full bg-white border border-gray-300 rounded-xl p-3.5 text-gray-900 outline-none transition-all shadow-sm appearance-none capitalize focus:bg-white focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10 hover:bg-gray-50 cursor-pointer"
                  >
                    {dynamicInstruments.map(inst => (
                      <option key={inst} value={inst}>{inst}</option>
                    ))}
                    {!dynamicInstruments.includes(formData.instrument || "violao") && (
                      <option value={formData.instrument || "violao"}>{formData.instrument || "violao"}</option>
                    )}
                  </select>
                </div>
              </div>

              {formData.status !== 'remarcada' && (
                <>
                  <div className="group">
                    <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wider ml-1 group-focus-within:text-amber-600 transition-colors">Data</label>
                    <input
                      type="date"
                      required
                      value={formData.date || ""}
                      onChange={e => setFormData({ ...formData, date: e.target.value })}
                      className="w-full bg-white border border-gray-300 rounded-xl p-3.5 text-gray-900 focus:bg-white focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10 outline-none transition-all hover:bg-gray-50 shadow-sm appearance-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="group">
                      <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wider ml-1 group-focus-within:text-amber-600 transition-colors">Início</label>
                      <select
                        required
                        value={formData.startTime || ""}
                        onChange={e => {
                          const newStart = e.target.value;
                          const newEnd = calculateEndTime(newStart);
                          setFormData({ ...formData, startTime: newStart, endTime: newEnd });
                        }}
                        className="w-full bg-white border border-gray-300 rounded-xl p-3.5 text-gray-900 focus:bg-white focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10 outline-none transition-all hover:bg-gray-50 shadow-sm appearance-none cursor-pointer"
                      >
                        <option value="" disabled>Selecione</option>
                        {HOURS_LIST.map(time => (
                          <option key={time} value={time}>{time}</option>
                        ))}
                      </select>
                    </div>
                    <div className="group">
                      <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wider ml-1 group-focus-within:text-amber-600 transition-colors">Término (50 min)</label>
                      <select
                        required
                        disabled
                        value={formData.endTime || ""}
                        className="w-full bg-gray-100 border border-gray-200 rounded-xl p-3.5 text-gray-600 cursor-not-allowed outline-none font-medium opacity-90 appearance-none"
                        title="O término é calculado automaticamente (30 minutos de duração)"
                      >
                        <option value={formData.endTime || ""}>{formData.endTime || ""}</option>
                      </select>
                    </div>
                  </div>
                  <p className="text-[10px] text-gray-400 -mt-2 ml-1">Horário de Brasília (GMT-3)</p>
                </>
              )}

              <div className="group">
                <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wider ml-1 group-focus-within:text-amber-600 transition-colors">Status</label>
                <select
                  required
                  value={formData.status || "agendada"}
                  onChange={e => setFormData({ ...formData, status: e.target.value as any })}
                  className="w-full bg-white border border-gray-300 rounded-xl p-3.5 text-gray-900 focus:bg-white focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10 outline-none transition-all hover:bg-gray-50 shadow-sm appearance-none cursor-pointer font-bold capitalize"
                >
                  <option value="agendada">Agendada</option>
                  <option value="aguardando_pagamento">Aguardando Pagamento</option>
                  <option value="realizada">Realizada</option>
                  <option value="cancelada">Cancelada</option>
                  <option value="remarcada">Remarcada</option>
                </select>
              </div>

              {editingLesson && formData.status === 'remarcada' && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-4">
                  <div className="group">
                    <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-widest">Remarcar para *</label>
                    <input
                      type="date"
                      required
                      min={getLocalISODate()}
                      value={remarcarNovaData}
                      onChange={e => setRemarcarNovaData(e.target.value)}
                      className="w-full bg-white border border-gray-300 rounded-xl p-3.5 text-gray-900 focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10 outline-none transition-all hover:bg-gray-50 shadow-sm appearance-none"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="group">
                      <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-widest">Novo horário *</label>
                      <select
                        required
                        value={remarcarNovoHorario}
                        onChange={e => setRemarcarNovoHorario(e.target.value)}
                        className="w-full bg-white border border-gray-300 rounded-xl p-3.5 text-gray-900 focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10 outline-none transition-all hover:bg-gray-50 shadow-sm appearance-none cursor-pointer"
                      >
                        <option value="">Selecione</option>
                        {HOURS_LIST.map(time => (
                          <option key={time} value={time}>{time}</option>
                        ))}
                      </select>
                    </div>
                    <div className="group">
                      <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-widest">Término (50 min)</label>
                      <input
                        readOnly
                        value={remarcarNovoHorario ? calculateEndTime(remarcarNovoHorario) : ''}
                        className="w-full bg-gray-100 border border-gray-200 rounded-xl p-3.5 text-gray-600 outline-none cursor-not-allowed"
                      />
                    </div>
                  </div>
                  <p className="text-[10px] text-gray-400 -mt-2 ml-1">Horário de Brasília (GMT-3)</p>
                  <div className="group">
                    <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-widest">Motivo (opcional)</label>
                    <textarea
                      rows={2}
                      value={remarcarMotivo}
                      onChange={e => setRemarcarMotivo(e.target.value)}
                      placeholder="Ex: Compromisso imprevisto..."
                      className="w-full bg-white border border-gray-300 rounded-xl p-3.5 text-gray-900 focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10 outline-none transition-all placeholder-gray-400 hover:bg-gray-50 shadow-sm resize-none"
                    />
                  </div>
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3">
                    A aula atual será marcada como <strong>remarcada</strong> e uma nova aula será criada no horário escolhido acima. O aluno será notificado.
                  </p>
                </div>
              )}

              {!editingLesson && (
                <div className="group p-4 bg-amber-500/5 border border-amber-500/20 rounded-xl">
                  <label className="block text-xs font-bold text-amber-600 mb-1.5 uppercase tracking-wider ml-1">Repetir esta aula?</label>
                  <select
                    value={recurrenceWeeks}
                    onChange={e => setRecurrenceWeeks(Number(e.target.value))}
                    className="w-full bg-white border border-amber-500/40 rounded-xl p-3 text-amber-700 focus:bg-white focus:border-amber-500 outline-none transition-all cursor-pointer font-bold"
                  >
                    <option value={1}>Não repetir</option>
                    <option value={0}>Repetir pelo mês completo</option>
                    <option value={12}>Repetir por 1 Trimestre</option>
                    <option value={24}>Repetir por 1 Semestre</option>
                  </select>
                  <p className="text-[10px] text-gray-500 mt-2 ml-1 leading-tight">Se escolher repetir, o sistema criará aulas no mesmo horário e dia da semana pelas próximas X semanas automaticamente.</p>

                </div>
              )}

              {formData.status !== 'remarcada' && (
                <div className="group">
                  <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wider ml-1 group-focus-within:text-amber-600 transition-colors">Notas / Recomendações</label>
                  <textarea
                    rows={2}
                    placeholder="Escreva algo para lembrar depois..."
                    value={formData.notes || ""}
                    onChange={e => setFormData({ ...formData, notes: e.target.value })}
                    className="w-full bg-white border border-gray-300 rounded-xl p-3.5 text-gray-900 focus:bg-white focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10 outline-none transition-all placeholder-gray-400 hover:bg-gray-50 shadow-sm resize-none leading-relaxed"
                  />
                </div>
              )}

              {/* O aluno avisou que não pode vir: em vez de cancelar (que o
                  registra como cancelamento e só gera crédito na primeira vez
                  da vida dele), o professor devolve a escolha do horário. */}
              {editingLesson && formData.status === 'agendada' && (
                <div className="pt-5 mt-2 border-t border-gray-200">
                  {!showReleaseConfirm ? (
                    <button
                      type="button"
                      onClick={() => setShowReleaseConfirm(true)}
                      className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-xl transition-all active:scale-95"
                    >
                      <UserCheck className="w-4 h-4" /> Deixar o aluno remarcar
                    </button>
                  ) : (
                    <div className="p-4 bg-purple-50 border border-purple-200 rounded-xl space-y-3">
                      <p className="text-xs text-purple-900 leading-relaxed">
                        O horário será <strong>liberado na sua agenda</strong> e o aluno receberá o direito a{' '}
                        <strong>1 aula de reposição</strong> (válida por 30 dias) para escolher um novo horário.
                        A remarcação ainda passará pela sua aprovação em Solicitações.
                      </p>
                      <textarea
                        rows={2}
                        placeholder="Motivo (opcional) — ex: aluno avisou que não poderá comparecer"
                        value={releaseReason}
                        onChange={e => setReleaseReason(e.target.value)}
                        className="w-full bg-white border border-purple-200 rounded-lg p-3 text-sm text-gray-900 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/10 outline-none transition-all placeholder-gray-400 resize-none"
                      />
                      <div className="flex flex-col-reverse sm:flex-row gap-2">
                        <button
                          type="button"
                          onClick={() => { setShowReleaseConfirm(false); setReleaseReason(''); }}
                          disabled={isReleasing}
                          className="flex-1 px-4 py-2.5 text-sm font-semibold text-gray-700 bg-white hover:bg-gray-100 border border-gray-300 rounded-lg transition-all disabled:opacity-50"
                        >
                          Voltar
                        </button>
                        <button
                          type="button"
                          onClick={handleReleaseForStudentReschedule}
                          disabled={isReleasing}
                          className="flex-1 px-4 py-2.5 text-sm font-bold text-white bg-purple-600 hover:bg-purple-500 rounded-lg transition-all active:scale-95 disabled:opacity-50"
                        >
                          {isReleasing ? 'Liberando...' : 'Confirmar liberação'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="pt-6 mt-4 border-t border-gray-200 flex flex-col-reverse sm:flex-row justify-end gap-3 shrink-0 w-full">
                <button type="button" onClick={handleCloseModal} className="w-full sm:w-auto px-6 py-3 text-sm font-semibold text-gray-700 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded-xl transition-all active:scale-95 text-center">
                  Cancelar
                </button>
                <button type="submit" disabled={isSaving} className="w-full sm:w-auto px-8 py-3 text-sm font-bold text-gray-900 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 rounded-xl shadow-[0_0_15px_rgba(245,158,11,0.3)] transform hover:-translate-y-0.5 active:scale-95 transition-all text-center">
                  {isSaving ? "Salvando..." : "Salvar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}