"use client";

import { useState } from "react";
import AlunoSidebar from "@/components/layout/AlunoSidebar";
import Topbar from "@/components/layout/Topbar";
import { User } from "@/types/database.types";

interface AlunoClientLayoutProps {
  children: React.ReactNode;
  user: User | null;
  /** Ficha do aluno da sessão, resolvida no servidor (layout.tsx). */
  student: { id: string; name?: string; avatar_url?: string | null; packagetype?: string } | null;
  initialUnreadCount?: number;
}

export default function AlunoClientLayout({ children, user, student, initialUnreadCount }: AlunoClientLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(true);

  // Nome do registro de aluno tem prioridade sobre o `fname` do usuário,
  // pois é o nome que o aluno mantém atualizado no perfil dele.
  const displayName = student?.name || user?.fname || '';
  const studentUser: User | null = user ? { ...user, fname: displayName } : null;

  return (
    <div className="flex h-screen overflow-hidden bg-gray-900 text-gray-100">
      <AlunoSidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        studentName={displayName}
        avatarUrl={student?.avatar_url}
        packageType={student?.packagetype}
        isCollapsed={isCollapsed}
      />
      <div className={`flex flex-1 flex-col transition-all duration-300 ${isCollapsed ? 'lg:ml-20' : 'lg:ml-64'} overflow-hidden`}>
        <Topbar
          onMenuClick={() => setSidebarOpen(true)}
          user={studentUser}
          onToggleCollapse={() => setIsCollapsed(!isCollapsed)}
          isCollapsed={isCollapsed}
          notificationScope={student ? { role: 'student', id: student.id } : null}
          initialUnreadCount={initialUnreadCount}
        />
        <main className="flex-1 p-4 md:p-6 bg-gray-900 overflow-y-auto custom-scrollbar">
          {children}
        </main>
      </div>
    </div>
  );
}
