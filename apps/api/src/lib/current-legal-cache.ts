/**
 * Cache em memória da versão VIGENTE dos documentos legais por perfil, para `GET /v1/legal/current` (revisão S1 rodada 3b,
 * B-3). O endpoint é público e sem sessão, e o `Cache-Control` dele não protege a origem (não há CDN na frente): sem isto cada
 * pedido era uma consulta ao banco, que tem 5 conexões e as divide com login e cadastro.
 *
 *  - TTL = `LEGAL_CACHE_MAX_AGE_SECONDS` (o mesmo prazo que a resposta já anuncia ao cliente); 0 desliga o cache;
 *  - só guarda resultado `ok`: "indisponível" e erro de banco nunca ficam guardados (a próxima requisição tenta de novo);
 *  - pedidos simultâneos de uma entrada vencida compartilham UMA consulta (sem debandada quando o prazo vence);
 *  - a chave é o perfil JÁ VALIDADO (`passenger` | `driver`): no máximo duas entradas, nada que o cliente controle;
 *  - o prazo conta do INÍCIO da consulta, então a defasagem máxima é o TTL, não o TTL mais a duração da consulta;
 *  - a defasagem é tolerada pelo desenho: quem publica é o operador (`npm run legal:publish`, outro processo, que não consegue
 *    invalidar esta memória) e o 409 `consent_outdated` já traz a vigente. Por isso SÓ o GET usa este cache: o cadastro, o
 *    reaceite e o portão de compromisso continuam lendo o banco na hora, onde a versão certa decide se o aceite vale.
 */
import type { AccountType } from '../domain/auth.js';
import type { CurrentLegalResult } from '../services/legal-service.js';

interface Entry {
  readonly expiresAt: number;
  readonly result: CurrentLegalResult;
}

export class CurrentLegalCache {
  private readonly entries = new Map<AccountType, Entry>();
  private readonly inflight = new Map<AccountType, Promise<CurrentLegalResult>>();

  constructor(
    private readonly ttlMs: number,
    /** Relógio injetável (os testes não dormem para vencer o prazo). */
    private readonly now: () => number = Date.now,
  ) {}

  get(audience: AccountType, load: () => Promise<CurrentLegalResult>): Promise<CurrentLegalResult> {
    if (this.ttlMs <= 0) return load();
    const hit = this.entries.get(audience);
    if (hit && hit.expiresAt > this.now()) return Promise.resolve(hit.result);
    const pending = this.inflight.get(audience);
    if (pending) return pending;

    const startedAt = this.now();
    const started = load()
      .then((result) => {
        if (result.kind === 'ok') this.entries.set(audience, { expiresAt: startedAt + this.ttlMs, result });
        return result;
      })
      .finally(() => {
        this.inflight.delete(audience);
      });
    this.inflight.set(audience, started);
    return started;
  }
}
