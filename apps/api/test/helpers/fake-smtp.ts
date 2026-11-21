/** Servidor SMTP falso local (smtp-server): guarda as mensagens e as credenciais recebidas. Sem TLS — só vale com SMTP_ALLOW_INSECURE_DEV. */
import { SMTPServer } from 'smtp-server';

export interface FakeSmtp {
  readonly port: number;
  readonly messages: Array<{ from: string; to: string[]; raw: string }>;
  readonly logins: Array<{ user: string; pass: string }>;
  close(): Promise<void>;
}

export interface FakeSmtpOptions {
  readonly port?: number;
  /** Sem `user`, o servidor aceita sem autenticar. */
  readonly user?: string;
  readonly pass?: string;
  readonly rejectRecipientsWith?: string;
}

export async function startFakeSmtp(options: FakeSmtpOptions = {}): Promise<FakeSmtp> {
  const messages: FakeSmtp['messages'] = [];
  const logins: FakeSmtp['logins'] = [];
  const server = new SMTPServer({
    disabledCommands: ['STARTTLS'],
    allowInsecureAuth: true,
    authOptional: options.user === undefined,
    logger: false,
    onAuth(auth, _session, callback) {
      logins.push({ user: auth.username ?? '', pass: auth.password ?? '' });
      if (auth.username === options.user && auth.password === options.pass) return callback(null, { user: auth.username });
      callback(new Error('Credenciais recusadas pelo servidor falso'));
    },
    onRcptTo(_address, _session, callback) {
      if (options.rejectRecipientsWith) {
        const err = new Error(options.rejectRecipientsWith) as Error & { responseCode: number };
        err.responseCode = 550;
        return callback(err);
      }
      callback();
    },
    onData(stream, session, callback) {
      const chunks: Buffer[] = [];
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', () => {
        messages.push({
          from: session.envelope.mailFrom ? session.envelope.mailFrom.address : '',
          to: session.envelope.rcptTo.map((r) => r.address),
          raw: Buffer.concat(chunks).toString('utf8'),
        });
        callback();
      });
    },
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port ?? 0, '127.0.0.1', resolve);
  });
  const address = server.server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  return { port, messages, logins, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}
