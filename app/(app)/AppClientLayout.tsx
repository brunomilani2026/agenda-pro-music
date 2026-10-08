"use client";

import { useState } from "react";
import Sidebar from "@/components/layout/Sidebar";
import Topbar from "@/components/layout/Topbar";
import { AppProvider } from "./AppContext";
import type { InitialAppData } from "./initial-data";
import type { NotificationBellScope } from "@/components/layout/NotificationBell";
import { User } from "@/types/database.types";

interface AppClientLayoutProps {
  children: React.ReactNode;
  user: User | null;
  initialData: InitialAppData | null;
  notificationScope?: NotificationBellScope | null;
  initialUnreadCount?: number;
}

export default function AppClientLayout({
  children, user, initialData, notificationScope, initialUnreadCount,
}: AppClientLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(true);

  return (
    <AppProvider usertype={user?.usertype} initialData={initialData}>
      <div className="flex h-screen overflow-hidden bg-gray-900 text-gray-100">
        {/* Sidebar */}
        <Sidebar 
          open={sidebarOpen} 
          onClose={() => setSidebarOpen(false)} 
          user={user}
          isCollapsed={isCollapsed}
        />

        {/* Conteúdo principal */}
        <div className={`flex flex-1 flex-col transition-all duration-300 ${isCollapsed ? 'lg:ml-20' : 'lg:ml-64'} overflow-hidden`}>
          <Topbar 
            onMenuClick={() => setSidebarOpen(true)} 
            user={user}
            onToggleCollapse={() => setIsCollapsed(!isCollapsed)}
            isCollapsed={isCollapsed}
            notificationScope={notificationScope}
            initialUnreadCount={initialUnreadCount}
          />
          <main className="flex-1 p-4 md:p-6 bg-gray-900 overflow-y-auto custom-scrollbar">
            {children}
          </main>
        </div>
      </div>
    </AppProvider>
  );
}
