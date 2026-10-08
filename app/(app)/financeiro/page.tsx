"use client";

import { useState, useMemo, useEffect, useCallback, memo } from "react";
import { useAppContext, Payment, PaymentMethod } from "../AppContext";
import { CheckCircle, AlertCircle, Clock, TrendingUp, Wallet, AlertTriangle, RefreshCw, HandCoins, Trash2 } from "lucide-react";
import { updatePaymentStatusDB, createManualPayment, renegotiateOverduePayment, settlePaymentManually, cancelPaymentManually } from "../agenda/actions";
import { getLocalISODate } from "@/lib/utils";
import { useSortableRows, SortableTh, type SortState } from "@/lib/sortable-rows";

// Ordem de urgência da coluna Situação — o que o professor precisa ver primeiro.
// Alfabética colocaria "Cancelado" antes de "Atrasado", que é o oposto do útil.
const STATUS_PRIORITY: Record<string, number> = {
  vencido: 0, pendente: 1, pago: 2, renegociado: 3, cancelado: 4,
};

const STATUS_CONFIG: Record<string, { label: string; classes: string }> = {
  pago: {
    label: "Recebido",
    classes: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
  },
  pendente: {
    label: "Pendente",
    classes: "text-amber-500 bg-amber-500/10 border-amber-500/20",
  },
  vencido: {
    label: "Atrasado",
    classes: "text-red-400 bg-red-400/10 border-red-400/20",
  },
  renegociado: {
    label: "Renegociado",
    classes: "text-purple-400 bg-purple-400/10 border-purple-400/20",
  },
  cancelado: {
    label: "Cancelado",
    classes: "text-gray-500 bg-gray-500/10 border-gray-500/20",
  },
};

interface PaymentsListProps {
  /** Já filtradas e ordenadas pela página. */
  rows: Payment[];
  sort: SortState<'date' | 'studentName' | 'amount' | 'status'>;
  onSort: (key: 'date' | 'studentName' | 'amount' | 'status') => void;
  onRenegotiate: (payment: Payment) => void;
  onSettle: (payment: Payment) => void;
  onEdit: (payment: Payment) => void;
}

// A lista (cards no mobile + tabela no desktop) é a parte mais cara da tela: uma
// linha por lançamento, sem limite, e o histórico só cresce. Ficava inline na
// página, que re-renderiza a cada tecla digitada em QUALQUER modal (lançar,
// receber, renegociar) — refazendo todas as linhas a cada letra. Com memo, e
// handlers estáveis vindos da página, ela só renderiza quando as linhas, a
// ordenação ou as ações mudam.
const PaymentsList = memo(function PaymentsList({
  rows, sort, onSort, onRenegotiate, onSettle, onEdit,
}: PaymentsListProps) {
  return (
    <>
      {/* Lista de Lançamentos em Cards — Mobile / Tablet */}
      <div className="lg:hidden divide-y divide-gray-700/50">
        {rows.length === 0 && (
          <div className="px-6 py-12 text-center text-gray-500 text-sm">Nenhum lançamento financeiro registrado.</div>
        )}
        {rows.map((payment) => {
          const cfg = STATUS_CONFIG[payment.status] ?? STATUS_CONFIG.pendente;
          // Linha otimista: id ainda não existe no banco, então nenhuma ação
          // pode ser disparada nela até o refresh trazer o registro real.
          const isOptimistic = payment.id.startsWith('temp-');
          const canReceive = (payment.status === "vencido" || payment.status === "pendente") && !isOptimistic;
          const canRenegotiate = payment.status === "vencido" && !isOptimistic;
          const isTerminal = payment.status === "renegociado" || payment.status === "cancelado";
          const canEdit = !isTerminal && !isOptimistic;
          return (
            <div key={payment.id} className={`p-4 ${payment.status === 'vencido' ? 'bg-red-500/[0.03]' : ''} ${isTerminal ? 'opacity-50' : ''}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-white truncate">{payment.studentName}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{payment.date.split("-").reverse().join("/")} &bull; {payment.method}</p>
                  {payment.notes && <p className="text-xs text-gray-500 truncate mt-0.5">{payment.notes}</p>}
                </div>
                <div className="text-right shrink-0">
                  <p className="font-black text-white whitespace-nowrap">R$ {Number(payment.amount).toFixed(2)}</p>
                  <span className={`inline-block mt-1 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider border rounded-full ${cfg.classes}`}>
                    {cfg.label}
                  </span>
                  {canReceive && payment.alunoAvisouEm && (
                    <span
                      title="O aluno informou que já fez o Pix. Confira no extrato do banco e dê baixa."
                      className="block mt-1 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider border rounded-full text-sky-300 bg-sky-500/10 border-sky-500/30"
                    >
                      Aluno avisou que pagou
                    </span>
                  )}
                </div>
              </div>
              {(canRenegotiate || canReceive || canEdit) && (
                <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-gray-700/50">
                  {canRenegotiate && (
                    <button onClick={() => onRenegotiate(payment)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20 text-[10px] font-black uppercase tracking-widest">
                      <RefreshCw className="w-3 h-3" /> Renegociar
                    </button>
                  )}
                  {canReceive && (
                    <button onClick={() => onSettle(payment)} className="px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-black uppercase tracking-widest">
                      Receber
                    </button>
                  )}
                  {canEdit && (
                    <button onClick={() => onEdit(payment)} className="ml-auto px-3 py-1.5 rounded-lg bg-amber-500/10 text-amber-500 border border-amber-500/20 text-[10px] font-black uppercase tracking-widest">
                      Editar
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="overflow-x-auto hidden lg:block">
        <table className="w-full text-left text-sm text-gray-300">
          <thead className="bg-gray-900/50 text-xs text-gray-400 uppercase tracking-widest border-b border-gray-700">
            <tr>
              <SortableTh columnKey="date" sort={sort} onSort={onSort}>Data</SortableTh>
              <SortableTh columnKey="studentName" sort={sort} onSort={onSort}>Aluno / Origem</SortableTh>
              <SortableTh columnKey="amount" sort={sort} onSort={onSort}>Valor</SortableTh>
              <th className="px-6 py-4 font-bold">Método</th>
              <SortableTh columnKey="status" sort={sort} onSort={onSort} className="text-center">Situação</SortableTh>
              <th className="px-6 py-4 font-bold text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                  Nenhum lançamento financeiro registrado.
                </td>
              </tr>
            )}
            {rows.map((payment) => {
              const cfg = STATUS_CONFIG[payment.status] ?? STATUS_CONFIG.pendente;
              const isOptimistic = payment.id.startsWith('temp-');
              const canReceive = (payment.status === "vencido" || payment.status === "pendente") && !isOptimistic;
              const canRenegotiate = payment.status === "vencido" && !isOptimistic;
              const isTerminal = payment.status === "renegociado" || payment.status === "cancelado";
              const canEdit = !isTerminal && !isOptimistic;
              return (
                <tr
                  key={payment.id}
                  className={`border-b border-gray-700/50 hover:bg-gray-700/30 transition-colors group ${payment.status === 'vencido' ? 'bg-red-500/[0.03]' : ''} ${isTerminal ? 'opacity-50' : ''}`}
                >
                  <td className="px-6 py-4 whitespace-nowrap text-gray-400">
                    {payment.date.split("-").reverse().join("/")}
                  </td>
                  <td className="px-6 py-4">
                    <span className="font-semibold text-white block">{payment.studentName}</span>
                    {payment.notes && (
                      <span className="text-xs text-gray-500 block truncate max-w-[200px]">{payment.notes}</span>
                    )}
                  </td>
                  <td className="px-6 py-4 font-black text-white whitespace-nowrap">
                    R$ {Number(payment.amount).toFixed(2)}
                  </td>
                  <td className="px-6 py-4">
                    <span className="px-2.5 py-1 text-xs bg-gray-700 text-gray-300 rounded font-medium border border-gray-600">
                      {payment.method}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className={`px-2.5 py-1 text-[10px] font-black uppercase tracking-wider border rounded-full ${cfg.classes}`}>
                      {cfg.label}
                    </span>
                    {canReceive && payment.alunoAvisouEm && (
                      <span
                        title="O aluno informou que já fez o Pix. Confira no extrato do banco e dê baixa."
                        className="block mt-1.5 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider border rounded-full text-sky-300 bg-sky-500/10 border-sky-500/30"
                      >
                        Aluno avisou que pagou
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {canRenegotiate && (
                        <button
                          onClick={() => onRenegotiate(payment)}
                          className="px-3 py-1.5 rounded-lg bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 border border-purple-500/20 text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap flex items-center gap-1"
                          title="Renegociar prazo de pagamento"
                        >
                          <RefreshCw className="w-3 h-3" /> Renegociar
                        </button>
                      )}
                      {canReceive && (
                        <button
                          onClick={() => onSettle(payment)}
                          className="px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20 text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap"
                          title="Registrar como Recebido"
                        >
                          Receber
                        </button>
                      )}
                      {canEdit && (
                        <button
                          onClick={() => onEdit(payment)}
                          className="text-amber-500 hover:text-amber-400 font-semibold px-3 py-1.5 rounded bg-amber-500/10 hover:bg-amber-500/20 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100 text-xs"
                        >
                          Editar
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
});

export default function FinanceiroPage() {
  const { payments, setPayments, students, refreshPayments } = useAppContext();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState<Partial<Payment>>({});
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const [renegotiating, setRenegotiating] = useState<Payment | null>(null);
  const [newDueDate, setNewDueDate] = useState('');
  const [renegNotes, setRenegNotes] = useState('');
  const [renegLoading, setRenegLoading] = useState(false);

  const [cancelLoading, setCancelLoading] = useState(false);
  // Cancelado é histórico: fica fora da lista por padrão, mas continua
  // acessível — o professor precisa poder conferir o que excluiu.
  const [showCancelled, setShowCancelled] = useState(false);

  const [settling, setSettling] = useState<Payment | null>(null);
  const [settleMethod, setSettleMethod] = useState<'pix' | 'dinheiro' | 'transferencia'>('pix');
  const [settleDate, setSettleDate] = useState('');
  const [settleNotes, setSettleNotes] = useState('');
  const [settleLoading, setSettleLoading] = useState(false);

  const showNotification = (message: string, type: 'success' | 'error') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const totalRecebido = useMemo(
    () => payments.filter(p => p.status === "pago").reduce((acc, p) => acc + p.amount, 0),
    [payments]
  );
  // Mesma régua do dashboard (INADIMPLÊNCIA): pendente com vencimento passado
  // já conta como atrasado, mesmo antes de o cron marcar 'vencido' — e sai de
  // "A Receber" para não contar duas vezes.
  const today = getLocalISODate();
  const totalPendente = useMemo(
    () => payments.filter(p => p.status === "pendente" && p.date >= today).reduce((acc, p) => acc + p.amount, 0),
    [payments, today]
  );
  const totalVencido = useMemo(
    () => payments.filter(p => p.status === "vencido" || (p.status === "pendente" && p.date < today)).reduce((acc, p) => acc + p.amount, 0),
    [payments, today]
  );

  const cancelledCount = useMemo(
    () => payments.filter(p => p.status === 'cancelado').length,
    [payments]
  );
  const visiblePayments = useMemo(
    () => (showCancelled ? payments : payments.filter(p => p.status !== 'cancelado')),
    [payments, showCancelled]
  );

  // Ordenação por coluna. O padrão (Data ↓) é exatamente a ordem que o servidor
  // já devolvia, então a tela abre igual ao que era antes.
  const { sorted: sortedPayments, sort, toggle } = useSortableRows(visiblePayments, { key: 'date', dir: 'desc' }, {
    date: (p: Payment) => p.date,
    studentName: (p: Payment) => p.studentName,
    amount: (p: Payment) => Number(p.amount) || 0,
    status: (p: Payment) => STATUS_PRIORITY[p.status] ?? 99,
  });

  const openNewModal = () => {
    setFormData({ date: getLocalISODate(), method: "Pix", status: "pago" });
    setIsModalOpen(true);
  };

  const handleStudentNameChange = (name: string) => {
    const student = students.find((s: any) => s.name === name);
    if (student) {
      const pkg = (student.packagetype || 'avulsa').toLowerCase();
      const monthName = new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
      const autoNotes = pkg !== 'avulsa' ? `Mensalidade de ${monthName}` : '';
      setFormData(prev => ({
        ...prev,
        studentName: name,
        amount: student.lessonPrice || prev.amount,
        method: (student.paymentMethod as PaymentMethod) || prev.method,
        notes: autoNotes || prev.notes,
      }));
    } else {
      setFormData(prev => ({ ...prev, studentName: name }));
    }
  };

  // Faturas geradas/vencidas pelo cron depois do carregamento não apareceriam
  // sem F5. O maxAge evita refazer a busca logo após o seed do servidor;
  // as chamadas de rollback usam refreshPayments() sem argumento, então sempre forçam.
  useEffect(() => {
    refreshPayments({ maxAgeMs: 30_000 });
  }, [refreshPayments]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.id) {
      // Atualização otimista imediata
      setPayments(payments.map(p =>
        p.id === formData.id ? { ...p, status: formData.status as Payment['status'] } : p
      ));
      setIsModalOpen(false);
      setFormData({});
      const ok = await updatePaymentStatusDB(formData.id, formData.status as any);
      if (!ok) {
        await refreshPayments(); // rollback se falhou
        showNotification("Erro ao atualizar. Tente novamente.", "error");
      } else {
        showNotification("Lançamento atualizado.", "success");
      }
    } else {
      // Criação: persiste no banco e adiciona localmente
      const result = await createManualPayment({
        studentName: formData.studentName || '',
        amount: formData.amount || 0,
        duedate: formData.date || getLocalISODate(new Date()),
        method: formData.method || 'Pix',
        status: formData.status || 'pago',
        notes: formData.notes,
      });
      if (result.success) {
        // Adiciona o novo pagamento ao estado local sem refetch
        const newPayment: Payment = {
          // `temp-`: id que não existe no banco. Sem essa marca, clicar em
          // Receber/Editar antes do refresh mandava um id inventado ao servidor
          // e voltava "Pagamento não encontrado", sem o professor entender.
          id: result.id || `temp-${crypto.randomUUID()}`,
          studentName: formData.studentName || '',
          amount: formData.amount || 0,
          date: formData.date || getLocalISODate(new Date()),
          method: (formData.method || 'Pix') as PaymentMethod,
          status: (formData.status || 'pago') as Payment['status'],
          notes: formData.notes,
        };
        setPayments([newPayment, ...payments]);
        setIsModalOpen(false);
        setFormData({});
        showNotification("Recebimento registrado.", "success");
      } else {
        showNotification(result.error || "Erro ao registrar. Tente novamente.", "error");
      }
    }
  };

  // Handlers da lista com identidade ESTÁVEL (só chamam setState): é o que permite
  // ao PaymentsList (memo) pular o re-render enquanto o professor digita nos modais.
  const openSettleModal = useCallback((payment: Payment) => {
    setSettleMethod('pix');
    setSettleDate(getLocalISODate(new Date()));
    setSettleNotes('');
    setSettling(payment);
  }, []);

  const openEditModal = useCallback((payment: Payment) => {
    setFormData(payment);
    setIsModalOpen(true);
  }, []);

  const methodLabel: Record<string, PaymentMethod> = {
    pix: 'Pix',
    dinheiro: 'Dinheiro',
    transferencia: 'Transferência',
  };

  const handleSettle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settling) return;
    setSettleLoading(true);
    try {
      // Atualização otimista imediata
      setPayments(payments.map(p =>
        p.id === settling.id ? { ...p, status: 'pago', method: methodLabel[settleMethod] || p.method } : p
      ));
      const result = await settlePaymentManually(settling.id, {
        method: settleMethod,
        paymentdate: settleDate,
        notes: settleNotes || undefined,
      });
      if (!result.success) {
        await refreshPayments(); // rollback se falhou
        showNotification(result.error || "Erro ao registrar pagamento. Tente novamente.", "error");
        return;
      }
      setSettling(null);
      if (result.warning) {
        showNotification(result.warning, "error");
      } else {
        showNotification(`Pagamento de ${settling.studentName} registrado como recebido. O aluno foi notificado.`, "success");
      }
      // Sincroniza em background para garantir dados reais do banco
      refreshPayments();
    } catch {
      await refreshPayments();
      showNotification("Erro inesperado ao registrar pagamento.", "error");
    } finally {
      setSettleLoading(false);
    }
  };

  const handleCancelPayment = async (payment: Payment) => {
    const valor = `R$ ${Number(payment.amount || 0).toFixed(2)}`;
    const confirmed = window.confirm(
      `Excluir o lançamento de ${valor} de ${payment.studentName}?\n\n` +
      `A cobrança será cancelada no Asaas e o aluno deixa de dever este valor. ` +
      `O registro sai da lista, mas fica guardado em "mostrar cancelados".`
    );
    if (!confirmed) return;

    setCancelLoading(true);
    try {
      const result = await cancelPaymentManually(payment.id);
      if (!result.success) {
        showNotification(result.error || 'Erro ao excluir o lançamento.', 'error');
        return;
      }
      setIsModalOpen(false);
      setFormData({});
      // O warning (ex.: cobrança do Asaas não cancelada) precisa aparecer: é
      // ação manual pendente para o professor.
      showNotification(
        result.warning || `Lançamento de ${payment.studentName} excluído.`,
        result.warning ? 'error' : 'success'
      );
      await refreshPayments();
    } catch {
      showNotification('Erro inesperado ao excluir o lançamento.', 'error');
    } finally {
      setCancelLoading(false);
    }
  };

  const openRenegotiateModal = useCallback((payment: Payment) => {
    const defaultDate = new Date();
    defaultDate.setDate(defaultDate.getDate() + 7);
    setNewDueDate(getLocalISODate(defaultDate));
    setRenegNotes('');
    setRenegotiating(payment);
  }, []);

  const handleRenegotiate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renegotiating) return;
    setRenegLoading(true);
    try {
      const result = await renegotiateOverduePayment(renegotiating.id, newDueDate, renegNotes);
      if (!result.success) {
        showNotification(result.error || 'Erro ao renegociar.', 'error');
        return;
      }

      // Atualização otimista: marca o original como renegociado e adiciona o novo
      const updatedPayments = payments.map((p: Payment) =>
        p.id === renegotiating.id ? { ...p, status: 'renegociado' as Payment['status'] } : p
      );
      const newEntry: Payment = {
        // Id local até o refreshPayments abaixo trazer o registro real.
        id: `temp-${crypto.randomUUID()}`,
        studentName: renegotiating.studentName,
        amount: renegotiating.amount,
        date: newDueDate,
        method: renegotiating.method,
        status: 'pendente',
        notes: renegNotes || `Renegociado de ${renegotiating.date.split('-').reverse().join('/')}`,
        renegotiated_from: renegotiating.id,
      };
      setPayments([newEntry, ...updatedPayments]);
      // Sincroniza em background para garantir dados reais do banco
      refreshPayments();

      setRenegotiating(null);
      showNotification(`Renegociação criada! Novo vencimento: ${newDueDate.split('-').reverse().join('/')}.`, 'success');
    } catch {
      showNotification('Erro inesperado ao renegociar.', 'error');
    } finally {
      setRenegLoading(false);
    }
  };

  return (
    <div className="flex flex-col w-full min-h-full bg-gray-900 p-4 md:p-8 rounded-tl-2xl animate-fade-in space-y-8">

      {notification && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[9999] animate-fade-in-up">
          <div className={`flex items-center gap-3 px-6 py-4 rounded-2xl shadow-2xl border backdrop-blur-xl ${notification.type === 'success' ? 'bg-green-500/10 border-green-500/20 text-green-500' : 'bg-red-500/10 border-red-500/20 text-red-500'}`}>
            {notification.type === 'success' ? <CheckCircle className="w-6 h-6" /> : <AlertCircle className="w-6 h-6" />}
            <p className="font-bold text-sm">{notification.message}</p>
          </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-black text-white tracking-tighter italic uppercase">
            Caixa e <span className="text-amber-500">Recebimentos</span>
          </h1>
          <p className="text-gray-500 text-sm mt-1 font-medium tracking-wide">Controle financeiro das suas aulas.</p>
        </div>
        <button
          onClick={openNewModal}
          className="bg-amber-500 hover:bg-amber-400 text-gray-900 font-black py-4 px-8 rounded-2xl shadow-xl shadow-amber-500/20 hover:shadow-amber-500/40 transition-all flex items-center justify-center gap-3 uppercase tracking-widest text-xs active:scale-95 w-full md:w-auto"
        >
          <TrendingUp className="w-5 h-5" />
          Lançar Recebimento
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <div className="bg-emerald-500/10 border border-emerald-500/20 p-5 rounded-2xl flex items-center gap-4">
          <div className="w-12 h-12 bg-emerald-500/10 rounded-xl flex items-center justify-center shrink-0">
            <Wallet className="w-6 h-6 text-emerald-400" />
          </div>
          <div>
            <p className="text-emerald-500 font-bold text-xs uppercase tracking-widest mb-1">Recebido (Mês)</p>
            <h2 className="text-2xl font-black text-white">R$ {totalRecebido.toFixed(2)}</h2>
          </div>
        </div>
        <div className="bg-amber-500/10 border border-amber-500/20 p-5 rounded-2xl flex items-center gap-4">
          <div className="w-12 h-12 bg-amber-500/10 rounded-xl flex items-center justify-center shrink-0">
            <Clock className="w-6 h-6 text-amber-400" />
          </div>
          <div>
            <p className="text-amber-500 font-bold text-xs uppercase tracking-widest mb-1">A Receber</p>
            <h2 className="text-2xl font-black text-white">R$ {totalPendente.toFixed(2)}</h2>
          </div>
        </div>
        <div className="bg-red-500/10 border border-red-500/20 p-5 rounded-2xl flex items-center gap-4">
          <div className="w-12 h-12 bg-red-500/10 rounded-xl flex items-center justify-center shrink-0">
            <AlertTriangle className="w-6 h-6 text-red-400" />
          </div>
          <div>
            <p className="text-red-400 font-bold text-xs uppercase tracking-widest mb-1">Atrasado</p>
            <h2 className="text-2xl font-black text-white">R$ {totalVencido.toFixed(2)}</h2>
          </div>
        </div>
      </div>

      <div className="bg-gray-800 rounded-2xl border border-gray-700 shadow-xl overflow-hidden">
        <div className="p-5 border-b border-gray-700 bg-gray-800/80 flex items-center justify-between">
          <h3 className="text-lg font-bold text-white">Lançamentos</h3>
          <div className="flex items-center gap-3">
            {cancelledCount > 0 && (
              <button
                type="button"
                onClick={() => setShowCancelled(v => !v)}
                className="text-xs font-semibold text-gray-400 hover:text-amber-500 underline underline-offset-4 decoration-gray-600 hover:decoration-amber-500 transition-colors"
              >
                {showCancelled ? 'Ocultar cancelados' : `Mostrar cancelados (${cancelledCount})`}
              </button>
            )}
            <span className="text-xs text-gray-500 font-medium">{visiblePayments.length} registro{visiblePayments.length !== 1 ? 's' : ''}</span>
          </div>
        </div>

        <PaymentsList
          rows={sortedPayments}
          sort={sort}
          onSort={toggle}
          onRenegotiate={openRenegotiateModal}
          onSettle={openSettleModal}
          onEdit={openEditModal}
        />
      </div>

      {/* Modal de Renegociação */}
      {renegotiating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/80 animate-fade-in">
          <div className="bg-gray-800/95 ring-1 ring-white/10 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden border border-purple-500/20">
            <div className="px-8 py-6 border-b border-gray-700/50 bg-gradient-to-r from-purple-900/30 to-gray-800/50 flex justify-between items-center">
              <div>
                <h2 className="text-xl font-black text-white flex items-center gap-2">
                  <RefreshCw className="w-5 h-5 text-purple-400" /> Renegociar Pagamento
                </h2>
                <p className="text-sm text-gray-400 mt-1">
                  {renegotiating.studentName} &mdash; R$ {Number(renegotiating.amount).toFixed(2)}
                </p>
              </div>
              <button
                onClick={() => setRenegotiating(null)}
                className="text-gray-400 hover:text-white transition-colors bg-gray-700/50 p-2 rounded-lg"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleRenegotiate} className="p-8 space-y-5">
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
                <p className="text-red-400 text-xs font-bold uppercase tracking-widest mb-1">Vencimento original</p>
                <p className="text-white font-black">{renegotiating.date.split('-').reverse().join('/')}</p>
              </div>

              <div className="group">
                <label className="block text-xs font-bold text-gray-400 mb-1.5 uppercase tracking-wider ml-1 group-focus-within:text-purple-400 transition-colors">
                  Novo vencimento *
                </label>
                <input
                  type="date"
                  required
                  min={getLocalISODate(new Date())}
                  value={newDueDate}
                  onChange={e => setNewDueDate(e.target.value)}
                  className="w-full bg-gray-900/50 border border-gray-700/50 rounded-xl p-3.5 text-white focus:bg-gray-900 focus:border-purple-500/50 focus:ring-4 focus:ring-purple-500/10 outline-none transition-all shadow-inner appearance-none uppercase"
                />
              </div>

              <div className="group">
                <label className="block text-xs font-bold text-gray-400 mb-1.5 uppercase tracking-wider ml-1 group-focus-within:text-purple-400 transition-colors">
                  Motivo / Observação
                </label>
                <textarea
                  rows={3}
                  value={renegNotes}
                  onChange={e => setRenegNotes(e.target.value)}
                  className="w-full bg-gray-900/50 border border-gray-700/50 rounded-xl p-3.5 text-white focus:bg-gray-900 focus:border-purple-500/50 outline-none transition-all placeholder-gray-600 shadow-inner resize-none"
                  placeholder="Ex: Aluno solicitou mais prazo..."
                />
              </div>

              <p className="text-xs text-gray-500 leading-relaxed">
                O pagamento atual será marcado como <span className="text-purple-400 font-bold">Renegociado</span> e um novo será criado com o novo vencimento. O aluno será notificado e desbloqueado.
              </p>

              <div className="pt-2 border-t border-gray-700 flex flex-col-reverse sm:flex-row justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setRenegotiating(null)}
                  className="w-full sm:w-auto px-6 py-3 text-sm font-semibold text-gray-300 hover:text-white bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded-xl transition-all active:scale-95 text-center"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={renegLoading || !newDueDate}
                  className="w-full sm:w-auto px-8 py-3 text-sm font-bold text-white bg-purple-600 hover:bg-purple-500 rounded-xl shadow-[0_0_15px_rgba(168,85,247,0.3)] hover:-translate-y-0.5 active:scale-95 transition-all text-center disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {renegLoading ? 'Processando...' : 'Confirmar Renegociação'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Baixa Manual (Receber) */}
      {settling && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/80 animate-fade-in">
          <div className="bg-gray-800/95 ring-1 ring-white/10 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden border border-emerald-500/20">
            <div className="px-8 py-6 border-b border-gray-700/50 bg-gradient-to-r from-emerald-900/30 to-gray-800/50 flex justify-between items-center">
              <div>
                <h2 className="text-xl font-black text-white flex items-center gap-2">
                  <HandCoins className="w-5 h-5 text-emerald-400" /> Registrar Recebimento
                </h2>
                <p className="text-sm text-gray-400 mt-1">
                  {settling.studentName} &mdash; R$ {Number(settling.amount).toFixed(2)}
                </p>
              </div>
              <button
                onClick={() => setSettling(null)}
                className="text-gray-400 hover:text-white transition-colors bg-gray-700/50 p-2 rounded-lg"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSettle} className="p-8 space-y-5">
              <div className="group">
                <label className="block text-xs font-bold text-gray-400 mb-1.5 uppercase tracking-wider ml-1 group-focus-within:text-emerald-400 transition-colors">
                  Como você recebeu? *
                </label>
                <select
                  required
                  value={settleMethod}
                  onChange={e => setSettleMethod(e.target.value as 'pix' | 'dinheiro' | 'transferencia')}
                  className="w-full bg-gray-900/50 border border-gray-700/50 rounded-xl p-3.5 text-white focus:bg-gray-900 focus:border-emerald-500/50 focus:ring-4 focus:ring-emerald-500/10 outline-none transition-all shadow-inner appearance-none cursor-pointer"
                >
                  <option value="pix">Pix</option>
                  <option value="dinheiro">Dinheiro</option>
                  <option value="transferencia">Transferência (TED/DOC)</option>
                </select>
              </div>

              <div className="group">
                <label className="block text-xs font-bold text-gray-400 mb-1.5 uppercase tracking-wider ml-1 group-focus-within:text-emerald-400 transition-colors">
                  Data do recebimento *
                </label>
                <input
                  type="date"
                  required
                  max={getLocalISODate(new Date())}
                  value={settleDate}
                  onChange={e => setSettleDate(e.target.value)}
                  className="w-full bg-gray-900/50 border border-gray-700/50 rounded-xl p-3.5 text-white focus:bg-gray-900 focus:border-emerald-500/50 focus:ring-4 focus:ring-emerald-500/10 outline-none transition-all shadow-inner appearance-none uppercase"
                />
              </div>

              <div className="group">
                <label className="block text-xs font-bold text-gray-400 mb-1.5 uppercase tracking-wider ml-1 group-focus-within:text-emerald-400 transition-colors">
                  Observação
                </label>
                <textarea
                  rows={2}
                  value={settleNotes}
                  onChange={e => setSettleNotes(e.target.value)}
                  className="w-full bg-gray-900/50 border border-gray-700/50 rounded-xl p-3.5 text-white focus:bg-gray-900 focus:border-emerald-500/50 outline-none transition-all placeholder-gray-600 shadow-inner resize-none"
                  placeholder="Ex: Pix recebido direto na conta..."
                />
              </div>

              <p className="text-xs text-gray-500 leading-relaxed">
                O pagamento será marcado como <span className="text-emerald-400 font-bold">Recebido</span>, o aluno será notificado e, se houver uma cobrança em aberto no Asaas, ela será cancelada para evitar pagamento duplicado.
              </p>

              <div className="pt-2 border-t border-gray-700 flex flex-col-reverse sm:flex-row justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setSettling(null)}
                  className="w-full sm:w-auto px-6 py-3 text-sm font-semibold text-gray-300 hover:text-white bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded-xl transition-all active:scale-95 text-center"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={settleLoading || !settleDate}
                  className="w-full sm:w-auto px-8 py-3 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl shadow-[0_0_15px_rgba(16,185,129,0.3)] hover:-translate-y-0.5 active:scale-95 transition-all text-center disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {settleLoading ? 'Processando...' : 'Confirmar Recebimento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Edição / Novo Lançamento */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/80 animate-fade-in">
          <div className="bg-gray-800/95 ring-1 ring-white/10 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col transform transition-all border border-gray-700/50">
            <div className="px-8 py-6 border-b border-gray-700/50 bg-gradient-to-r from-gray-800 to-gray-800/50 flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-black text-white">
                  {formData.id ? "Editar Lançamento" : "Novo Recebimento"}
                </h2>
                <p className="text-sm text-gray-400 mt-1 font-medium tracking-wide">Registre os pagamentos abaixo</p>
              </div>
              <button
                onClick={() => { setIsModalOpen(false); setFormData({}); }}
                className="text-gray-400 hover:text-white transition-colors bg-gray-700/50 p-2 rounded-lg"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSave} className="p-8 space-y-6">
              <div className="group">
                <label className="block text-xs font-bold text-gray-400 mb-1.5 uppercase tracking-wider ml-1 group-focus-within:text-amber-500 transition-colors">Nome do Aluno / Origem</label>
                <select required value={formData.studentName || ""} onChange={e => handleStudentNameChange(e.target.value)}
                  className="w-full bg-gray-900/50 border border-gray-700/50 rounded-xl p-3.5 text-white focus:bg-gray-900 focus:border-amber-500/50 focus:ring-4 focus:ring-amber-500/10 outline-none transition-all shadow-inner appearance-none cursor-pointer">
                  <option value="" disabled>Selecione o aluno...</option>
                  {students.map((s: any) => (
                    <option key={s.id} value={s.name}>
                      {s.name}{s.packagetype && s.packagetype !== 'avulsa' ? ` — ${s.packagetype} · R$ ${Number(s.lessonPrice).toFixed(2)}` : ''}
                    </option>
                  ))}
                </select>
                {formData.studentName && (() => {
                  const s = students.find((s: any) => s.name === formData.studentName);
                  if (!s) return null;
                  return (
                    <p className="text-xs text-amber-500/80 mt-1.5 ml-1">
                      {s.packagetype !== 'avulsa' ? `Plano ${s.packagetype} · R$ ${Number(s.lessonPrice).toFixed(2)} · ${s.paymentMethod}` : `Aula avulsa · ${s.paymentMethod}`}
                    </p>
                  );
                })()}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="group">
                  <label className="block text-xs font-bold text-gray-400 mb-1.5 uppercase tracking-wider ml-1 group-focus-within:text-amber-500 transition-colors">Valor (R$)</label>
                  <input type="number" step="0.01" required value={formData.amount || ""} onChange={e => setFormData({ ...formData, amount: Number(e.target.value) })} className="w-full bg-gray-900/50 border border-gray-700/50 rounded-xl p-3.5 text-white focus:bg-gray-900 focus:border-amber-500/50 focus:ring-4 focus:ring-amber-500/10 outline-none transition-all shadow-inner" />
                </div>
                <div className="group">
                  <label className="block text-xs font-bold text-gray-400 mb-1.5 uppercase tracking-wider ml-1 group-focus-within:text-amber-500 transition-colors">Data</label>
                  <input type="date" required value={formData.date || ""} onChange={e => setFormData({ ...formData, date: e.target.value })} className="w-full bg-gray-900/50 border border-gray-700/50 rounded-xl p-3.5 text-white focus:bg-gray-900 focus:border-amber-500/50 focus:ring-4 focus:ring-amber-500/10 outline-none transition-all shadow-inner appearance-none uppercase" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="group">
                  <label className="block text-xs font-bold text-gray-400 mb-1.5 uppercase tracking-wider ml-1 group-focus-within:text-amber-500 transition-colors">Método</label>
                  <select required value={formData.method || "Pix"} onChange={e => setFormData({ ...formData, method: e.target.value as PaymentMethod })} className="w-full bg-gray-900/50 border border-gray-700/50 rounded-xl p-3.5 text-white focus:bg-gray-900 focus:border-amber-500/50 outline-none transition-all shadow-inner appearance-none cursor-pointer">
                    <option value="Pix">Pix</option>
                    <option value="Dinheiro">Dinheiro vivo</option>
                    <option value="Cartão">Cartão</option>
                    <option value="Transferência">Banco TED/DOC</option>
                  </select>
                </div>
                <div className="group">
                  <label className="block text-xs font-bold text-gray-400 mb-1.5 uppercase tracking-wider ml-1 group-focus-within:text-amber-500 transition-colors">Situação</label>
                  <select required value={formData.status || "pago"} onChange={e => setFormData({ ...formData, status: e.target.value as Payment['status'] })} className="w-full bg-gray-900/50 border border-gray-700/50 rounded-xl p-3.5 text-white focus:bg-gray-900 focus:border-amber-500/50 outline-none transition-all shadow-inner appearance-none cursor-pointer font-bold">
                    <option value="pago">Já Recebido</option>
                    <option value="pendente">A Receber</option>
                    <option value="vencido">Pagamento Atrasado</option>
                  </select>
                </div>
              </div>

              <div className="group">
                <label className="block text-xs font-bold text-gray-400 mb-1.5 uppercase tracking-wider ml-1 group-focus-within:text-amber-500 transition-colors">Observações</label>
                <textarea rows={2} value={formData.notes || ""} onChange={e => setFormData({ ...formData, notes: e.target.value })} className="w-full bg-gray-900/50 border border-gray-700/50 rounded-xl p-3.5 text-white focus:bg-gray-900 focus:border-amber-500/50 outline-none transition-all placeholder-gray-600 shadow-inner resize-none leading-relaxed" placeholder="Ex: Mensalidade de Janeiro..." />
              </div>

              <div className="pt-4 border-t border-gray-700 flex flex-col-reverse sm:flex-row sm:items-center gap-3">
                {/* Excluir só existe em lançamento em aberto: recebido mexeu em
                    créditos e vencimento do plano, e desfazer isso é estorno. */}
                {formData.id && (formData.status === 'pendente' || formData.status === 'vencido') && (
                  <button
                    type="button"
                    onClick={() => handleCancelPayment(formData as Payment)}
                    disabled={cancelLoading}
                    className="w-full sm:w-auto sm:mr-auto flex items-center justify-center gap-2 px-5 py-3 text-sm font-bold text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-xl transition-all active:scale-95 disabled:opacity-50"
                  >
                    <Trash2 className="w-4 h-4" />
                    {cancelLoading ? 'Excluindo...' : 'Excluir lançamento'}
                  </button>
                )}
                <button type="button" onClick={() => { setIsModalOpen(false); setFormData({}); }} className="w-full sm:w-auto px-6 py-3 text-sm font-semibold text-gray-300 hover:text-white bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded-xl transition-all active:scale-95 text-center">
                  Cancelar
                </button>
                <button type="submit" className="w-full sm:w-auto px-8 py-3 text-sm font-bold text-gray-900 bg-amber-500 hover:bg-amber-400 rounded-xl shadow-[0_0_15px_rgba(245,158,11,0.3)] hover:-translate-y-0.5 active:scale-95 transition-all text-center">
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
