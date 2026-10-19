import { filtrarAlunos, FILTROS_VAZIOS, haFiltroAtivo, type FiltrosAlunos } from '../lib/filtro-alunos';
let ok = 0, tot = 0; const t = (n: string, c: boolean) => { tot++; if (c) ok++; else console.log('FALHOU:', n); };
const hoje = '2026-10-19';
const A = [
  { name: 'Benício Zafani', email: 'benicio@x.com', phone: '34999887766', instrument: 'Cavaquinho', status: 'ativo', packagetype: 'mensal', expirationdate: '2026-10-29' },
  { name: 'Anderson Leite', email: 'a@x.com', phone: '', instrument: 'Banjo', status: 'ativo', packagetype: 'avulsa', expirationdate: '' },
  { name: 'Paula Tavares', email: 'p@x.com', phone: '', instrument: 'Cavaquinho', status: 'bloqueado', packagetype: 'mensal', expirationdate: '2026-10-10' },
  { name: 'Julio Schurt', email: 'j@x.com', phone: '', instrument: 'Banjo', status: 'inativo', packagetype: 'semestral', expirationdate: '2027-02-01' },
];
const P = [
  { studentName: 'Paula Tavares', date: '2026-10-10', status: 'pendente' },
  { studentName: 'benicio zafani', date: '2026-10-25', status: 'pendente' },
  { studentName: 'Julio Schurt', date: '2026-09-01', status: 'pago' },
  { studentName: 'Anderson Leite', date: '2026-08-01', status: 'cancelado' },
];
const f = (o: Partial<FiltrosAlunos>) => filtrarAlunos(A, P, { ...FILTROS_VAZIOS, ...o }, hoje).map(a => a.name.split(' ')[0]).join(',');
t('sem filtro = todos', f({}) === 'Benício,Anderson,Paula,Julio' && !haFiltroAtivo(FILTROS_VAZIOS));
t('busca sem acento', f({ busca: 'benicio' }) === 'Benício');
t('busca por e-mail', f({ busca: 'p@x' }) === 'Paula');
t('busca por telefone (4+ dígitos)', f({ busca: '99988' }) === 'Benício');
t('status bloqueado', f({ status: 'bloqueado' }) === 'Paula');
t('plano avulsa', f({ plano: 'avulsa' }) === 'Anderson');
t('plano mensal', f({ plano: 'mensal' }) === 'Benício,Paula');
t('vencido', f({ vencimento: 'vencido' }) === 'Paula');
t('vence em 30 dias', f({ vencimento: '30' }) === 'Benício');
t('sem vencimento', f({ vencimento: 'sem' }) === 'Anderson');
t('financeiro atrasado', f({ financeiro: 'atrasado' }) === 'Paula');
t('financeiro aberto (a vencer)', f({ financeiro: 'aberto' }) === 'Benício');
t('financeiro em dia (tem pagamento e nada aberto)', f({ financeiro: 'emdia' }) === 'Julio');
t('instrumento', f({ instrumento: 'banjo' }) === 'Anderson,Julio');
t('combinado: ativo + cavaquinho', f({ status: 'ativo', instrumento: 'Cavaquinho' }) === 'Benício');
console.log(`${ok} de ${tot}`);
