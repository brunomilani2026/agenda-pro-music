"use client";

import { useState, useEffect } from "react";
import { fetchPendingRequests, approveRequest, rejectRequest } from "../agenda/actions";
import { useAppContext } from "../AppContext";
import { CheckCircle, AlertCircle, Clock, Calendar, Music, XCircle, Inbox } from "lucide-react";

export default function SolicitacoesPage() {
  const { reloadLoadedLessons } = useAppContext();
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const loadData = async () => {
    setLoading(true);
    const data = await fetchPendingRequests();
    setRequests(data);
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const showNotif = (msg: string, type: 'success' | 'error') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const handleApprove = async (id: string) => {
    setProcessing(id);
    // Remoção otimista imediata
    setRequests(prev => prev.filter(r => r.id !== id));
    const res = await approveRequest(id);
    if (res.success) {
      showNotif("Solicitação aprovada com sucesso!", "success");
      // Só a janela já carregada — não o histórico inteiro.
      reloadLoadedLessons();
    } else {
      showNotif(res.error || "Erro ao aprovar solicitação.", "error");
      loadData(); // rollback: recarrega se falhou
    }
    setProcessing(null);
  };

  const handleReject = async (id: string) => {
    if (!window.confirm("Tem certeza que deseja recusar esta solicitação? O aluno será notificado.")) return;
    setProcessing(id);
    // Remoção otimista imediata
    setRequests(prev => prev.filter(r => r.id !== id));
    const success = await rejectRequest(id);
    if (success) {
      showNotif("Solicitação recusada.", "success");
    } else {
      showNotif("Erro ao recusar solicitação.", "error");
      loadData(); // rollback: recarrega se falhou
    }
    setProcessing(null);
  };

  if (loading) return <div className="flex items-center justify-center h-full"><div className="animate-pulse text-amber-500 font-bold">Carregando solicitações...</div></div>;

  return (
    <div className="flex flex-col h-full w-full text-gray-100 bg-gray-900 min-h-screen p-4 md:p-8 rounded-tl-2xl space-y-6 animate-fade-in">
      
      {/* Notificação */}
      {notification && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[100]">
          <div className={`flex items-center gap-3 px-6 py-4 rounded-2xl shadow-2xl border backdrop-blur-xl ${notification.type === 'success' ? 'bg-green-500/10 border-green-500/20 text-green-500' : 'bg-red-500/10 border-red-500/20 text-red-500'}`}>
            {notification.type === 'success' ? <CheckCircle className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
            <p className="text-sm font-bold">{notification.msg}</p>
          </div>
        </div>
      )}

      {/* Header */}
      <div>
        <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight flex items-center gap-3">
          <Inbox className="w-8 h-8 text-amber-500" /> Solicitações Pendentes
        </h1>
        <p className="text-gray-400 text-sm mt-1">Gerencie agendamentos, remarcações e cancelamentos solicitados pelos alunos.</p>
      </div>

      {requests.length === 0 ? (
        <div className="bg-gray-800 rounded-2xl border border-gray-700 shadow-xl p-12 flex flex-col items-center justify-center text-center">
          <CheckCircle className="w-16 h-16 text-green-500/50 mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">Tudo em dia!</h2>
          <p className="text-gray-400">Você não tem nenhuma solicitação pendente de alunos.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {requests.map(req => (
            <div key={req.id} className="bg-gray-800 rounded-2xl border border-gray-700 shadow-xl overflow-hidden flex flex-col hover:border-gray-600 transition-colors">
              <div className="p-4 border-b border-gray-700 bg-gray-800/80 flex items-center justify-between">
                <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                  req.type === 'agendamento' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' :
                  req.type === 'remarcacao' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' :
                  'bg-red-500/10 text-red-400 border border-red-500/20'
                }`}>
                  {req.type}
                </span>
                <span className="text-xs text-gray-500 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> {new Date(req.createdAt).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                </span>
              </div>
              
              <div className="p-5 flex-1 flex flex-col">
                <h3 className="font-bold text-lg text-white mb-4">{req.studentName}</h3>
                
                <div className="space-y-3 flex-1">
                  {(req.type === 'agendamento' || req.type === 'remarcacao') && (
                    <>
                      <div className="flex items-center gap-3 text-sm">
                        <div className="w-8 h-8 rounded-lg bg-gray-900 flex items-center justify-center text-gray-400 shrink-0 border border-gray-700">
                          <Calendar className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">Data Solicitada</p>
                          <p className="text-gray-200 font-medium">{req.requestedDate.split('-').reverse().join('/')}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 text-sm">
                        <div className="w-8 h-8 rounded-lg bg-gray-900 flex items-center justify-center text-gray-400 shrink-0 border border-gray-700">
                          <Clock className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">Horário</p>
                          <p className="text-gray-200 font-medium">{req.requestedStartTime} - {req.requestedEndTime}</p>
                        </div>
                      </div>
                    </>
                  )}
                  
                  {req.instrument && (
                    <div className="flex items-center gap-3 text-sm">
                      <div className="w-8 h-8 rounded-lg bg-gray-900 flex items-center justify-center text-gray-400 shrink-0 border border-gray-700">
                        <Music className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">Instrumento</p>
                        <p className="text-gray-200 font-medium capitalize">{req.instrument}</p>
                      </div>
                    </div>
                  )}

                  {req.reason && (
                    <div className="mt-4 p-3 bg-gray-900/50 rounded-xl border border-gray-700/50">
                      <p className="text-[10px] text-gray-500 uppercase font-bold tracking-widest mb-1">Motivo / Observação</p>
                      <p className="text-sm text-gray-300 italic">"{req.reason}"</p>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3 mt-6 pt-5 border-t border-gray-700/50">
                  <button 
                    onClick={() => handleReject(req.id)}
                    disabled={processing === req.id}
                    className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-bold text-gray-300 bg-gray-700 hover:bg-gray-600 hover:text-white transition-colors disabled:opacity-50"
                  >
                    <XCircle className="w-4 h-4" /> Recusar
                  </button>
                  <button 
                    onClick={() => handleApprove(req.id)}
                    disabled={processing === req.id}
                    className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-black text-gray-900 bg-amber-500 hover:bg-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.2)] transition-all disabled:opacity-50"
                  >
                    {processing === req.id ? 'Salvando...' : <><CheckCircle className="w-4 h-4" /> Aprovar</>}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
