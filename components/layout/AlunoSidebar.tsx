"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, LayoutDashboard, Calendar, DollarSign, User, Bell, Package } from "lucide-react";
import { clearSessionEmail } from "@/lib/session";
import { formatName } from "@/lib/utils";

const navItems = [
  { label: "Meu Painel", href: "/aluno/dashboard", icon: <LayoutDashboard className="w-5 h-5" /> },
  { label: "Minhas Aulas", href: "/aluno/aulas", icon: <Calendar className="w-5 h-5" /> },
  { label: "Planos e Créditos", href: "/aluno/compra-creditos", icon: <Package className="w-5 h-5" /> },
  { label: "Financeiro", href: "/aluno/financeiro", icon: <DollarSign className="w-5 h-5" /> },
  { label: "Notificações", href: "/aluno/notificacoes", icon: <Bell className="w-5 h-5" /> },
  { label: "Meu Perfil", href: "/aluno/perfil", icon: <User className="w-5 h-5" /> },
];

interface AlunoSidebarProps {
  open: boolean;
  onClose: () => void;
  studentName?: string;
  avatarUrl?: string | null;
  packageType?: string;
  isCollapsed?: boolean;
}

const packageLabels: Record<string, string> = {
  avulsa: 'Aula Avulsa',
  mensal: 'Plano Mensal',
  trimestral: 'Plano Trimestral',
  semestral: 'Plano Semestral',
};

export default function AlunoSidebar({ open, onClose, studentName, avatarUrl, packageType, isCollapsed = false }: AlunoSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    await clearSessionEmail();
    router.push('/login');
  };

  const displayName = formatName(studentName) || "Aluno";
  const planLabel = packageLabels[packageType || ''] || 'Aluno';

  // Mensalistas (plano recorrente gerenciado pelo professor) não usam o
  // autosserviço de pacotes de créditos — o desconto individual é calibrado
  // para a mensalidade e distorceria o preço dos pacotes.
  const isRecurringPlan = ['mensal', 'trimestral', 'semestral'].includes((packageType || '').toLowerCase());
  const visibleNavItems = navItems.filter(i => !(i.href === '/aluno/compra-creditos' && isRecurringPlan));

  // Iniciais resilientes — usam primeiro + último nome quando há mais de uma parte,
  // garantindo coerência com o nome exibido (formatName).
  const initials = (() => {
    const parts = (studentName || "A").split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "A";
    if (parts.length === 1) return parts[0][0].toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  })();

  const sidebarContent = (
    <div className={`flex h-full flex-col bg-gray-800 text-white relative overflow-hidden transition-all duration-300 ${isCollapsed ? 'w-20' : 'w-64'}`}>
      {/* Logo */}
      <div className={`relative z-10 flex h-16 items-center border-b border-gray-700 transition-all duration-300 ${isCollapsed ? 'justify-center px-0' : 'gap-3 px-6'}`}>
        <div className="relative w-8 h-8 rounded-lg overflow-hidden shrink-0 shadow-[0_0_15px_rgba(245,158,11,0.3)]">
          <Image src="/Logo.png" alt="Logo" fill sizes="32px" className="object-cover scale-125" />
        </div>
        {!isCollapsed && (
          <h2 className="text-xl font-black italic tracking-tighter">
            Área do <span className="text-amber-500">Aluno</span>
          </h2>
        )}
      </div>

      {/* Navegação */}
      <nav className={`relative z-10 flex-1 py-6 space-y-8 overflow-y-auto custom-scrollbar transition-all duration-300 ${isCollapsed ? 'px-2' : 'px-4'}`}>
        <div className="space-y-2">
          {!isCollapsed ? (
            <div className="flex items-center gap-2 px-2 mb-2">
              <div className="h-[1px] flex-1 bg-gradient-to-r from-gray-700 to-transparent" />
              <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-[0.3em] whitespace-nowrap">
                MENU
              </h3>
            </div>
          ) : (
            <div className="flex justify-center mb-2">
              <div className="w-6 h-[2px] bg-gray-700 rounded-full" />
            </div>
          )}

          <div className="space-y-1">
            {visibleNavItems.map((item) => {
              const isActive = pathname === item.href || pathname?.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onClose}
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
      </nav>

      {/* Footer */}
      <div className={`relative z-10 py-6 border-t border-gray-700 bg-gray-800/50 transition-all duration-300 ${isCollapsed ? 'px-0' : 'px-4'}`}>
        <div className="flex flex-col gap-4">
          <Link href="/aluno/perfil" onClick={onClose} className={`flex items-center transition-all duration-300 rounded-xl hover:bg-gray-700/30 p-1 ${isCollapsed ? 'justify-center px-0' : 'gap-3 px-2'}`}>
            <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-amber-500/30 flex items-center justify-center bg-gray-900 shrink-0 shadow-lg relative">
              <span className="text-amber-500 font-black text-sm select-none">
                {initials}
              </span>
              {avatarUrl && (
                <Image
                  src={avatarUrl}
                  alt="Avatar"
                  width={40}
                  height={40}
                  className="absolute inset-0 w-full h-full object-cover"
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                />
              )}
            </div>
            {!isCollapsed && (
              <div className="flex-1 min-w-0 animate-in fade-in slide-in-from-left-2 duration-300">
                <p className="text-sm font-bold text-white truncate">{displayName}</p>
                <p className="text-[10px] text-amber-500/80 truncate font-black uppercase tracking-widest">Aluno</p>
              </div>
            )}
          </Link>

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
      <aside className={`hidden lg:fixed lg:inset-y-0 lg:z-40 lg:flex lg:flex-col transition-all duration-300 ${isCollapsed ? 'w-20' : 'w-64'}`}>
        {sidebarContent}
      </aside>

      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden" onClick={onClose} />
          <aside className="fixed inset-y-0 left-0 z-50 w-64 lg:hidden animate-slide-in">
            {sidebarContent}
          </aside>
        </>
      )}
    </>
  );
}
