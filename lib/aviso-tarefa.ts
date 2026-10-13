// Avisos automáticos das tarefas: sino (notificação) + e-mail, no mesmo padrão do resto do sistema.
//
// Módulo de servidor comum (sem 'use server'). Nunca lança: o aviso é complementar e não pode
// derrubar a ação principal (criar tarefa, entregar, dar retorno).
//
// O tipo da notificação é 'sistema' porque o banco só aceita um conjunto fixo de tipos
// (confirmacao, lembrete, cancelamento, cobranca, manual, sistema).

import { afterResponse } from '@/lib/after-response';
import { alunosInativos } from '@/lib/aluno-inativo';
import { emailStudent, emailTeacher } from '@/lib/notify-email';

type Cliente = { from: (tabela: string) => any };

/** Professor -> aluno. Aluno inativo não recebe nada (regra do sistema: inativo fica fora dos avisos). */
export async function avisarAlunoDaTarefa(
  supabase: Cliente,
  p: { teacherId: string; studentId: string; title: string; message: string },
): Promise<void> {
  try {
    const inativos = await alunosInativos([p.studentId]);
    if (inativos.has(p.studentId)) return;

    const { error } = await supabase.from('notification').insert([{
      idusers_fk: p.teacherId, idstudent_fk: p.studentId, recipient: 'student',
      type: 'sistema', title: p.title, message: p.message, read: false,
    }]);
    if (error) console.error('Aviso de tarefa (aluno): erro ao gravar notificação:', error.message);

    await afterResponse(() => emailStudent(p.studentId, {
      title: p.title, message: p.message, buttonLabel: 'Ver minhas tarefas', buttonPath: '/aluno/tarefas',
    }));
  } catch (e: any) {
    console.error('Aviso de tarefa (aluno) falhou:', e?.message || e);
  }
}

/** Aluno -> professor. A notificação é gravada pela sessão do aluno (a regra de acesso a permite). */
export async function avisarProfessorDaTarefa(
  supabase: Cliente,
  p: { teacherId: string; studentId: string; title: string; message: string },
): Promise<void> {
  try {
    const { error } = await supabase.from('notification').insert([{
      idusers_fk: p.teacherId, idstudent_fk: p.studentId, recipient: 'teacher',
      type: 'sistema', title: p.title, message: p.message, read: false,
    }]);
    if (error) console.error('Aviso de tarefa (professor): erro ao gravar notificação:', error.message);

    await afterResponse(() => emailTeacher(p.teacherId, {
      title: p.title, message: p.message, buttonLabel: 'Ver tarefas', buttonPath: '/tarefas',
    }));
  } catch (e: any) {
    console.error('Aviso de tarefa (professor) falhou:', e?.message || e);
  }
}

/** Texto curto de prazo para os avisos. */
export function prazoPorExtenso(due: string | null | undefined): string {
  return due ? ` Prazo sugerido: ${due.slice(0, 10).split('-').reverse().join('/')}.` : '';
}
