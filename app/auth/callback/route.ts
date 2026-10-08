import { NextResponse } from 'next/server'
// The client you created from the Server-Side Auth instructions
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  // if "next" is in param, use it as the redirect URL
  const next = searchParams.get('next') ?? '/login'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      const forwardedHost = request.headers.get('x-forwarded-host') // original origin before load balancer
      const isLocalEnv = process.env.NODE_ENV === 'development'
      if (isLocalEnv) {
        // we can be sure that there is no load balancer in between, so no need to watch for X-Forwarded-Host
        return NextResponse.redirect(`${origin}${next}`)
      } else if (forwardedHost) {
        return NextResponse.redirect(`https://${forwardedHost}${next}`)
      } else {
        return NextResponse.redirect(`${origin}${next}`)
      }
    }
  }

  // Falha na troca do código (link expirado, já usado ou pré-carregado por
  // scanner de e-mail). Se veio de um fluxo com destino próprio (ex.: reset de
  // senha), devolve para lá — a tela mostra "link expirado / pedir novo link".
  // Caso contrário, cai no login com o aviso de erro.
  if (next !== '/login') {
    const dest = new URL(next, origin)
    dest.searchParams.set('error', 'auth-code-error')
    return NextResponse.redirect(dest)
  }
  return NextResponse.redirect(`${origin}/login?error=auth-code-error`)
}
