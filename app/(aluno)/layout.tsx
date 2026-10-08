import { redirect } from "next/navigation";
import { getSessionUser, getSessionStudent } from "@/lib/session";
import { getUnreadCount } from "@/app/actions/notification.actions";
import AlunoClientLayout from "./AlunoClientLayout";

export default async function AlunoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();

  if (!user) {
    redirect("/login");
  }

  if (user.usertype === "professor") {
    redirect("/agenda");
  }

  if (user.usertype === "admin") {
    redirect("/admin");
  }

  // Perfil do aluno (sidebar/topbar) e contagem do sino resolvidos no servidor,
  // em paralelo. Antes o layout cliente os buscava em useEffect via server
  // actions — que o Next executa uma por vez — então toda página do aluno
  // pagava uma fila de round-trips só para pintar nome, avatar e o sino.
  const [student, unreadCount] = await Promise.all([
    getSessionStudent(),
    getUnreadCount(),
  ]);

  return (
    <AlunoClientLayout
      user={user}
      student={student ? {
        id: student.idstudent,
        name: student.name,
        avatar_url: student.avatar_url || null,
        packagetype: student.packagetype || undefined,
      } : null}
      initialUnreadCount={unreadCount}
    >
      {children}
    </AlunoClientLayout>
  );
}
