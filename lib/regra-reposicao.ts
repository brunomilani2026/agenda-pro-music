// Regra de reposição por cancelamento (RN03, versão de 20/10/2026):
// cada aluno ganha até 2 créditos de reposição por MÊS (mês do calendário, fuso de São Paulo), cada um válido por 30 dias.
// Antes valia 1 só na vida inteira. Módulo puro: quem consulta o banco é CreditService.
export const MAX_REPOSICOES_POR_MES = 2;
export const VALIDADE_REPOSICAO_DIAS = 30;

const mesSP = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' }).format(d); // "2026-10"

/** Quantos créditos de cancelamento (com aula de origem) foram concedidos no mês de `agora`. */
export function reposicoesNoMes(creditos: { origin_lesson_fk: string | null; created_at: string }[], agora: Date = new Date()): number {
  const alvo = mesSP(agora);
  return creditos.filter(c => !!c.origin_lesson_fk && mesSP(new Date(c.created_at)) === alvo).length;
}

export function podeGerarReposicao(creditos: { origin_lesson_fk: string | null; created_at: string }[], agora: Date = new Date()): boolean {
  return reposicoesNoMes(creditos, agora) < MAX_REPOSICOES_POR_MES;
}
