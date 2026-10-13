// Nível musical do aluno (definido pelo professor). Valores guardados no banco; rótulos para a tela.
export const NIVEIS_MUSICAIS = ['iniciante', 'basico', 'intermediario', 'avancado'] as const;
export type NivelMusical = (typeof NIVEIS_MUSICAIS)[number];

export const ROTULO_NIVEL: Record<NivelMusical, string> = {
  iniciante: 'Iniciante', basico: 'Básico', intermediario: 'Intermediário', avancado: 'Avançado',
};

/** Devolve o nível se for válido; vazio/nulo vira null (sem nível); qualquer outra coisa é inválida (undefined). */
export function limparNivel(v: unknown): NivelMusical | null | undefined {
  if (v === null || v === undefined || v === '') return null;
  return (NIVEIS_MUSICAIS as readonly unknown[]).includes(v) ? (v as NivelMusical) : undefined;
}
