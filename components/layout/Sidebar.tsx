"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  LogOut,
  LayoutDashboard,
  Calendar,
  Users,
  DollarSign,
  Inbox,
  GraduationCap,
  Briefcase,
  Layers,
  Settings,
  Bell,
  MessageCircleHeart
} from "lucide-react";
import { clearSessionEmail } from "@/lib/session";
import { User } from "@/types/database.types";
import { formatName } from "@/lib/utils";

interface SidebarProps {
  open: boolean;
  onClose: () => void;
  user: User | null;
  isCollapsed?: boolean;
}

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const professorGroups: NavGroup[] = [
  {
    title: "PRINCIPAL",
    items: [
      {
        label: "Dashboard",
        href: "/dashboard",
        icon: <LayoutDashboard className="w-5 h-5" />,
      },
      {
        label: "Agenda",
        href: "/agenda",
        icon: <Calendar className="w-5 h-5" />,
      },
    ]
  },
  {
    title: "ALUNOS",
    items: [
      {
        label: "Notificações",
        href: "/notificacoes",
        icon: <Bell className="w-5 h-5" />,
      },
      {
        label: "Solicitações",
        href: "/solicitacoes",
        icon: <Inbox className="w-5 h-5" />,
      },
      {
        label: "Meus Alunos",
        href: "/alunos",
        icon: <Users className="w-5 h-5" />,
      },
    ]
  },
  {
    title: "FINANCEIRO",
    items: [
      {
        label: "Faturamento",
        href: "/financeiro",
        icon: <DollarSign className="w-5 h-5" />,
      },
    ]
  },
  {
    title: "SISTEMA",
    items: [
      {
        label: "Configurações",
        href: "/configuracoes",
        icon: <Settings className="w-5 h-5" />,
      },
    ]
  }
];

const adminGroups: NavGroup[] = [
  {
    title: "GERAL",
    items: [
      {
        label: "Dashboard",
        href: "/admin",
        icon: <LayoutDashboard className="w-5 h-5" />,
      },
    ]
  },
  {
    title: "PLATAFORMA",
    items: [
      {
        label: "Usuários",
        href: "/admin?section=users",
        icon: <Users className="w-5 h-5" />,
      },
      {
        label: "Alunos",
        href: "/admin?section=students",
        icon: <GraduationCap className="w-5 h-5" />,
      },
      {
        label: "Professores",
        href: "/admin?section=teachers",
        icon: <Briefcase className="w-5 h-5" />,
      },
      {
        label: "Feedbacks",
        href: "/admin?section=feedbacks",
        icon: <MessageCircleHeart className="w-5 h-5" />,
      },
    ]
  },
  {
    title: "SISTEMA",
    items: [
      {
        label: "Configurações",
        href: "/admin?section=settings",
        icon: <Settings className="w-5 h-5" />,
      },
      {
        label: "Logs de Uso",
        href: "/admin?section=logs",
        icon: <Layers className="w-5 h-5" />,
      },
    ]
  }
];

import { useAppContext } from "@/app/(app)/AppContext";

function splitHref(href: string): { path: string; section: string | null } {
  const [path, query] = href.split("?");
  if (!query) return { path, section: null };
  const params = new URLSearchParams(query);
  return { path, section: params.get("section") };
}

export default function Sidebar({ open, onClose, user, isCollapsed = false }: SidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { teacherProfile } = useAppContext();
  const currentSection = searchParams?.get("section") ?? null;

  const handleLogout = async () => {
    await clearSessionEmail();
    router.push('/login');
  };

  const isAdmin = user?.usertype === 'admin';
  const navGroups = isAdmin ? adminGroups : professorGroups;

  const sidebarContent = (
    <div className={`flex h-full flex-col bg-gray-800 text-white relative overflow-hidden transition-all duration-300 ${isCollapsed ? 'w-20' : 'w-64'}`}>
      {/* Logo */}
      <div className={`relative z-10 flex h-16 items-center border-b border-gray-700 transition-all duration-300 ${isCollapsed ? 'justify-center px-0' : 'gap-3 px-6'}`}>
        <div className="relative w-8 h-8 rounded-lg overflow-hidden shrink-0 shadow-[0_0_15px_rgba(245,158,11,0.3)]">
          <Image 
            src="/Logo.png" 
            alt="Logo" 
            fill 
            sizes="32px" 
            className="object-cover scale-125"
          />
        </div>
        {!isCollapsed && (
          <h2 className="text-xl font-black italic tracking-tighter">
            Área do <span className="text-amber-500">{isAdmin ? 'Admin' : 'Professor'}</span>
          </h2>
        )}
      </div>

      {/* Navegação */}
      <nav className={`relative z-10 flex-1 py-6 space-y-8 overflow-y-auto custom-scrollbar transition-all duration-300 ${isCollapsed ? 'px-2' : 'px-4'}`}>
        {navGroups.map((group) => (
          <div key={group.title} className="space-y-2">
            {!isCollapsed ? (
              <div className="flex items-center gap-2 px-2 mb-2">
                <div className="h-[1px] flex-1 bg-gradient-to-r from-gray-700 to-transparent" />
                <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-[0.3em] whitespace-nowrap">
                  {group.title}
                </h3>
              </div>
            ) : (
              <div className="flex justify-center mb-2">
                <div className="w-6 h-[2px] bg-gray-700 rounded-full" />
              </div>
            )}
            
            <div className="space-y-1">
              {group.items.map((item) => {
                const { path: itemPath, section: itemSection } = splitHref(item.href);
                const pathMatches = pathname === itemPath || pathname?.startsWith(itemPath + "/");
                const isActive = itemSection
                  ? pathname === itemPath && currentSection === itemSection
                  : pathMatches && (itemPath !== "/admin" || !currentSection);
                // Link para a MESMA rota (só muda ?section=, ex.: abas do admin):
                // trocamos no cliente via History API — sem round-trip RSC nem
                // re-execução dos layouts (getUser). Também dispensa o prefetch,
                // que gerava o storm de requests `admin?section=...&_rsc`.
                const isSamePage = pathname === itemPath;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    prefetch={isSamePage ? false : undefined}
                    onClick={(e) => {
                      if (isSamePage) {
                        e.preventDefault();
                        window.history.pushState(null, '', item.href);
                      }
                      onClose();
                    }}
                    title={isCollapsed ? item.label : ""}
                    className={`
                      flex items-center rounded-xl text-sm font-medium
                      transition-all duration-300 relative overflow-hidden group
                      ${isCollapsed ? 'justify-center px-0 py-3' : 'gap-3 px-3 py-2.5'}
                      ${isActive
                        ? "bg-amber-500 text-gray-900 shadow-[0_0_20px_rgba(245,158,11,0.3)] font-bold"
                        : "text-gray-400 hover:bg-gray-700/50 hover:text-white"
                      }
                    `}
                  >
                    <div className={`transition-all duration-300 ${isActive ? 'scale-110' : 'group-hover:scale-110'}`}>
                      {item.icon}
                    </div>
                    {!isCollapsed && (
                      <span className="tracking-wide whitespace-nowrap animate-in fade-in slide-in-from-left-2 duration-300">
                        {item.label}
                      </span>
                    )}
                    
                    {!isCollapsed && isActive && (
                      <div className="flex items-end gap-[2px] h-3 ml-auto opacity-40">
                        <span className="w-1 bg-gray-900 rounded-t-[1px] animate-eq" style={{ '--eq-duration': '0.9s' } as React.CSSProperties} />
                        <span className="w-1 bg-gray-900 rounded-t-[1px] animate-eq" style={{ '--eq-duration': '1.2s' } as React.CSSProperties} />
                        <span className="w-1 bg-gray-900 rounded-t-[1px] animate-eq" style={{ '--eq-duration': '0.8s' } as React.CSSProperties} />
                      </div>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer da Sidebar - Perfil com Opção Sair */}
      <div className={`relative z-10 py-6 border-t border-gray-700 bg-gray-800/50 transition-all duration-300 ${isCollapsed ? 'px-0' : 'px-4'}`}>
        <div className="flex flex-col gap-4">
          {(() => {
            // Prioriza o nome do registro de teacher/aluno (que é editável em /configuracoes)
            // sobre o `users.fname` — evita exibir dois nomes diferentes ao mesmo professor.
            const displayName = formatName(teacherProfile?.name) || formatName(user?.fname) || 'Usuário';
            const initialsSource = teacherProfile?.name || user?.fname || 'U';
            const parts = initialsSource.split(/\s+/).filter(Boolean);
            const initials = parts.length >= 2
              ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
              : (parts[0]?.[0] || 'U').toUpperCase();
            const profileHref = user?.usertype === 'admin' ? '/admin' : '/configuracoes';
            return (
              <Link
                href={profileHref}
                onClick={onClose}
                title="Abrir meu perfil"
                className={`flex items-center transition-all duration-300 rounded-xl hover:bg-gray-700/30 p-1 ${isCollapsed ? 'justify-center px-0' : 'gap-3 px-2'}`}
              >
                <div className="relative w-10 h-10 rounded-full overflow-hidden border-2 border-amber-500/30 shrink-0 shadow-lg bg-gray-900 flex items-center justify-center">
                  {teacherProfile?.avatar_url ? (
                    <Image
                      src={teacherProfile.avatar_url}
                      alt="Avatar"
                      width={40}
                      height={40}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-amber-500 font-black text-sm select-none">{initials}</span>
                  )}
                </div>
                {!isCollapsed && (
                  <div className="flex-1 min-w-0 animate-in fade-in slide-in-from-left-2 duration-300">
                    <p className="text-sm font-bold text-white truncate">{displayName}</p>
                    <p className="text-[10px] text-amber-500/80 truncate font-black uppercase tracking-widest">
                      {user?.usertype === 'admin' ? 'Administrador' : 'Professor'}
                    </p>
                  </div>
                )}
              </Link>
            );
          })()}
          
          <button 
            onClick={handleLogout}
            title={isCollapsed ? "Sair da Conta" : ""}
            className={`flex items-center gap-2 py-2 text-xs font-bold text-gray-500 hover:text-red-400 hover:bg-red-400/5 rounded-xl transition-all group w-full ${isCollapsed ? 'justify-center px-0' : 'px-3'}`}
          >
            <LogOut className="w-4 h-4 group-hover:translate-x-[-2px] transition-transform" />
            {!isCollapsed && <span>Sair da Conta</span>}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Sidebar Desktop - fixa */}
      <aside className={`hidden lg:fixed lg:inset-y-0 lg:z-40 lg:flex lg:flex-col transition-all duration-300 ${isCollapsed ? 'w-20' : 'w-64'}`}>
        {sidebarContent}
      </aside>

      {/* Sidebar Mobile - overlay */}
      {open && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
            onClick={onClose}
          />
          {/* Drawer */}
          <aside className="fixed inset-y-0 left-0 z-[60] w-64 lg:hidden animate-slide-in">
            {sidebarContent}
          </aside>
        </>
      )}
    </>
  );
}
