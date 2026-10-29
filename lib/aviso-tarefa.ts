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
  p: { teacherId: string; studentId: string; title: string; message: string; copiaProfessor?: { tarefa: string; descricao: string; prazo: string | null } },
): Promise<void> {
  try {
    const inativos = await alunosInativos([p.studentId]);
    if (inativos.has(p.studentId)) return;

    // Cópia para o professor com o conteúdo completo da tarefa: o briefing diário lê esse e-mail
    // para lembrar, na próxima aula do aluno, o que foi passado na anterior.
    if (p.copiaProfessor) {
      const c = p.copiaProfessor;
      const { data: aluno } = await supabase.from('student').select('name').eq('idstudent', p.studentId).maybeSingle();
      const nome = String(aluno?.name ?? 'aluno').trim();
      const prazo = c.prazo ? `\nPrazo: ${c.prazo.slice(0, 10).split('-').reverse().join('/')}` : '\nPrazo: sem prazo definido';
      await afterResponse(() => emailTeacher(p.teacherId, {
        title: `Tarefa para ${nome}`,
        message: `Você passou uma tarefa para ${nome}.\nTarefa: ${c.tarefa}${prazo}\n\nO que foi pedido:\n${c.descricao || '(sem descrição)'}`,
        buttonLabel: 'Ver tarefas do aluno', buttonPath: `/alunos/${p.studentId}`,
      }));
    }

    const { error } = await supabase.from('notification').insert([{
      idusers_fk: p.teacherId, idstudent_fk: p.studentId, recipient: 'student',
      type: 'sistema', title: p.title, message: p.message, read: false,
    }]);
    if (error) console.error('Aviso de tarefa (aluno): erro ao gravar notificação:', error.message);

    await afterResponse(() => emailStudent(p.studentId, {
      title: p.title, message: p.message, buttonLabel: 'Ver minhas tarefas', buttonPath: '/aluno/tarefas', tipo: 'tarefa',
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
