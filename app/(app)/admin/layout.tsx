import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/session';

// Este layout roda ANTES de qualquer página dentro de /admin
// Logo se nosso usuário não for admin, ele é redirecionado normalmente para o dashboard
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // 1. Pega quem está logado via cookie de sessão do app
  const dbUser = await getSessionUser();
  if (!dbUser) {
    redirect('/dashboard'); // não está logado → vai pro dashboard
  }

  // 2. Verifica se é admin — se não for, bloqueia
  if (dbUser.usertype !== 'admin') {
    redirect('/dashboard'); // é professor, não admin → vai pro dashboard
  }

  // 3. Passou em tudo → renderiza a página do admin
  return <>{children}</>;
}
