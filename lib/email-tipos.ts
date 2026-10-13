// Tipos de e-mail enviados aos alunos, usados no registro de e-mails e na aba "E-mails" da ficha.
// Módulo puro (sem servidor): o servidor classifica ao gravar e a tela usa os mesmos rótulos.

export const TIPOS_EMAIL = ['aula', 'pagamento', 'atraso', 'tarefa', 'manual', 'outros'] as const;
export type TipoEmail = (typeof TIPOS_EMAIL)[number];

export const ROTULO_TIPO: Record<TipoEmail, string> = {
  aula: 'Aulas', pagamento: 'Pagamentos', atraso: 'Atrasos', tarefa: 'Tarefas', manual: 'Avisos seus', outros: 'Outros',
};

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Descobre o tipo pelo assunto quando quem enviou não informou. A ordem importa: atraso antes de pagamento. */
export function classificarEmail(titulo: string, tipoInformado?: string | null): TipoEmail {
  if (tipoInformado && (TIPOS_EMAIL as readonly string[]).includes(tipoInformado)) return tipoInformado as TipoEmail;
  const t = semAcento(titulo || '');
  if (/tarefa/.test(t)) return 'tarefa';
  if (/atraso|venceu/.test(t)) return 'atraso';
  if (/fatura|pagamento|cobranca|renegoci|mensalidade|pague|credito/.test(t)) return 'pagamento';
  if (/aula|remarca|reposi|horario|cancel|solicitac/.test(t)) return 'aula';
  return 'outros';
}

export type ModeloEmail = { tipo: TipoEmail; nome: string; quando: string; titulo: string; texto: string; botao: string };

/** Exemplos de como cada e-mail chega ao aluno (textos reais do sistema, com dados de exemplo). */
export const MODELOS_EMAIL: ModeloEmail[] = [
  { tipo: 'aula', nome: 'Aula daqui a 1 hora', quando: 'Cerca de 1 hora antes de cada aula',
    titulo: 'Sua aula é daqui a pouco',
    texto: 'Sua aula de cavaquinho com Bruno Milani começa daqui a pouco: hoje, 20/10/2026 às 18:30.\n\nLink da aula: https://meet.google.com/gmq-rmcp-xsp',
    botao: 'Entrar na aula' },
  { tipo: 'aula', nome: 'Lembrete do dia', quando: 'De manhã, para as aulas de hoje e de amanhã',
    titulo: 'Lembrete: sua aula é amanhã',
    texto: 'Sua aula de cavaquinho com Bruno Milani é amanhã, 21/10/2026 às 18:30.\n\nLink da aula: https://meet.google.com/gmq-rmcp-xsp',
    botao: 'Entrar na aula' },
  { tipo: 'aula', nome: 'Aula agendada', quando: 'Quando você agenda uma aula ou série',
    titulo: 'Aula agendada',
    texto: 'Suas aulas de cavaquinho foram agendadas: 8 semanas às 18:30, começando em 20/10/2026.',
    botao: 'Ver minhas aulas' },
  { tipo: 'pagamento', nome: 'Nova fatura', quando: 'Quando a mensalidade é gerada',
    titulo: 'Nova fatura disponível',
    texto: 'Sua mensalidade de outubro de 2026 (R$ 250,00) já está disponível para pagamento. Vencimento: 17/10/2026.',
    botao: 'Ver faturas' },
  { tipo: 'pagamento', nome: 'Fatura vencendo', quando: '5 dias antes e no dia do vencimento',
    titulo: 'Sua fatura vence em 5 dias',
    texto: 'Sua fatura de R$ 250,00 vence em 5 dias (17/10/2026). Pague em dia para manter suas aulas sem interrupção.',
    botao: 'Pagar agora' },
  { tipo: 'pagamento', nome: 'Pagamento confirmado', quando: 'Quando o pagamento é recebido',
    titulo: 'Pagamento confirmado!',
    texto: 'Seu pagamento foi confirmado. Sua agenda está liberada para novas aulas.',
    botao: 'Acessar painel' },
  { tipo: 'atraso', nome: 'Primeiro aviso de atraso', quando: 'No primeiro dia após o vencimento',
    titulo: 'Pagamento em atraso',
    texto: 'Sua fatura venceu. Regularize o pagamento para continuar agendando novas aulas. Acesse "Minhas Aulas" para renegociar.',
    botao: 'Renegociar agora' },
  { tipo: 'atraso', nome: 'Atraso diário', quando: 'Todo dia, enquanto a fatura seguir em aberto',
    titulo: 'Fatura em atraso há 3 dias',
    texto: 'Sua fatura de R$ 250,00, vencida em 10/10/2026, está em atraso há 3 dias. Regularize para desbloquear sua conta e voltar a marcar aulas. Se precisar de prazo, use a opção Renegociar.',
    botao: 'Regularizar agora' },
  { tipo: 'tarefa', nome: 'Nova tarefa', quando: 'Quando você cria uma tarefa para o aluno',
    titulo: 'Nova tarefa',
    texto: 'Seu professor criou uma tarefa: "Gravar a batida de samba". Prazo: 21/10/2026.',
    botao: 'Ver minhas tarefas' },
];
