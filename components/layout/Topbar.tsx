"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Menu, Star, ShieldCheck, ChevronLeft, ChevronRight } from "lucide-react";
import NotificationBell, { type NotificationBellScope } from "./NotificationBell";
import FeedbackButton from "./FeedbackButton";
import { User } from "@/types/database.types";
import { useAppContext } from "@/app/(app)/AppContext";
import { formatName } from "@/lib/utils";

interface TopbarProps {
  onMenuClick: () => void;
  user: User | null;
  onToggleCollapse?: () => void;
  isCollapsed?: boolean;
  /** Escopo e contagem do sino, resolvidos no servidor (ver NotificationBell). */
  notificationScope?: NotificationBellScope | null;
  initialUnreadCount?: number;
}

const PAGE_META: Record<string, { title: string; subtitle: string }> = {
  // Portal do Professor
  "/dashboard": {
    title: "Área do Professor",
    subtitle: "Bem-vindo à sua área de gestão",
  },
  "/agenda": {
    title: "Agenda de Aulas",
    subtitle: "Navegue pela semana e gerencie seus horários",
  },
  "/alunos": {
    title: "Meus Alunos",
    subtitle: "Cadastre e acompanhe seus alunos",
  },
  "/financeiro": {
    title: "Financeiro",
    subtitle: "Registre pagamentos e acompanhe seu faturamento",
  },
  "/solicitacoes": {
    title: "Solicitações Pendentes",
    subtitle: "Gerencie pedidos de agendamento, remarcação e cancelamento",
  },
  "/admin": {
    title: "Painel Administrativo",
    subtitle: "Gestão global da plataforma e indicadores",
  },
  "/configuracoes": {
    title: "Configurações",
    subtitle: "Gerencie seu perfil e preferências da plataforma",
  },
  "/notificacoes": {
    title: "Notificações",
    subtitle: "Atualizações sobre sua agenda e alunos",
  },
  // Portal do Aluno
  "/aluno/dashboard": {
    title: "Meu Painel",
    subtitle: "Acompanhe suas aulas e progresso",
  },
  "/aluno/aulas": {
    title: "Minhas Aulas",
    subtitle: "Histórico, agendamentos e remarcações",
  },
  "/aluno/financeiro": {
    title: "Meu Financeiro",
    subtitle: "Pagamentos, créditos e faturas",
  },
  "/aluno/notificacoes": {
    title: "Notificações",
    subtitle: "Atualizações sobre suas aulas",
  },
  "/aluno/perfil": {
    title: "Meu Perfil",
    subtitle: "Atualize seus dados pessoais",
  },
  "/aluno/compra-creditos": {
    title: "Comprar Créditos",
    subtitle: "Adicione créditos para agendar mais aulas",
  },
};

export default function Topbar({
  onMenuClick, user, onToggleCollapse, isCollapsed, notificationScope, initialUnreadCount,
}: TopbarProps) {
  const pathname = usePathname();
  const { teacherProfile } = useAppContext();

  const isStudentPortal = pathname?.startsWith("/aluno/");
  const meta = PAGE_META[pathname] ?? (
    isStudentPortal
      ? { title: "Área do Aluno", subtitle: "Bem-vindo ao seu painel" }
      : { title: "Área do Professor", subtitle: "Bem-vindo à sua área" }
  );

  return (
    // Sem backdrop-blur: o header é irmão (não sobrepõe) do <main> que rola, então
    // o blur só desfocava o fundo fixo — já desfocado — e custava um filtro de
    // backdrop recomposto a cada frame de qualquer animação por baixo.
    <header className="sticky top-0 z-50 flex h-16 items-center gap-4 border-b border-gray-700 bg-gray-800/80 px-4 md:px-6 shadow-sm">
      {/* Botão menu hamburger - só no mobile */}
      <button
        onClick={onMenuClick}
        className="lg:hidden inline-flex items-center justify-center rounded-lg p-2 text-gray-400 hover:bg-gray-700 hover:text-white transition-colors"
        aria-label="Abrir menu"
      >
        <Menu className="w-6 h-6" />
      </button>

      {/* Botão Retrair Sidebar - Desktop */}
      <button
        onClick={onToggleCollapse}
        className="hidden lg:inline-flex items-center justify-center rounded-lg p-2 text-gray-400 hover:bg-gray-700 hover:text-white transition-all duration-300 bg-gray-900/50 border border-gray-700/50"
        title={isCollapsed ? "Expandir Menu" : "Recolher Menu"}
      >
        {isCollapsed ? <ChevronRight className="w-5 h-5 text-amber-500" /> : <ChevronLeft className="w-5 h-5" />}
      </button>

      {/* Título e subtítulo dinâmicos */}
      <div className="flex-1 min-w-0">
        <p className="text-base font-bold text-white leading-tight truncate">{meta.title}</p>
        <p className="text-xs text-gray-400 font-medium truncate hidden sm:block">{meta.subtitle}</p>
      </div>

      {/* Ações do topbar */}
      <div className="flex items-center gap-3 shrink-0">
        <FeedbackButton />
        <NotificationBell scope={notificationScope} initialUnreadCount={initialUnreadCount} />

        <Link
          href={isStudentPortal ? '/aluno/perfil' : (user?.usertype === 'admin' ? '/admin' : '/configuracoes')}
          className="flex items-center gap-2.5 bg-gray-700/50 hover:bg-gray-700 transition-colors rounded-2xl px-4 py-1.5 cursor-pointer border border-gray-600/50"
          title="Ir para o meu perfil"
        >
          {(() => {
            // Prioriza o nome do registro (teacher/student) — mantido na tela de
            // configurações — sobre `users.fname` para evitar exibir dois nomes.
            const displayName = formatName(teacherProfile?.name) || formatName(user?.fname) || 'Usuário';
            const initialsSource = teacherProfile?.name || user?.fname || 'U';
            const parts = initialsSource.split(/\s+/).filter(Boolean);
            const initials = parts.length >= 2
              ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
              : (parts[0]?.[0] || 'U').toUpperCase();
            return (
              <>
                <div className="relative w-7 h-7 rounded-full overflow-hidden border border-amber-500/50 shrink-0 shadow-lg bg-gray-900 flex items-center justify-center">
                  {teacherProfile?.avatar_url ? (
                    <Image
                      src={teacherProfile.avatar_url}
                      alt="User"
                      width={28}
                      height={28}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-amber-500 font-black text-[11px] select-none">{initials}</span>
                  )}
                </div>
                <div className="flex flex-col -space-y-1 hidden sm:block text-left">
                  <span className="text-xs font-bold text-gray-200">{displayName}</span>
                  <div className="flex items-center gap-1">
                    {user?.usertype === 'admin' ? (
                      <>
                        <ShieldCheck className="w-2 h-2 text-amber-500" />
                        <span className="text-[9px] font-black text-amber-500 uppercase tracking-widest">Admin</span>
                      </>
                    ) : isStudentPortal ? (
                      <>
                        <Star className="w-2 h-2 text-amber-500 fill-amber-500" />
                        <span className="text-[9px] font-black text-amber-500 uppercase tracking-widest">Aluno</span>
                      </>
                    ) : (
                      <>
                        <Star className="w-2 h-2 text-amber-500 fill-amber-500" />
                        <span className="text-[9px] font-black text-amber-500 uppercase tracking-widest">
                          {user?.ispremium ? 'Plano Premium' : 'Plano Grátis'}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </>
            );
          })()}
        </Link>
      </div>
    </header>
  );
}
