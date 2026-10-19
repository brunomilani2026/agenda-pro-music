// Filtros da lista de alunos. Módulo puro: usa só o que a tela já tem em memória.
import { isOverduePayment } from './lesson-cancel-reasons';

export type FiltrosAlunos = {
  busca: string;
  status: '' | 'ativo' | 'bloqueado' | 'inativo';
  plano: '' | 'mensal' | 'trimestral' | 'semestral' | 'avulsa' | 'sem';
  vencimento: '' | 'vencido' | '7' | '30' | 'sem';
  financeiro: '' | 'atrasado' | 'aberto' | 'emdia';
  instrumento: string;
};

export const FILTROS_VAZIOS: FiltrosAlunos = { busca: '', status: '', plano: '', vencimento: '', financeiro: '', instrumento: '' };

type AlunoF = { name: string; email?: string; phone?: string; instrument?: string; status: string; packagetype?: string; expirationdate?: string };
type PagF = { studentName: string; date: string; status: string };

// Sem acento e minúsculo: "Benicio" acha "Benício".
export const norm = (s?: string | null) => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export function haFiltroAtivo(f: FiltrosAlunos): boolean {
  return Object.values(f).some(v => v !== '');
}

export function filtrarAlunos<T extends AlunoF>(alunos: T[], pagamentos: PagF[], f: FiltrosAlunos, hojeIso: string): T[] {
  const busca = norm(f.busca);
  const buscaDigitos = f.busca.replace(/\D/g, '');
  const limite = (dias: number) => {
    const d = new Date(hojeIso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + dias);
    return d.toISOString().slice(0, 10);
  };
  // Pagamentos por aluno (nome normalizado), calculado uma vez.
  const porAluno = new Map<string, PagF[]>();
  if (f.financeiro) {
    for (const p of pagamentos) {
      if (p.status === 'cancelado' || p.status === 'renegociado') continue;
      const k = norm(p.studentName);
      (porAluno.get(k) ?? porAluno.set(k, []).get(k)!).push(p);
    }
  }

  return alunos.filter(a => {
    if (busca) {
      const alvo = `${norm(a.name)} ${norm(a.email)}`;
      const tel = (a.phone ?? '').replace(/\D/g, '');
      if (!alvo.includes(busca) && !(buscaDigitos.length >= 4 && tel.includes(buscaDigitos))) return false;
    }
    if (f.status && a.status !== f.status) return false;

    const plano = (a.packagetype ?? '').toLowerCase();
    if (f.plano) {
      if (f.plano === 'sem' ? ['mensal', 'trimestral', 'semestral', 'avulsa'].includes(plano) : plano !== f.plano) return false;
    }

    const venc = a.expirationdate || '';
    if (f.vencimento) {
      if (f.vencimento === 'sem' && venc) return false;
      if (f.vencimento === 'vencido' && !(venc && venc < hojeIso)) return false;
      if (f.vencimento === '7' && !(venc && venc >= hojeIso && venc <= limite(7))) return false;
      if (f.vencimento === '30' && !(venc && venc >= hojeIso && venc <= limite(30))) return false;
    }

    if (f.financeiro) {
      const ps = porAluno.get(norm(a.name)) ?? [];
      const atrasado = ps.some(p => isOverduePayment({ status: p.status, duedate: p.date }, hojeIso));
      const aberto = ps.some(p => p.status === 'pendente' && p.date >= hojeIso);
      if (f.financeiro === 'atrasado' && !atrasado) return false;
      if (f.financeiro === 'aberto' && !(aberto && !atrasado)) return false;
      if (f.financeiro === 'emdia' && (atrasado || aberto || ps.length === 0)) return false;
    }

    if (f.instrumento && norm(a.instrument) !== norm(f.instrumento)) return false;
    return true;
  });
}
