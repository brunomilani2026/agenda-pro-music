"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Bell, Check, CheckCircle2, ChevronRight } from "lucide-react";
import {
  fetchMyNotifications,
  getUnreadCount,
  getNotificationScope,
  markAsRead,
  markAllAsRead
} from "@/app/actions/notification.actions";
import { Notification } from "@/types/database.types";
import { formatDateTimeBR } from "@/lib/utils";
import { useRouter, usePathname } from "next/navigation";

// Cliente do navegador carregado sob demanda (ver o efeito abaixo).
type SupabaseBrowserClient = ReturnType<typeof import("@/lib/supabase/client").createClient>;

export interface NotificationBellScope {
  role: 'teacher' | 'student';
  id: string;
}

interface NotificationBellProps {
  /**
   * Escopo (quem recebe) e contagem inicial, resolvidos no SERVIDOR pelo layout.
   * Com eles o sino não dispara nenhuma server action na montagem — o Next
   * despacha as actions do cliente uma por vez, então as duas de antes
   * (getNotificationScope + getUnreadCount) entravam na fila de TODA página,
   * cada uma com validação de sessão + query. Sem as props, cai no caminho antigo.
   */
  scope?: NotificationBellScope | null;
  initialUnreadCount?: number;
}

export default function NotificationBell({ scope: scopeProp, initialUnreadCount }: NotificationBellProps = {}) {
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount ?? 0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number } | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // -1 = não inicializado ainda. Com contagem inicial vinda do servidor já
  // nasce inicializado, para o 1º aumento via realtime tocar o som.
  const prevUnreadRef = useRef(initialUnreadCount ?? -1);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const router = useRouter();
  const pathname = usePathname();
  const isAluno = pathname.startsWith('/aluno/');

  // O áudio (51 KB) é instanciado só no primeiro toque, não no carregamento de
  // toda página — antes todo usuário baixava o arquivo sem nunca ouvi-lo.
  function playNotificationSound() {
    if (!audioRef.current) {
      audioRef.current = new Audio('/notification.mp3');
    }
    audioRef.current.currentTime = 0;
    audioRef.current.play().catch(() => {}); // Navegador pode bloquear se não houve interação
  }

  // Contagem inicial + Supabase Realtime para novas notificações.
  // Fallback: refetch ao focar/revelar a aba, o que cobre queda do canal e
  // eventos perdidos. O poll de 60s foi removido — com o realtime ativo ele
  // era um terceiro mecanismo redundante, disparando uma server action (com
  // validação de sessão + query) por minuto, por aba aberta, para sempre.
  useEffect(() => {
    const applyCount = (count: number) => {
      if (prevUnreadRef.current >= 0 && count > prevUnreadRef.current) {
        playNotificationSound();
      }
      prevUnreadRef.current = count;
      setUnreadCount(count);
    };
    // Ao voltar para a aba o navegador dispara `focus` E `visibilitychange` quase
    // juntos — eram duas server actions idênticas na fila. Uma busca em voo basta.
    let refetching = false;
    const refetchCount = () => {
      if (refetching) return Promise.resolve();
      refetching = true;
      return getUnreadCount().then(applyCount).finally(() => { refetching = false; });
    };

    // Contagem já veio do servidor: não busca de novo na montagem.
    if (initialUnreadCount === undefined) refetchCount();

    let supabase: SupabaseBrowserClient | null = null;
    let channel: ReturnType<SupabaseBrowserClient["channel"]> | null = null;
    let disposed = false;

    const scopePromise = scopeProp ? Promise.resolve(scopeProp) : getNotificationScope();
    scopePromise.then(async scope => {
      // Desmontou antes de o escopo chegar: não abre canal que ninguém fecharia.
      if (!scope || disposed) return;

      // O cliente Supabase do navegador (auth + realtime, ~220 KB) só serve a
      // este canal. Importado aqui, ele sai do bundle inicial de TODA página
      // protegida e carrega em paralelo, depois da hidratação.
      const { createClient } = await import("@/lib/supabase/client");
      if (disposed) return;
      supabase = createClient();

      const recipient = scope.role === 'teacher' ? 'teacher' : 'student';
      const filter = scope.role === 'teacher'
        ? `idusers_fk=eq.${scope.id}`
        : `idstudent_fk=eq.${scope.id}`;

      channel = supabase
        .channel(`notification-bell-${scope.id}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'notification', filter },
          (payload) => {
            const notif = payload.new as { recipient?: string; read?: boolean };
            if (notif.recipient !== recipient || notif.read) return;
            // Incrementa localmente: o cache de 30s do getUnreadCount ainda
            // não refletiria o insert.
            playNotificationSound();
            prevUnreadRef.current = Math.max(prevUnreadRef.current, 0) + 1;
            setUnreadCount(prevUnreadRef.current);
          }
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'notification', filter },
          () => {
            // Marcada como lida em outra aba/página → ressincroniza a contagem.
            refetchCount();
          }
        )
        .subscribe();
    });

    const onFocus = () => refetchCount();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refetchCount();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      disposed = true;
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
      if (channel && supabase) supabase.removeChannel(channel);
    };
    // Roda uma vez por montagem: o escopo e a contagem inicial são do usuário da
    // sessão e não mudam enquanto o layout está montado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fecha o dropdown ao clicar fora (botão OU painel, que agora é portalizado)
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (
        triggerRef.current && !triggerRef.current.contains(target) &&
        panelRef.current && !panelRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Recalcula a posição do painel enquanto aberto: cobre resize e
  // rotação de tela, já que o painel é portalizado para o <body> e
  // posicionado via coordenadas absolutas em vez de CSS relativo ao botão.
  useEffect(() => {
    if (!isOpen) return;

    function updateCoords() {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(384, window.innerWidth - 32);
      const left = Math.max(
        16,
        Math.min(rect.right - width, window.innerWidth - 16 - width)
      );
      setCoords({ top: rect.bottom + 8, left, width });
    }

    updateCoords();
    window.addEventListener("resize", updateCoords);
    return () => window.removeEventListener("resize", updateCoords);
  }, [isOpen]);

  const handleToggle = async () => {
    if (!isOpen) {
      // Vai abrir o dropdown: busca as notificações
      setIsLoading(true);
      const data = await fetchMyNotifications();
      setNotifications(data);
      setIsLoading(false);
    }
    setIsOpen(!isOpen);
  };

  const handleMarkAsRead = async (e: React.MouseEvent, id: string, read: boolean) => {
    e.stopPropagation();
    if (read) return; // Já lida

    const success = await markAsRead(id);
    if (success) {
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    }
  };

  const handleMarkAllAsRead = async () => {
    const success = await markAllAsRead();
    if (success) {
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setUnreadCount(0);
    }
  };

  const getNotificationLink = (notif: Notification) => {
    const title = (notif.title || '').toLowerCase();
    
    if (isAluno) {
      if (title.includes('pagamento') || title.includes('fatura')) return '/aluno/financeiro';
      if (title.includes('aula') || title.includes('solicitação') || title.includes('remarca') || title.includes('cancelad')) return '/aluno/aulas';
      return '/aluno/dashboard';
    } else {
      if (title.includes('solicitação') || title.includes('cancelamento') || title.includes('remarcar')) return '/solicitacoes';
      if (title.includes('pagamento')) return '/financeiro';
      return '/dashboard';
    }
  };

  const handleNotificationClick = async (e: React.MouseEvent, notif: Notification) => {
    // Primeiro tenta marcar como lida, se não estiver
    if (!notif.read) {
      await handleMarkAsRead(e, notif.id, false);
    }
    
    // Fecha o dropdown
    setIsOpen(false);
    
    // Navega para a página correspondente
    const link = getNotificationLink(notif);
    if (link) {
      router.push(link);
    }
  };

  return (
    <div className="relative" ref={triggerRef}>
      <button
        onClick={handleToggle}
        className="relative p-2 text-gray-400 hover:bg-gray-700 hover:text-white rounded-xl transition-colors border border-transparent hover:border-gray-600 focus:outline-none"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 flex h-3.5 w-3.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-amber-500 border border-gray-800 text-[8px] font-bold text-white items-center justify-center">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          </span>
        )}
      </button>

      {isOpen && coords && createPortal(
        <div
          ref={panelRef}
          style={{ position: "fixed", top: coords.top, left: coords.left, width: coords.width }}
          className="bg-gray-800 border border-gray-700 rounded-2xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200"
        >
          <div className="flex items-center justify-between p-4 border-b border-gray-700/50 bg-gray-800/80 backdrop-blur-sm">
            <h3 className="font-bold text-white flex items-center gap-2">
              <Bell className="w-4 h-4 text-indigo-400" />
              Notificações
            </h3>
            {unreadCount > 0 && (
              <button 
                onClick={handleMarkAllAsRead}
                className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition-colors flex items-center gap-1"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Marcar todas lidas
              </button>
            )}
          </div>
          
          <div className="max-h-[400px] overflow-y-auto custom-scrollbar">
            {isLoading ? (
              <div className="p-8 text-center text-gray-500 text-sm animate-pulse">
                Carregando notificações...
              </div>
            ) : notifications.length === 0 ? (
              <div className="p-8 text-center text-gray-500 flex flex-col items-center">
                <Bell className="w-8 h-8 text-gray-600 mb-2 opacity-50" />
                <p className="text-sm">Nenhuma notificação encontrada.</p>
              </div>
            ) : (
              <div className="flex flex-col">
                {notifications.map((notif) => (
                  <div 
                    key={notif.id}
                    onClick={(e) => handleNotificationClick(e, notif)}
                    className={`p-4 border-b border-gray-700/30 transition-colors cursor-pointer relative group ${notif.read ? 'bg-transparent hover:bg-gray-700/30' : 'bg-indigo-500/5 hover:bg-indigo-500/10'}`}
                  >
                    {!notif.read && (
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-500 rounded-r-md"></div>
                    )}
                    <div className="flex justify-between items-start gap-2 mb-1">
                      <h4 className={`text-sm font-bold ${notif.read ? 'text-gray-300' : 'text-indigo-300'}`}>
                        {notif.title}
                      </h4>
                      <span className="text-[10px] text-gray-500 whitespace-nowrap shrink-0">
                        {notif.created_at ? formatDateTimeBR(notif.created_at) : ''}
                      </span>
                    </div>
                    <p className={`text-xs leading-relaxed ${notif.read ? 'text-gray-500' : 'text-gray-300'}`}>
                      {notif.message}
                    </p>
                    
                    {!notif.read && (
                      <div className="mt-2 flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMarkAsRead(e, notif.id, false);
                          }}
                          className="text-[10px] font-semibold text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
                        >
                          <Check className="w-3 h-3" /> Marcar como lida
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          
          <div className="p-2 border-t border-gray-700/50 bg-gray-900/50">
            <a
              href={isAluno ? '/aluno/notificacoes' : '/notificacoes'}
              onClick={() => setIsOpen(false)}
              className="flex items-center justify-center gap-1.5 w-full py-2 text-xs font-bold text-amber-500 hover:text-amber-400 transition-colors text-center"
            >
              Ver todas as notificações
              <ChevronRight className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
