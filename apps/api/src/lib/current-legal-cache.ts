/**
 * Cache em memória da versão VIGENTE dos documentos legais por perfil, para `GET /v1/legal/current` (revisão S1 rodada 3b,
 * B-3, e rodada 3c, B-7). O endpoint é público e sem sessão, e o `Cache-Control` dele não protege a origem (não há CDN na frente):
 * sem isto cada pedido era uma consulta ao banco, que tem 5 conexões e as divide com login e cadastro.
 *
 *  - TTL = `LEGAL_CACHE_MAX_AGE_SECONDS` (o mesmo prazo que a resposta já anuncia ao cliente); 0 desliga o cache (inclusive o negativo);
 *  - "indisponível" (sem versão publicada) fica guardado por um prazo CURTO (`negativeTtlMs`, nunca maior que o TTL): enquanto nenhuma
 *    versão está publicada cada pedido relê o banco, e a falha é a situação mais longa e barata de manter sob enxurrada. O custo é
 *    pequeno por desenho: o operador que acaba de publicar vê o 503 por no máximo esses poucos segundos;
 *  - erro de banco NUNCA fica guardado (a próxima requisição tenta de novo); a consulta em voo já é única por perfil;
 *  - pedidos simultâneos de uma entrada vencida compartilham UMA consulta (sem debandada quando o prazo vence);
 *  - a chave é o perfil JÁ VALIDADO (`passenger` | `driver`): no máximo duas entradas, nada que o cliente controle;
 *  - o prazo conta do INÍCIO da consulta, então a defasagem máxima é o TTL, não o TTL mais a duração da consulta;
 *  - a defasagem é tolerada pelo desenho: quem publica é o operador (`npm run legal:publish`, outro processo, que não consegue
 *    invalidar esta memória) e o 409 `consent_outdated` já traz a vigente. Por isso SÓ o GET usa este cache: o cadastro, o
 *    reaceite e o portão de compromisso continuam lendo o banco na hora, onde a versão certa decide se o aceite vale.
 */
import type { AccountType } from '../domain/auth.js';
import type { CurrentLegalResult } from '../services/legal-service.js';

/** Quanto "indisponível" fica guardado (ms), se o TTL permitir: de 1 a 5 s é o que basta para tirar o banco do caminho da enxurrada. */
export const DEFAULT_NEGATIVE_TTL_MS = 3_000;

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
    private readonly negativeTtlMs: number = DEFAULT_NEGATIVE_TTL_MS,
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
        const keepMs = result.kind === 'ok' ? this.ttlMs : Math.min(this.negativeTtlMs, this.ttlMs);
        if (keepMs > 0) this.entries.set(audience, { expiresAt: startedAt + keepMs, result });
        return result;
      })
      .finally(() => {
        this.inflight.delete(audience);
      });
    this.inflight.set(audience, started);
    return started;
  }
}
