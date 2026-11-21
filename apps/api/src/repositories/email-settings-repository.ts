/** Camada de dados — único lugar que fala SQL com `email_settings` (linha única, id = 1). */
import type { Pool } from 'pg';
import type { PanelSmtp } from '../domain/email-settings.js';

interface Row {
  host: string | null;
  port: number | null;
  username: string | null;
  password_encrypted: string | null;
  from_address: string | null;
  updated_at: Date;
}

const EMPTY: PanelSmtp = { host: null, port: null, user: null, from: null, hasPassword: false, updatedAt: null };

function toPanel(row: Row): PanelSmtp {
  return {
    host: row.host,
    port: row.port,
    user: row.username,
    from: row.from_address,
    hasPassword: row.password_encrypted !== null,
    updatedAt: row.updated_at.toISOString(),
  };
}

export async function findPanelSmtp(pool: Pool): Promise<PanelSmtp> {
  const result = await pool.query<Row>('SELECT host, port, username, password_encrypted, from_address, updated_at FROM email_settings WHERE id = 1');
  return result.rows[0] ? toPanel(result.rows[0]) : EMPTY;
}

/** Só o envio decifra a senha; quem lê a configuração para a tela nunca passa por aqui. */
export async function findEncryptedPassword(pool: Pool): Promise<string | null> {
  const result = await pool.query<{ password_encrypted: string | null }>('SELECT password_encrypted FROM email_settings WHERE id = 1');
  return result.rows[0]?.password_encrypted ?? null;
}

export type PasswordChange = { readonly kind: 'keep' } | { readonly kind: 'clear' } | { readonly kind: 'set'; readonly encrypted: string };

export interface SaveRow {
  readonly host: string | null;
  readonly port: number | null;
  readonly user: string | null;
  readonly from: string | null;
  readonly password: PasswordChange;
  readonly adminId: string;
}

/** UPSERT atômico da linha única: dois "salvar" concorrentes não duplicam nem se misturam (o último vence, inteiro). */
export async function savePanelSmtp(pool: Pool, row: SaveRow): Promise<PanelSmtp> {
  const result = await pool.query<Row>(
    `INSERT INTO email_settings (id, host, port, username, password_encrypted, from_address, updated_by, updated_at)
     VALUES (1, $1, $2, $3, CASE WHEN $6::text = 'set' THEN $7::text ELSE NULL END, $4, $5, now())
     ON CONFLICT (id) DO UPDATE SET
       host = EXCLUDED.host,
       port = EXCLUDED.port,
       username = EXCLUDED.username,
       from_address = EXCLUDED.from_address,
       password_encrypted = CASE $6::text
         WHEN 'set' THEN EXCLUDED.password_encrypted
         WHEN 'clear' THEN NULL
         ELSE email_settings.password_encrypted END,
       updated_by = EXCLUDED.updated_by,
       updated_at = now()
     RETURNING host, port, username, password_encrypted, from_address, updated_at`,
    [row.host, row.port, row.user, row.from, row.adminId, row.password.kind, row.password.kind === 'set' ? row.password.encrypted : null],
  );
  return toPanel(result.rows[0]!);
}

/** Remove só a senha salva. Devolve se havia algo a remover. */
export async function clearPanelPassword(pool: Pool, adminId: string): Promise<boolean> {
  const result = await pool.query(
    `UPDATE email_settings SET password_encrypted = NULL, updated_by = $1, updated_at = now()
     WHERE id = 1 AND password_encrypted IS NOT NULL`,
    [adminId],
  );
  return (result.rowCount ?? 0) > 0;
}
