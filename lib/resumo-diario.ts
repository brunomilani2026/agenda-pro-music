// Texto do resumo diário enviado por e-mail ao professor (aulas do dia + alertas do painel).
// Módulo puro. O e-mail é para o próprio professor, então usa o nome completo dos alunos.
import type { AlertaPainel } from '@/lib/painel-alertas';

export type AulaDoDia = { startTime: string; endTime: string; aluno: string; instrumento: string; status: string };

const ROTULO: Record<string, string> = { financeiro: 'Financeiro', tarefas: 'Tarefas', reposicao: 'Reposições', aulas: 'Aulas', diario: 'Diário' };
const ORDEM = ['financeiro', 'tarefas', 'reposicao', 'aulas', 'diario'];

export function montarResumo(p: { hojeBr: string; aulas: AulaDoDia[]; alertas: AlertaPainel[] }): { title: string; message: string } | null {
  if (p.aulas.length === 0 && p.alertas.length === 0) return null;
  const partes: string[] = [];

  if (p.aulas.length > 0) {
    const ordenadas = [...p.aulas].sort((a, b) => a.startTime.localeCompare(b.startTime));
    partes.push(`AULAS DE HOJE (${ordenadas.length})`);
    for (const a of ordenadas) partes.push(`• ${a.startTime}–${a.endTime}  ${a.aluno}${a.instrumento ? ` (${a.instrumento})` : ''}`);
  } else {
    partes.push('Nenhuma aula marcada para hoje.');
  }

  if (p.alertas.length > 0) {
    partes.push('', `ATENÇÃO (${p.alertas.length})`);
    for (const cat of ORDEM) {
      const itens = p.alertas.filter(a => a.categoria === cat);
      if (itens.length === 0) continue;
      partes.push(`${ROTULO[cat]}:`);
      for (const a of itens) partes.push(`• ${a.aluno ? `${a.aluno} — ` : ''}${a.texto}`);
    }
  } else {
    partes.push('', 'Nenhum alerta: tudo em dia.');
  }

  const urgentes = p.alertas.filter(a => a.nivel === 'perigo').length;
  const titulo = `Resumo do dia ${p.hojeBr}${urgentes > 0 ? ` — ${urgentes} ${urgentes === 1 ? 'urgente' : 'urgentes'}` : ''}`;
  return { title: titulo, message: partes.join('\n') };
}
