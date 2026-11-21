/**
 * Lê as variáveis SMTP do ambiente (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS,
 * EMAIL_FROM) a CADA chamada — a configuração efetiva é recomposta a cada envio.
 * Lê `process.env` direto (e não `env.ts`) porque estas variáveis são todas
 * opcionais e nenhuma pode derrubar o boot.
 *
 * `SMTP_ALLOW_INSECURE_DEV=true` é a flag explícita de desenvolvimento: libera
 * host em rede privada/loopback e conexão sem TLS (servidor SMTP falso local).
 * É IGNORADA em produção — NODE_ENV=production nunca a honra.
 */
export interface EnvSmtp {
  readonly host: string | null;
  readonly port: number | null;
  readonly user: string | null;
  readonly password: string | null;
  readonly from: string | null;
}

function nonBlank(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function readEnvSmtp(source: NodeJS.ProcessEnv = process.env): EnvSmtp {
  const port = Number(nonBlank(source['SMTP_PORT']));
  return {
    host: nonBlank(source['SMTP_HOST']),
    port: Number.isInteger(port) && port >= 1 && port <= 65535 ? port : null,
    user: nonBlank(source['SMTP_USER']),
    // Senha: sem trim — espaço nas pontas pode fazer parte dela.
    password: source['SMTP_PASS'] ? source['SMTP_PASS'] : null,
    from: nonBlank(source['EMAIL_FROM']),
  };
}

export function allowInsecureDev(source: NodeJS.ProcessEnv = process.env): boolean {
  return source['SMTP_ALLOW_INSECURE_DEV'] === 'true' && source['NODE_ENV'] !== 'production';
}
