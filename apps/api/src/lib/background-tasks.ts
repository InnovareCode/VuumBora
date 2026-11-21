/**
 * Tarefas em segundo plano rastreadas (envio de e-mail das rotas que respondem
 * igual exista a conta ou não: esperar o SMTP faria o tempo de resposta
 * revelar a existência). `drainBackgroundTasks` serve ao desligamento
 * ordenado e aos testes.
 */
const pending = new Set<Promise<void>>();

export function runInBackground(task: () => Promise<void>, onError: (err: unknown) => void): void {
  const promise: Promise<void> = task()
    .catch(onError)
    .finally(() => {
      pending.delete(promise);
    });
  pending.add(promise);
}

export async function drainBackgroundTasks(): Promise<void> {
  while (pending.size > 0) await Promise.allSettled([...pending]);
}

/** Teto de tempo para uma promessa (o adaptador de e-mail é de terceiros). */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error('timeout'), { code: 'MAIL_TIMEOUT' })), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
