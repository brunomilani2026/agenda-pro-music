"use client";

import { useState, useEffect } from "react";
import { CreditCard, ExternalLink, CheckCircle, Clock, AlertTriangle, XCircle, RefreshCw, CalendarClock, ShoppingCart, QrCode } from "lucide-react";
import { fetchAlunoPayments, fetchAlunoFinanceiroPage, renegotiateStudentPayment, generateNextStudentInvoice } from "../../actions";
import { PixPagamentoCard } from "@/components/PixAluno";
import { getLocalISODate } from "@/lib/utils";

export default function AlunoFinanceiroPage() {
  const [payments, setPayments] = useState<any[]>([]);
  const [nextInfo, setNextInfo] = useState<any | null>(null);
  const [advanceLoading, setAdvanceLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [renegInvoice, setRenegInvoice] = useState<any | null>(null);
  const [pixInvoice, setPixInvoice] = useState<any | null>(null);
  const [renegDate, setRenegDate] = useState('');
  const [renegNotes, setRenegNotes] = useState('');
  const [renegLoading, setRenegLoading] = useState(false);

  const openReneg = (invoice: any) => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    setRenegDate(getLocalISODate(d));
    setRenegNotes('');
    setRenegInvoice(invoice);
  };

  const handleGenerateLink = async (invoice: any) => {
    setRenegLoading(true);
    const today = getLocalISODate();
    const dueDate = invoice.duedate < today ? today : invoice.duedate;
    const res = await renegotiateStudentPayment(invoice.id, dueDate, 'Geração de link de pagamento');
    if (res.success && res.invoiceUrl) {
      window.location.href = res.invoiceUrl;
    } else {
      alert(res.error || 'Erro ao gerar pagamento.');
      setRenegLoading(false);
    }
  };

  const handleReneg = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    if (!renegInvoice) return;
    setRenegLoading(true);
    const res = await renegotiateStudentPayment(renegInvoice.id, renegDate, renegNotes);
    if (res.success) {
      if (res.invoiceUrl) {
        window.location.href = res.invoiceUrl;
      } else {
        alert(`Renegociação enviada! Novo vencimento: ${renegDate.split('-').reverse().join('/')}.`);
        setRenegInvoice(null);
        fetchAlunoPayments().then(p => { setPayments(p); setLoading(false); });
      }
    } else {
      alert(res.error || 'Erro ao renegociar.');
    }
    setRenegLoading(false);
  };

  const handleAdvancePayment = async () => {
    setAdvanceLoading(true);
    const res = await generateNextStudentInvoice();
    if (res.success && res.invoiceUrl) {
      window.location.href = res.invoiceUrl;
      return;
    }
    if (res.success) {
      // Sem Asaas: fatura criada como pendente — recarrega para exibir na lista.
      alert('Próxima fatura gerada! Use o botão "Pagar Agora" na lista de faturas.');
      const { payments: p, nextInfo: ni } = await fetchAlunoFinanceiroPage();
      setPayments(p);
      setNextInfo(ni);
    } else {
      alert(res.error || 'Erro ao gerar a próxima fatura.');
    }
    setAdvanceLoading(false);
  };

  useEffect(() => {
    // Uma server action só: duas chamadas separadas do cliente rodam em fila.
    fetchAlunoFinanceiroPage().then(({ payments: p, nextInfo: ni }) => {
      setPayments(p);
      setNextInfo(ni);
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="flex items-center justify-center h-full"><div className="animate-pulse text-amber-500 font-bold">Carregando financeiro...</div></div>;

  const paid = payments.filter(p => p.status === 'pago');
  const pending = payments.filter(p => p.status === 'pendente' || p.status === 'vencido');
  const totalPaid = paid.reduce((acc, p) => acc + Number(p.amount), 0);

  // Autosserviço de pacotes só para aluno avulsa — mensalista tem o plano
  // (e o preço negociado) gerenciado pelo professor.
  const showPlansCTA = nextInfo?.reason === 'not_recurring';

  const statusConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
    pago: { label: 'Pago', color: 'text-green-400 bg-green-500/10 border-green-500/20', icon: <CheckCircle className="w-3.5 h-3.5" /> },
    pendente: { label: 'Pendente', color: 'text-amber-400 bg-amber-500/10 border-amber-500/20', icon: <Clock className="w-3.5 h-3.5" /> },
    vencido: { label: 'Vencido', color: 'text-red-400 bg-red-500/10 border-red-500/20', icon: <AlertTriangle className="w-3.5 h-3.5" /> },
    cancelado: { label: 'Cancelado', color: 'text-gray-400 bg-gray-500/10 border-gray-500/20', icon: <XCircle className="w-3.5 h-3.5" /> },
  };

  const fmtDate = (d: string) => d.split('-').reverse().join('/');

  const renderStatus = (p: any) => {
    const s = statusConfig[p.status] || statusConfig.pendente;
    return (
      <span className={`inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-full border ${s.color}`}>
        {s.icon} {s.label}
      </span>
    );
  };

  // Ações da fatura — reutilizadas na tabela (desktop) e nos cards (mobile).
  const renderActions = (p: any) => (
    <div className="flex items-center justify-end gap-2 flex-wrap">
      {(p.status === 'pendente' || p.status === 'vencido') && p.pixPayload ? (
        <button onClick={() => setPixInvoice(p)}
          className="inline-flex items-center gap-1 text-amber-500 hover:text-amber-400 font-bold text-xs bg-amber-500/10 px-3 py-1.5 rounded-lg border border-amber-500/20 transition-colors">
          <QrCode className="w-3.5 h-3.5" /> {p.alunoAvisouEm ? 'Pix enviado' : 'Pagar com Pix'}
        </button>
      ) : (p.status === 'pendente' || p.status === 'vencido') && p.invoiceUrl ? (
        <a href={p.invoiceUrl} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-amber-500 hover:text-amber-400 font-bold text-xs bg-amber-500/10 px-3 py-1.5 rounded-lg border border-amber-500/20 transition-colors">
          <CreditCard className="w-3.5 h-3.5" /> Pagar <ExternalLink className="w-3 h-3" />
        </a>
      ) : p.status === 'pendente' && !p.invoiceUrl ? (
        <button onClick={() => handleGenerateLink(p)} disabled={renegLoading}
          className="inline-flex items-center gap-1 text-amber-500 hover:text-amber-400 font-bold text-xs bg-amber-500/10 px-3 py-1.5 rounded-lg border border-amber-500/20 transition-colors disabled:opacity-50">
          <CreditCard className="w-3.5 h-3.5" /> Pagar Agora
        </button>
      ) : p.status === 'pago' ? (
        <span className="text-xs text-gray-500">Pago em {p.paymentdate ? fmtDate(p.paymentdate) : '—'}</span>
      ) : null}
      {p.status === 'vencido' && (
        <button onClick={() => openReneg(p)}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border border-purple-500/20 text-[10px] font-black uppercase tracking-widest transition-colors">
          <RefreshCw className="w-3 h-3" /> Renegociar
        </button>
      )}
    </div>
  );

  return (
    <div className="flex flex-col w-full text-gray-100 bg-gray-900 p-4 md:p-8 rounded-tl-2xl space-y-8 animate-fade-in">

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">Meu Financeiro</h1>
          <p className="text-gray-400 text-sm mt-1">Acompanhe suas faturas e pagamentos.</p>
        </div>
        {showPlansCTA && (
          <a href="/aluno/compra-creditos"
            className="inline-flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 text-gray-900 font-black text-sm py-3 px-6 rounded-xl shadow-lg shadow-amber-500/20 transition-all hover:scale-[1.02] active:scale-95 shrink-0">
            <ShoppingCart className="w-4 h-4" /> Planos e Créditos
          </a>
        )}
      </div>

      {/* Cards resumo */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="bg-emerald-500/10 border border-emerald-500/20 p-5 rounded-2xl">
          <p className="text-emerald-400 font-semibold text-sm uppercase tracking-wide mb-1">Total Pago</p>
          <h2 className="text-3xl font-black text-white">R$ {totalPaid.toFixed(2).replace('.', ',')}</h2>
        </div>
        <div className="bg-amber-500/10 border border-amber-500/20 p-5 rounded-2xl">
          <p className="text-amber-400 font-semibold text-sm uppercase tracking-wide mb-1">Pendentes</p>
          <h2 className="text-3xl font-black text-white">{pending.length}</h2>
        </div>
        <div className="bg-gray-800/40 border border-gray-700/50 p-5 rounded-2xl">
          <p className="text-gray-400 font-semibold text-sm uppercase tracking-wide mb-1">Total de Faturas</p>
          <h2 className="text-3xl font-black text-white">{payments.length}</h2>
        </div>
      </div>

      {/* Antecipar próxima mensalidade */}
      {nextInfo?.eligible && (
        <div className="bg-gradient-to-br from-amber-500/10 to-amber-600/5 border border-amber-500/20 rounded-2xl p-5 md:p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-11 h-11 rounded-xl bg-amber-500/15 border border-amber-500/20 flex items-center justify-center shrink-0">
              <CalendarClock className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">{nextInfo.isFirst ? 'Pagar mensalidade do plano' : 'Adiantar próxima mensalidade'}</h3>
              <p className="text-sm text-gray-400 mt-0.5">
                Mensalidade de <span className="capitalize text-gray-300 font-medium">{nextInfo.monthLabel}</span> · vence em {nextInfo.duedate.split('-').reverse().join('/')}
              </p>
            </div>
          </div>
          <div className="flex items-center justify-between gap-4 md:gap-5 w-full md:w-auto md:justify-end">
            <span className="text-2xl font-black text-white whitespace-nowrap">R$ {Number(nextInfo.amount).toFixed(2).replace('.', ',')}</span>
            <button onClick={handleAdvancePayment} disabled={advanceLoading}
              className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-gray-900 font-bold text-sm px-5 py-2.5 rounded-xl transition-colors disabled:opacity-50 whitespace-nowrap shrink-0">
              <CreditCard className="w-4 h-4" /> {advanceLoading ? 'Gerando...' : 'Pagar agora'}
            </button>
          </div>
        </div>
      )}

      {/* Lista de faturas */}
      <div className="bg-gray-800 rounded-2xl border border-gray-700 shadow-xl overflow-hidden flex-1">
        <div className="p-5 border-b border-gray-700 bg-gray-800/80">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-amber-500" /> Todas as Faturas
          </h3>
        </div>
        {/* Desktop: tabela */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-400">
            <thead className="bg-gray-900/50 text-xs text-gray-500 uppercase tracking-widest border-b border-gray-700">
              <tr>
                <th className="px-6 py-4 font-bold">Vencimento</th>
                <th className="px-6 py-4 font-bold">Valor</th>
                <th className="px-6 py-4 font-bold text-center">Status</th>
                <th className="px-6 py-4 font-bold">Método</th>
                <th className="px-6 py-4 font-bold text-right">Ação</th>
              </tr>
            </thead>
            <tbody>
              {payments.length === 0 ? (
                <tr><td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                  Nenhuma fatura registrada.
                  {showPlansCTA && <>{' '}<a href="/aluno/compra-creditos" className="text-amber-500 hover:text-amber-400 font-bold underline underline-offset-2">Escolha um plano</a> para gerar sua primeira fatura.</>}
                </td></tr>
              ) : (
                payments.map(p => (
                  <tr key={p.id} className="border-b border-gray-700/50 hover:bg-gray-700/20 transition-colors">
                    <td className="px-6 py-4 text-gray-400 whitespace-nowrap">{fmtDate(p.duedate)}</td>
                    <td className="px-6 py-4 font-bold text-white whitespace-nowrap">R$ {Number(p.amount).toFixed(2).replace('.', ',')}</td>
                    <td className="px-6 py-4 text-center">{renderStatus(p)}</td>
                    <td className="px-6 py-4 capitalize text-gray-400">{p.method || '—'}</td>
                    <td className="px-6 py-4">{renderActions(p)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile: cards empilhados */}
        <div className="md:hidden divide-y divide-gray-700/50">
          {payments.length === 0 ? (
            <p className="px-4 py-12 text-center text-gray-500 text-sm">
              Nenhuma fatura registrada.
              {showPlansCTA && <>{' '}<a href="/aluno/compra-creditos" className="text-amber-500 hover:text-amber-400 font-bold underline underline-offset-2">Escolha um plano</a> para gerar sua primeira fatura.</>}
            </p>
          ) : (
            payments.map(p => (
              <div key={p.id} className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] text-gray-500 uppercase tracking-widest">Vencimento</p>
                    <p className="text-gray-200 font-semibold">{fmtDate(p.duedate)}</p>
                  </div>
                  {renderStatus(p)}
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xl font-black text-white">R$ {Number(p.amount).toFixed(2).replace('.', ',')}</span>
                  <span className="text-sm text-gray-400 capitalize">{p.method || '—'}</span>
                </div>
                {renderActions(p)}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Modal - Pagamento por Pix estático */}
      {pixInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4 animate-fade-in overflow-y-auto">
          <div className="bg-gray-800 ring-1 ring-amber-500/20 border border-gray-700 rounded-3xl shadow-2xl w-full max-w-md p-6 md:p-8 my-4">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-xl font-black text-white">Pagar com Pix</h3>
                <p className="text-xs text-gray-400">{pixInvoice.status === 'vencido' ? 'Vencida em' : 'Vence em'} {fmtDate(pixInvoice.duedate)}{pixInvoice.notes ? ` · ${pixInvoice.notes}` : ''}</p>
              </div>
              <button onClick={() => setPixInvoice(null)} className="text-gray-400 hover:text-white text-sm font-bold">Fechar</button>
            </div>
            <PixPagamentoCard
              paymentId={pixInvoice.id}
              amount={Number(pixInvoice.amount)}
              pixQrcode={pixInvoice.pixQrcode}
              pixPayload={pixInvoice.pixPayload}
              avisadoEm={pixInvoice.alunoAvisouEm}
              onAvisado={() => fetchAlunoPayments().then(setPayments)}
            />
          </div>
        </div>
      )}

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
                <p className="text-xs text-gray-400">R$ {Number(renegInvoice.amount).toFixed(2)} · {renegInvoice.status === 'vencido' ? 'vencida em' : 'vence em'} {renegInvoice.duedate.split('-').reverse().join('/')}</p>
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
                Um novo PIX será gerado com o novo vencimento. Seu professor será notificado.
              </p>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setRenegInvoice(null)}
                  className="flex-1 px-4 py-3 text-sm font-semibold text-gray-300 bg-gray-700 hover:bg-gray-600 rounded-xl transition-colors">
                  Cancelar
                </button>
                <button type="submit" disabled={renegLoading || !renegDate}
                  className="flex-1 px-4 py-3 text-sm font-bold text-white bg-purple-600 hover:bg-purple-500 rounded-xl transition-all disabled:opacity-50">
                  {renegLoading ? 'Processando...' : 'Confirmar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
