import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Remove o BOM (U+FEFF) e espaços nas pontas — envs salvas com BOM (comum no
// Windows/PowerShell) quebram os headers HTTP do Supabase e fazem o getUser()
// abaixo falhar silenciosamente, derrubando a sessão em TODA rota protegida.
// Mesma limpeza usada em lib/supabase/server.ts (precisa estar em sincronia).
const cleanEnv = (v: string | undefined) =>
  v?.replace(/^﻿/, '').trim() || undefined;

const SUPABASE_URL = cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
const SUPABASE_ANON_KEY = cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const PROTECTED_PROFESSOR_PREFIXES = [
  '/agenda',
  '/dashboard',
  '/alunos',
  '/trilhas',
  '/financeiro',
  '/configuracoes',
  '/solicitacoes',
  '/notificacoes',
  '/admin',
];

const PROTECTED_ALUNO_PREFIX = '/aluno/';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isProfessorRoute = PROTECTED_PROFESSOR_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
  const isAlunoRoute = pathname.startsWith(PROTECTED_ALUNO_PREFIX);

  // Rotas públicas (login, cadastro, home, recuperação de senha, etc.) não têm
  // sessão a validar/renovar. Antes o getUser() — um round-trip ao Auth do
  // Supabase — rodava em TODA página pública e em cada prefetch RSC delas.
  // Pulamos por completo: elimina dezenas de chamadas de rede desnecessárias.
  if (!isProfessorRoute && !isAlunoRoute) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    SUPABASE_URL!,
    SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Valida/renova a sessão. Não chame nada entre createServerClient e getClaims.
  // getClaims() renova o token expirado (gravando os cookies via setAll acima) e
  // verifica a assinatura do JWT localmente com o JWKS em cache — sem o
  // round-trip ao Auth que getUser() fazia em TODA navegação/prefetch protegido.
  // Cai para getUser() sozinho se o projeto usar chave de assinatura simétrica.
  const { data } = await supabase.auth.getClaims();

  if (!data?.claims?.sub) {
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|Logo.png|logotipo.png|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp)).*)',
  ],
};
