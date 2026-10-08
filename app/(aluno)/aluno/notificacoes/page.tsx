"use client";

import { useState, useEffect } from "react";
import { Bell, Check, CheckCircle2, Clock, AlertCircle, Info, Calendar, RefreshCw, XCircle, ChevronRight } from "lucide-react";
import { fetchAlunoNotifications, markNotificationAsRead, markAllNotificationsAsRead } from "../../actions";
import { formatDateTimeBR } from "@/lib/utils";

export default function AlunoNotificationsPage() {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);

  const loadNotifications = async () => {
    const n = await fetchAlunoNotifications();
    setNotifications(n);
    setLoading(false);
  };

  useEffect(() => { loadNotifications(); }, []);

  const handleMarkAsRead = async (id: string) => {
    const ok = await markNotificationAsRead(id);
    if (ok) setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const handleMarkAllAsRead = async () => {
    setMarkingAll(true);
    const ok = await markAllNotificationsAsRead();
    if (ok) setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    setMarkingAll(false);
  };

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <div className="animate-pulse text-amber-500 font-bold">Carregando notificações...</div>
    </div>
  );

  const iconMap: Record<string, any> = {
    confirmacao: <CheckCircle2 className="w-5 h-5 text-green-400" />,
    lembrete: <Clock className="w-5 h-5 text-amber-400" />,
    cancelamento: <XCircle className="w-5 h-5 text-red-400" />,
    cobranca: <AlertCircle className="w-5 h-5 text-red-400" />,
    sistema: <Info className="w-5 h-5 text-blue-400" />,
    manual: <Bell className="w-5 h-5 text-amber-400" />,
  };

  const bgMap: Record<string, string> = {
    confirmacao: 'bg-green-500/10 border-green-500/20',
    lembrete: 'bg-amber-500/10 border-amber-500/20',
    cancelamento: 'bg-red-500/10 border-red-500/20',
    cobranca: 'bg-red-500/10 border-red-500/20',
    sistema: 'bg-blue-500/10 border-blue-500/20',
    manual: 'bg-amber-500/10 border-amber-500/20',
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  const getLessonAction = (n: any) => {
    const title = (n.title || '').toLowerCase();
    const msg = (n.message || '').toLowerCase();
    if (title.includes('aula') || title.includes('remarcação') || title.includes('cancelamento') || msg.includes('aula')) return '/aluno/aulas';
    if (title.includes('pagamento') || title.includes('fatura') || title.includes('crédito')) return '/aluno/financeiro';
    return null;
  };

  return (
    <div className="flex flex-col w-full text-gray-100 bg-gray-900 p-4 md:p-8 rounded-tl-2xl space-y-6 animate-fade-in">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight flex items-center gap-3">
            <Bell className="w-7 h-7 text-amber-500" /> Notificações
          </h1>
          <p className="text-gray-400 text-sm mt-1">Fique por dentro das atualizações das suas aulas e pagamentos.</p>
        </div>
        {unreadCount > 0 && (
          <button onClick={handleMarkAllAsRead} disabled={markingAll}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-gray-300 bg-gray-800 hover:bg-gray-700 border border-gray-700 transition-all disabled:opacity-50 shrink-0">
            <Check className="w-3.5 h-3.5" />
            {markingAll ? 'Marcando...' : `Marcar todas como lidas (${unreadCount})`}
          </button>
        )}
      </div>

      {/* Stats */}
      {notifications.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="bg-gray-800/40 rounded-2xl border border-gray-700/50 p-4 text-center">
            <p className="text-2xl font-black text-white">{notifications.length}</p>
            <p className="text-xs text-gray-400 mt-0.5 uppercase tracking-widest font-bold">Total</p>
          </div>
          <div className={`rounded-2xl border p-4 text-center ${unreadCount > 0 ? 'bg-amber-500/10 border-amber-500/20' : 'bg-gray-800/40 border-gray-700/50'}`}>
            <p className={`text-2xl font-black ${unreadCount > 0 ? 'text-amber-500' : 'text-white'}`}>{unreadCount}</p>
            <p className="text-xs text-gray-400 mt-0.5 uppercase tracking-widest font-bold">Não lidas</p>
          </div>
          <div className="bg-gray-800/40 rounded-2xl border border-gray-700/50 p-4 text-center">
            <p className="text-2xl font-black text-green-400">{notifications.length - unreadCount}</p>
            <p className="text-xs text-gray-400 mt-0.5 uppercase tracking-widest font-bold">Lidas</p>
          </div>
        </div>
      )}

      {/* Lista */}
      <div className="bg-gray-800 rounded-2xl border border-gray-700 shadow-xl overflow-hidden flex-1">
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-gray-500">
            <Bell className="w-14 h-14 mb-4 opacity-30" />
            <p className="font-semibold text-gray-400">Tudo limpo por aqui!</p>
            <p className="text-sm text-gray-500 mt-1">Nenhuma notificação por enquanto.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-700/50">
            {notifications.map((n) => {
              const action = getLessonAction(n);
              return (
                <div key={n.id}
                  className={`p-5 flex gap-4 transition-all hover:bg-gray-700/20 ${!n.read ? 'bg-amber-500/5' : ''}`}>
                  {/* Ícone */}
                  <div className={`w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 border ${!n.read ? (bgMap[n.type] || 'bg-amber-500/10 border-amber-500/20') : 'bg-gray-700/50 border-gray-600'}`}>
                    {iconMap[n.type] || <Bell className="w-5 h-5 text-gray-400" />}
                  </div>

                  {/* Conteúdo */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-0.5">
                      <h3 className={`font-bold text-sm leading-tight ${!n.read ? 'text-white' : 'text-gray-400'}`}>{n.title}</h3>
                      <span className="text-[10px] text-gray-500 font-medium whitespace-nowrap shrink-0">
                        {n.createdAt ? formatDateTimeBR(n.createdAt) : '—'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 leading-relaxed">{n.message?.replace(/(\d{4})-(\d{2})-(\d{2})/g, '$3/$2/$1')}</p>

                    <div className="flex items-center gap-3 mt-3">
                      {action && (
                        <a href={action}
                          className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-500 hover:text-amber-400 transition-colors">
                          <Calendar className="w-3.5 h-3.5" />
                          {action.includes('financeiro') ? 'Ver Financeiro' : 'Ver Aulas'}
                          <ChevronRight className="w-3 h-3" />
                        </a>
                      )}
                      {!n.read && (
                        <button onClick={() => handleMarkAsRead(n.id)}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-500 hover:text-green-400 transition-colors ml-auto">
                          <Check className="w-3 h-3" /> Marcar como lida
                        </button>
                      )}
                    </div>
                  </div>

                  {!n.read && <div className="w-2 h-2 bg-amber-500 rounded-full mt-2 shrink-0 animate-pulse" />}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
