import { createAdminClient } from '@/lib/supabase/server';

/**
 * Aluno com status "inativo" fica FORA de tudo que é automático: lembretes de
 * cobrança e de aula, bloqueio por atraso e geração de mensalidade. Esta função
 * devolve, entre os ids recebidos, quais estão inativos — para os crons e
 * serviços pularem esses alunos.
 */
export async function alunosInativos(ids: (string | null | undefined)[]): Promise<Set<string>> {
  const unicos = [...new Set(ids.filter((x): x is string => !!x))];
  if (unicos.length === 0) return new Set();
  const { data, error } = await createAdminClient()
    .from('student')
    .select('idstudent')
    .in('idstudent', unicos)
    .eq('status', 'inativo');
  if (error) {
    // Na dúvida, NÃO enviar: melhor um aviso a menos do que um aviso a quem foi inativado.
    console.error('alunosInativos: erro ao consultar:', error.message);
    return new Set(unicos);
  }
  return new Set((data ?? []).map((r: { idstudent: string }) => r.idstudent));
}
