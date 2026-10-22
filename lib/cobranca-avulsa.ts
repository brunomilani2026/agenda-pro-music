// Cobrança de aula avulsa: cada aula realizada de um aluno avulso gera uma fatura (pendente) com prazo de 3 dias.
// Antes, a aula avulsa era lançada como "paga" na hora, sem cobrar. Módulo puro: quem grava é PaymentService.
export const AVULSA_COBRANCA_DESDE = '2026-10-21'; // aulas realizadas antes desta data não geram cobrança retroativa
export const AVULSA_PRAZO_DIAS = 3;

export function somarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Vencimento = dia da aula + 3 dias, mas nunca no passado (aula antiga cobrada tarde ganha prazo a partir de hoje). */
export function vencimentoAulaAvulsa(dataAula: string, hojeIso: string): string {
  const v = somarDias(dataAula, AVULSA_PRAZO_DIAS);
  return v < hojeIso ? hojeIso : v;
}

export function aulaGeraCobranca(dataAula: string): boolean {
  return dataAula >= AVULSA_COBRANCA_DESDE;
}

export function textoCobrancaAula(args: { instrumento?: string | null; dataAula: string; valor: number; vencimento: string }) {
  const dm = (iso: string) => iso.slice(0, 10).split('-').reverse().slice(0, 2).join('/');
  const valor = `R$ ${Number(args.valor || 0).toFixed(2).replace('.', ',')}`;
  const aula = args.instrumento ? `Sua aula de ${args.instrumento} do dia ${dm(args.dataAula)}` : `Sua aula do dia ${dm(args.dataAula)}`;
  return {
    title: `Cobrança da aula de ${dm(args.dataAula)}`,
    message: `${aula} foi realizada. Valor: ${valor}, com vencimento em ${dm(args.vencimento)}. Pague pelo Pix na área Financeiro do seu painel.`,
  };
}
