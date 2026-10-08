import { createServerClient } from '@supabase/ssr'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

// ============================================================
// Clientes Supabase para uso EXCLUSIVO no servidor.
//
//   createAdminClient()  -> service_role, BYPASSRLS. Acesso TOTAL ao banco.
//                           Use SOMENTE em tarefas de sistema sem usuário logado
//                           (ex.: webhook do Asaas, cron) ou operações administrativas.
//
//   createClient()       -> user-scoped: lê a sessão do Supabase Auth pelos
//                           cookies, auth.uid() resolve e o RLS vale. É o
//                           cliente padrão das server actions.
//
// ⚠️ NUNCA importe este módulo em código de navegador ('use client').
// ============================================================

// Remove o BOM (U+FEFF) e espaços nas pontas. Valores de env salvos com BOM
// (comum no Windows/PowerShell) quebram os headers HTTP do Supabase com:
// "Cannot convert argument to a ByteString ... value of 65279".
const cleanEnv = (v: string | undefined) =>
  v?.replace(/^﻿/, '').trim() || undefined

const supabaseUrl = cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL)
const anonKey = cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
const secretKey =
  cleanEnv(process.env.SUPABASE_SECRET_KEY) ||
  cleanEnv(process.env.SUPABASE_SERVICE_ROLE_KEY)

if (!supabaseUrl) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL não configurada.')
}
if (!anonKey) {
  throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY (publishable key) não configurada.')
}
if (!secretKey) {
  throw new Error(
    'SUPABASE_SECRET_KEY (chave secreta / service_role) não configurada. ' +
      'Gere-a no painel do Supabase em Settings → API Keys e defina como ' +
      'variável de ambiente server-only (sem NEXT_PUBLIC_).'
  )
}

// Cliente administrativo (service_role). Singleton stateless.
// Tipamos o schema como `any` para preservar o comportamento dos call sites
// (sem isso, insert/select seriam inferidos como `never`).
let _admin: ReturnType<typeof createSupabaseClient<any>> | null = null

export function createAdminClient() {
  if (!_admin) {
    _admin = createSupabaseClient<any>(supabaseUrl!, secretKey!, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })
  }
  return _admin
}

// Cliente "user-scoped": lê a sessão do Supabase Auth pelos cookies, então
// auth.uid() resolve e as policies de RLS valem. É o cliente padrão das
// server actions / componentes de servidor.
export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(supabaseUrl!, anonKey!, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        } catch {
          // setAll chamado de um Server Component — ignorável (o middleware
          // renova a sessão).
        }
      },
    },
  })
}

// getCacheClient era usado dentro de unstable_cache (sem cookies). Agora a
// sessão é por usuário, então não dá para cachear entre requests — delega ao
// cliente user-scoped por request.
export async function getCacheClient() {
  return createClient()
}
