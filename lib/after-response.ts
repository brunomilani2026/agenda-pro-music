import { after } from 'next/server';

/**
 * Roda `task` DEPOIS de a resposta ir para o cliente, sem atrasá-la.
 *
 * Serve para trabalho best-effort cujo resultado a resposta não usa — em
 * especial e-mails (lookup + chamada HTTP ao EmailJS, ~0,5–2 s cada) e o
 * espelhamento de cadastro no Asaas. Antes,
 * cada `await emailStudent(...)` no meio de uma server action somava esse tempo
 * ao clique do professor; aprovar uma solicitação esperava o e-mail sair.
 *
 * `after()` segura o runtime serverless até a tarefa terminar (uma promise solta
 * seria congelada junto com a função e o envio se perderia às vezes) — é o mesmo
 * mecanismo já usado em NotificationService.create e createAgendaStudent.
 *
 * As tarefas rodam UMA POR VEZ (fila por processo). O EmailJS limita a taxa de
 * envio e os callbacks de `after()` podem começar todos juntos; antes, os
 * e-mails de uma action saíam em sequência, e a fila preserva isso em vez de
 * disparar uma rajada que tomaria 429.
 *
 * `after()` lança fora de um contexto de request (script, teste, código chamado
 * de cache). Nesse caso a tarefa roda inline e é aguardada: exatamente o
 * comportamento de antes, então nenhum chamador pode quebrar por usar isto.
 *
 * Não use quando a resposta depende do resultado (ex.: `warning` de e-mail que
 * falhou) — aí aguarde a promessa normalmente.
 */
let tail: Promise<unknown> = Promise.resolve();

// Teto de espera por tarefa NA FILA. Sem ele, uma chamada HTTP pendurada (fetch
// sem timeout) travaria todas as tarefas seguintes do processo. Passado o teto a
// fila segue; a tarefa lenta continua rodando por conta própria.
const QUEUE_TASK_TIMEOUT_MS = 20_000;

function runBounded(task: () => Promise<unknown>): Promise<void> {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, QUEUE_TASK_TIMEOUT_MS);
    task()
      .catch(() => {})
      .finally(() => {
        clearTimeout(timer);
        resolve();
      });
  });
}

export async function afterResponse(task: () => Promise<unknown>): Promise<void> {
  const enqueue = () => {
    // A falha de uma tarefa não pode travar as seguintes.
    const next = tail.catch(() => {}).then(() => runBounded(task));
    tail = next;
    return next;
  };

  try {
    after(enqueue);
  } catch {
    await task().catch(() => {});
  }
}
