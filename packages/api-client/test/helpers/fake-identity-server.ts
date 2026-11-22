/**
 * Servidor HTTP FALSO, em processo (`node:http`, porta efêmera), que fala o contrato de `/v1/auth/*` o bastante para
 * exercitar o adaptador `http` e o `SessionManager` de ponta a ponta. NÃO é a API: a prova contra a API real é outra.
 *
 * Fidelidade que importa aqui: o refresh é ROTATIVO e o reuso de um refresh já rotacionado MATA a família (como
 * `rotate_refresh_token()` da migração 0011). Assim, um cliente que renove duas vezes com o mesmo refresh falha de
 * verdade no teste — não só "conta chamadas".
 */
import { createServer, type IncomingHttpHeaders, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface RecordedRequest {
  readonly method: string;
  readonly path: string;
  readonly headers: IncomingHttpHeaders;
  readonly body: unknown;
  readonly rawBody: string;
}

export interface ScriptedReply {
  readonly status: number;
  readonly body?: unknown;
  readonly rawBody?: string;
  readonly headers?: Record<string, string>;
  /** Fica calado por este tempo antes de responder (teste de timeout). */
  readonly stallMs?: number;
}

export const ACCOUNT = { id: '00000000-0000-4000-8000-000000000001', publicId: 'VB100001', fullName: 'Ana Souza', accountType: 'passenger' as const };
export const EMAIL = 'ana@example.com';
export const PASSWORD = 'senha-segura-1';

interface TokenPair {
  readonly access: string;
  readonly refresh: string;
}

export class FakeIdentityServer {
  readonly requests: RecordedRequest[] = [];
  /** Respostas fixas por `"METHOD /caminho"`: têm prioridade sobre o comportamento normal. Uso único ou permanente. */
  private readonly scripts = new Map<string, { reply: ScriptedReply; once: boolean }>();
  private readonly liveAccess = new Map<string, number>(); // access token -> família
  private readonly refreshState = new Map<string, { rotated: boolean; familyId: number }>();
  private readonly deadFamilies = new Set<number>();
  private familySeq = 0;
  private tokenSeq = 0;
  private server: Server | null = null;

  /** Atraso do `POST /refresh` (ms). */
  refreshDelayMs = 0;
  /** Atraso de cada `GET /me`, em função da ORDEM de chegada (0, 1, 2...). */
  meDelayMs: (arrival: number) => number = () => 0;
  private meArrivals = 0;
  /** Se definido, TODO `POST /refresh` responde isto (ex.: 401 `invalid_refresh_token` ou 503). */
  refreshOverride: ScriptedReply | null = null;

  url = '';

  async start(): Promise<void> {
    const server = createServer((request, response) => {
      void this.handle(request, response);
    });
    this.server = server;
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    this.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }

  async stop(): Promise<void> {
    const server = this.server;
    if (!server) return;
    this.server = null;
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  script(route: string, reply: ScriptedReply, options: { once?: boolean } = {}): void {
    this.scripts.set(route, { reply, once: options.once ?? false });
  }

  clearScripts(): void {
    this.scripts.clear();
  }

  count(method: string, path: string): number {
    return this.requests.filter((r) => r.method === method && r.path === path).length;
  }

  last(method: string, path: string): RecordedRequest | undefined {
    return this.requests.filter((r) => r.method === method && r.path === path).at(-1);
  }

  /** Simula o tempo passando: nenhum access token emitido até agora vale mais (o refresh continua valendo). */
  expireAccessTokens(): void {
    this.liveAccess.clear();
  }

  private accessIsLive(token: string): boolean {
    const family = this.liveAccess.get(token);
    return family !== undefined && !this.deadFamilies.has(family);
  }

  private issue(familyId: number): TokenPair {
    this.tokenSeq += 1;
    const pair = { access: `access-token-${this.tokenSeq}`, refresh: `refresh-token-number-${String(this.tokenSeq).padStart(6, '0')}` };
    this.liveAccess.set(pair.access, familyId);
    this.refreshState.set(pair.refresh, { rotated: false, familyId });
    return pair;
  }

  private tokensBody(pair: TokenPair): Record<string, string> {
    return {
      accessToken: pair.access,
      accessTokenExpiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
      refreshToken: pair.refresh,
      refreshTokenExpiresAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    };
  }

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(chunk as Buffer);
    const rawBody = Buffer.concat(chunks).toString('utf8');
    let body: unknown;
    try {
      body = rawBody ? (JSON.parse(rawBody) as unknown) : undefined;
    } catch {
      body = undefined;
    }
    const method = request.method ?? 'GET';
    const path = (request.url ?? '/').split('?')[0] ?? '/';
    const recorded: RecordedRequest = { method, path, headers: request.headers, body, rawBody };
    this.requests.push(recorded);

    const send = async (reply: ScriptedReply, extraDelay = 0): Promise<void> => {
      const wait = (reply.stallMs ?? 0) + extraDelay;
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      if (response.destroyed) return;
      response.writeHead(reply.status, { 'Content-Type': 'application/json', ...(reply.headers ?? {}) });
      response.end(reply.rawBody ?? (reply.body === undefined ? '' : JSON.stringify(reply.body)));
    };
    const ok = (data?: unknown): ScriptedReply => ({ status: 200, body: data === undefined ? { ok: true } : { ok: true, data } });
    const error = (status: number, code: string, extras: Record<string, unknown> = {}): ScriptedReply => ({
      status,
      body: { ok: false, error: { code, message: `mensagem de ${code}`, ...extras } },
    });

    const route = `${method} ${path}`;
    const scripted = this.scripts.get(route);
    if (scripted) {
      if (scripted.once) this.scripts.delete(route);
      return send(scripted.reply);
    }

    const bearer = typeof request.headers.authorization === 'string' ? request.headers.authorization.replace(/^Bearer /, '') : '';
    const fields = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;

    switch (route) {
      case 'POST /v1/auth/login': {
        if (fields['identifier'] === 'pendente@example.com' && fields['password'] === PASSWORD) return send(error(403, 'email_not_verified'));
        if (fields['identifier'] !== EMAIL || fields['password'] !== PASSWORD) return send(error(401, 'invalid_credentials'));
        this.familySeq += 1;
        return send(ok({ account: ACCOUNT, ...this.tokensBody(this.issue(this.familySeq)) }));
      }
      case 'POST /v1/auth/refresh': {
        if (this.refreshOverride) return send(this.refreshOverride, this.refreshDelayMs);
        const record = typeof fields['refreshToken'] === 'string' ? this.refreshState.get(fields['refreshToken']) : undefined;
        if (!record || this.deadFamilies.has(record.familyId)) return send(error(401, 'invalid_refresh_token'), this.refreshDelayMs);
        if (record.rotated) {
          this.deadFamilies.add(record.familyId); // reuso: a família inteira morre
          return send(error(401, 'invalid_refresh_token'), this.refreshDelayMs);
        }
        record.rotated = true;
        return send(ok(this.tokensBody(this.issue(record.familyId))), this.refreshDelayMs);
      }
      case 'POST /v1/auth/logout': {
        const record = typeof fields['refreshToken'] === 'string' ? this.refreshState.get(fields['refreshToken']) : undefined;
        if (record) this.deadFamilies.add(record.familyId);
        return send(ok());
      }
      case 'POST /v1/auth/logout-all': {
        if (!this.accessIsLive(bearer)) return send(error(401, 'unauthorized'));
        for (const record of this.refreshState.values()) this.deadFamilies.add(record.familyId);
        return send(ok({ revokedSessions: 1 }));
      }
      case 'GET /v1/auth/me': {
        const arrival = this.meArrivals;
        this.meArrivals += 1;
        const delay = this.meDelayMs(arrival);
        if (!this.accessIsLive(bearer)) return send(error(401, 'unauthorized'), delay);
        return send(ok(ACCOUNT), delay);
      }
      default:
        return send(error(404, 'not_found'));
    }
  }
}
