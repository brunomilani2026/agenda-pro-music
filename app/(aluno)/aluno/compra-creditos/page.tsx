"use client";

import { useState, useEffect } from "react";
import { CheckCircle, CreditCard, ShoppingCart, Loader2, Copy, Check, ExternalLink, QrCode } from "lucide-react";
import { fetchCompraCreditosPage, registerCreditPurchase } from "../../actions";
import { JaPagueiButton } from "@/components/PixAluno";

type CreditPackageOption = { id: string; name: string; credits: number; price: number; popular?: boolean; };

// Formata preço: "R$ 350" para valores redondos, "R$ 297,50" quando há centavos
const fmtPrice = (v: number) => v.toFixed(2).replace('.', ',').replace(/,00$/, '');
type PurchaseResult = { paymentId: string; invoiceUrl: string; pixQrcode: string; pixPayload: string; dueDate: string; price: number; name: string; credits: number; };

export default function CompraCreditosPage() {
  const [studentInfo, setStudentInfo] = useState<{ name: string, email: string } | null>(null);
  const [isRecurringPlan, setIsRecurringPlan] = useState(false);
  const [packages, setPackages] = useState<CreditPackageOption[]>([]);
  const [selectedPackage, setSelectedPackage] = useState<CreditPackageOption | null>(null);
  const [loadingPackages, setLoadingPackages] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [purchaseResult, setPurchaseResult] = useState<PurchaseResult | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // Uma server action só: duas chamadas separadas do cliente rodam em fila.
    fetchCompraCreditosPage().then(({ perfil: info, packages: list }) => {
      if (info) {
        setStudentInfo({ name: info.name, email: info.email });
        setIsRecurringPlan(['mensal', 'trimestral', 'semestral'].includes((info.packagetype || '').toLowerCase()));
      }
      setPackages(list);
      const popular = list.find(p => p.popular);
      setSelectedPackage(popular || list[0] || null);
      setLoadingPackages(false);
    });
  }, []);

  const handleCopyPix = async () => {
    if (!purchaseResult?.pixPayload) return;
    await navigator.clipboard.writeText(purchaseResult.pixPayload);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePurchase = async () => {
    if (!studentInfo || !selectedPackage) return;
    setIsProcessing(true);
    try {
      const res = await registerCreditPurchase(selectedPackage.id);
      if (!res.success) throw new Error((res as any).error || 'Erro ao gerar cobrança');
      setPurchaseResult({
        paymentId: (res as any).paymentId,
        invoiceUrl: (res as any).invoiceUrl || '',
        pixQrcode: (res as any).pixQrcode || '',
        pixPayload: (res as any).pixPayload || '',
        dueDate: (res as any).dueDate || '',
        price: (res as any).price ?? selectedPackage.price,
        name: (res as any).name ?? selectedPackage.name,
        credits: (res as any).credits ?? selectedPackage.credits,
      });
    } catch (error: any) {
      alert(error.message || 'Houve um erro ao processar sua solicitação. Tente novamente.');
    } finally {
      setIsProcessing(false);
    }
  };

  // ── Tela de pagamento PIX ──────────────────────────────────────
  if (purchaseResult) {
    const hasPix = !!purchaseResult.pixQrcode;
    const formattedDue = purchaseResult.dueDate ? purchaseResult.dueDate.split('-').reverse().join('/') : '';

    return (
      <div className="flex flex-col items-center w-full text-gray-100 bg-gray-900 p-4 md:p-8 rounded-tl-2xl animate-fade-in">
        <div className="w-full max-w-lg">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-amber-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-amber-500/20">
              <QrCode className="w-8 h-8 text-amber-500" />
            </div>
            <h1 className="text-2xl font-black text-white">Pedido Confirmado!</h1>
            <p className="text-gray-400 text-sm mt-1">
              {purchaseResult.name} — {purchaseResult.credits} crédito{purchaseResult.credits > 1 ? 's' : ''}
            </p>
          </div>

          <div className="bg-gray-800 rounded-3xl border border-gray-700 overflow-hidden shadow-xl">
            <div className="flex items-center justify-between p-6 border-b border-gray-700">
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-widest font-bold">Valor a pagar</p>
                <p className="text-3xl font-black text-white mt-1">R$ {purchaseResult.price.toFixed(2).replace('.', ',')}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-400 uppercase tracking-widest font-bold">Vence em</p>
                <p className="text-lg font-bold text-amber-500 mt-1">{formattedDue}</p>
              </div>
            </div>

            {hasPix ? (
              <div className="p-6 flex flex-col items-center gap-6">
                <div className="bg-white p-4 rounded-2xl border border-gray-200">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`data:image/png;base64,${purchaseResult.pixQrcode}`} alt="QR Code PIX" className="w-56 h-56" />
                </div>
                <p className="text-sm text-gray-400 text-center">
                  Escaneie o QR Code acima com o app do seu banco, <br /> ou copie o código PIX abaixo.
                </p>
                <div className="w-full bg-gray-900/50 border border-gray-700 rounded-xl p-4">
                  <p className="text-xs text-gray-400 uppercase tracking-widest font-bold mb-2">PIX Copia e Cola</p>
                  <div className="flex items-center gap-3">
                    <p className="text-xs text-gray-300 font-mono truncate flex-1">{purchaseResult.pixPayload}</p>
                    <button onClick={handleCopyPix}
                      className={`shrink-0 flex items-center gap-1.5 text-xs font-bold py-2 px-3 rounded-lg transition-all ${copied ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-amber-500/10 text-amber-500 border border-amber-500/20 hover:bg-amber-500/20'}`}>
                      {copied ? <><Check className="w-3.5 h-3.5" /> Copiado!</> : <><Copy className="w-3.5 h-3.5" /> Copiar</>}
                    </button>
                  </div>
                </div>
                <JaPagueiButton paymentId={purchaseResult.paymentId} />
                {purchaseResult.invoiceUrl && (
                  <a href={purchaseResult.invoiceUrl} target="_blank" rel="noopener noreferrer"
                    className="w-full flex flex-col items-center justify-center gap-1 bg-gray-700 hover:bg-gray-600 text-sm font-bold text-gray-300 hover:text-white transition-colors py-4 border border-gray-600 rounded-xl">
                    <div className="flex items-center gap-2">
                      <CreditCard className="w-4 h-4 text-amber-500" /> Pagar com Cartão ou Boleto <ExternalLink className="w-4 h-4 text-gray-500" />
                    </div>
                    <span className="text-xs font-normal text-gray-500">Abrir página segura do Asaas</span>
                  </a>
                )}
              </div>
            ) : purchaseResult.invoiceUrl ? (
              <div className="p-8 flex flex-col items-center gap-6 text-center">
                <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-2" />
                <p className="text-white font-bold">Fatura gerada com sucesso!</p>
                <p className="text-gray-400 text-sm">Escolha como deseja pagar (PIX, Boleto ou Cartão) através do link seguro abaixo.</p>
                <a href={purchaseResult.invoiceUrl} target="_blank" rel="noopener noreferrer"
                  className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 text-gray-900 font-black py-4 px-8 rounded-xl shadow-[0_0_20px_rgba(245,158,11,0.3)] transition-all hover:scale-[1.02] active:scale-95">
                  <CreditCard className="w-5 h-5" /> Fazer Pagamento <ExternalLink className="w-4 h-4 ml-1" />
                </a>
              </div>
            ) : (
              <div className="p-8 text-center">
                <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-4" />
                <p className="text-white font-bold mb-2">Pedido registrado com sucesso!</p>
                <p className="text-gray-400 text-sm mb-6">Seu professor receberá a notificação e enviará o link de pagamento em breve.</p>
                <button onClick={() => window.location.href = '/aluno/financeiro'}
                  className="w-full bg-amber-500 hover:bg-amber-400 text-gray-900 font-bold py-3 rounded-xl transition-all">
                  Ver meu financeiro
                </button>
              </div>
            )}
          </div>

          <div className="mt-6 bg-blue-500/10 border border-blue-500/20 rounded-2xl p-4 text-center">
            <p className="text-blue-400 text-sm">
              Seus <strong>{purchaseResult.credits} crédito{purchaseResult.credits > 1 ? 's' : ''}</strong> serão liberados automaticamente após a confirmação do pagamento.
            </p>
          </div>

          <button onClick={() => window.location.href = '/aluno/aulas'}
            className="w-full mt-4 text-sm text-gray-500 hover:text-gray-300 transition-colors py-2">
            Voltar para Minhas Aulas
          </button>
        </div>
      </div>
    );
  }

  // Mensalista: plano e preço negociado são gerenciados pelo professor —
  // sem autosserviço de pacotes (o desconto individual distorceria os preços).
  if (isRecurringPlan) {
    return (
      <div className="flex flex-col items-center justify-center w-full text-gray-100 bg-gray-900 p-4 md:p-8 rounded-tl-2xl animate-fade-in">
        <div className="bg-gray-800 rounded-3xl p-10 border border-gray-700 text-center shadow-xl max-w-lg mt-8">
          <ShoppingCart className="w-10 h-10 text-amber-500 mx-auto mb-4" />
          <h1 className="text-xl font-black text-white mb-2">Seu plano é acompanhado pelo professor</h1>
          <p className="text-gray-400 text-sm">
            Você possui um plano com mensalidade. Suas faturas aparecem no <b>Meu Financeiro</b> —
            para mudar de plano ou aulas extras, fale com seu professor.
          </p>
          <a href="/aluno/financeiro"
            className="inline-block mt-6 bg-amber-500 hover:bg-amber-400 text-gray-900 font-black py-3 px-8 rounded-xl transition-all active:scale-95">
            Ir para Meu Financeiro
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full text-gray-100 bg-gray-900 p-4 md:p-8 rounded-tl-2xl space-y-8 animate-fade-in">
      <div>
        <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight flex items-center gap-3">
          <ShoppingCart className="w-8 h-8 text-amber-500" /> Comprar Créditos
        </h1>
        <p className="text-gray-400 text-sm mt-1">Escolha um pacote abaixo. Após a confirmação do pagamento, os créditos são liberados automaticamente para agendar.</p>
      </div>

      {loadingPackages ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
        </div>
      ) : packages.length === 0 ? (
        <div className="bg-gray-800 rounded-3xl p-8 border border-gray-700 text-center shadow-xl">
          <p className="text-gray-300 font-medium">Seu professor ainda não configurou pacotes de créditos.</p>
          <p className="text-gray-500 text-sm mt-2">Entre em contato com seu professor para mais informações.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {packages.map((pkg) => (
              <div key={pkg.id} onClick={() => setSelectedPackage(pkg)}
                className={`relative p-6 rounded-3xl border-2 transition-all cursor-pointer flex flex-col ${selectedPackage?.id === pkg.id
                  ? 'bg-amber-500/10 border-amber-500 shadow-[0_0_20px_rgba(245,158,11,0.15)]'
                  : 'bg-gray-800 border-gray-700 hover:border-gray-600 shadow-xl'}`}>
                {pkg.popular && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-amber-500 text-gray-900 text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full">
                    Mais Escolhido
                  </span>
                )}
                <h3 className="text-xl font-bold text-white mb-2">{pkg.name}</h3>
                <p className="text-gray-400 text-sm flex-1">{pkg.credits} crédito{pkg.credits > 1 ? 's' : ''} para agendamento.</p>
                <div className="mt-6 mb-6">
                  <span className="text-4xl font-black text-white">R$ {fmtPrice(pkg.price)}</span>
                </div>
                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center mx-auto transition-colors ${selectedPackage?.id === pkg.id ? 'border-amber-500 bg-amber-500 text-gray-900' : 'border-gray-600 bg-transparent text-transparent'}`}>
                  <CheckCircle className="w-4 h-4" />
                </div>
              </div>
            ))}
          </div>

          {selectedPackage && (
            <div className="bg-gray-800 rounded-3xl p-6 border border-gray-700 flex flex-col sm:flex-row items-center justify-between gap-6 max-w-4xl mx-auto w-full mt-8 shadow-xl">
              <div>
                <p className="text-gray-400 font-medium">Resumo do pedido:</p>
                <h3 className="text-xl font-black text-white">
                  {selectedPackage.name} — R$ {selectedPackage.price.toFixed(2).replace('.', ',')}
                </h3>
              </div>
              <button onClick={handlePurchase} disabled={isProcessing || !studentInfo}
                className="w-full sm:w-auto bg-amber-500 hover:bg-amber-400 text-gray-900 font-black py-4 px-10 rounded-xl shadow-[0_0_20px_rgba(245,158,11,0.3)] transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                {isProcessing ? <><Loader2 className="w-5 h-5 animate-spin" /> Gerando Pagamento...</> : <><CreditCard className="w-5 h-5" /> Confirmar e Pagar</>}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
