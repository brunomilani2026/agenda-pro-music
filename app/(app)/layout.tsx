import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { getUnreadCount } from "@/app/actions/notification.actions";
import AppClientLayout from "./AppClientLayout";
import { loadInitialAppData } from "./initial-data";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();

  if (!user) {
    redirect("/login");
  }

  if (user.usertype === "aluno") {
    redirect("/aluno/dashboard");
  }

  // Carga inicial no SERVIDOR: antes o AppContext buscava tudo num useEffect,
  // então os dados só começavam a chegar depois de baixar o JS e hidratar.
  // Aqui as queries já rodam em paralelo com o resto do render.
  // O admin não consome nada disto — o branch fica ANTES do await para não
  // pagar latência nenhuma.
  //
  // A contagem de notificações não lidas vai junto, em paralelo: o sino do topo
  // (todas as páginas) nascia vazio e disparava 2 server actions na montagem,
  // que o Next executa em fila. É cacheada por 30s (unstable_cache), então é
  // praticamente de graça. O escopo do sino é o próprio usuário da sessão.
  const [initialData, unreadCount] = await Promise.all([
    user.usertype === "admin" ? null : loadInitialAppData(),
    getUnreadCount(),
  ]);

  return (
    <AppClientLayout
      user={user}
      initialData={initialData}
      notificationScope={{ role: "teacher", id: user.idusers }}
      initialUnreadCount={unreadCount}
    >
      {children}
    </AppClientLayout>
  );
}
