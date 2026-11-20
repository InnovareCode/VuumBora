/**
 * Cursor opaco de paginação por chave (keyset), não por OFFSET: estável sob
 * inserção concorrente (OFFSET pula/repete linha quando alguém insere no
 * meio da listagem) e rápido em qualquer página (sem `OFFSET N` custoso).
 * Formato interno: `"<created_at ISO>|<id>"`, ordenado por
 * `(created_at, id) DESC` — par precisa de desempate porque `created_at`
 * pode colidir entre linhas inseridas no mesmo milissegundo.
 */

export interface DecodedCursor {
  readonly createdAt: string;
  readonly id: string;
}

export function encodeCursor(createdAt: string, id: string): string {
  return Buffer.from(`${createdAt}|${id}`, 'utf8').toString('base64url');
}

/**
 * `createdAt` tem precisão de microssegundo (ver `created_at_cursor` em
 * `admin-driver-application-repository.ts`) — validar com `Date.parse`
 * truncaria/rejeitaria essa precisão (o tipo `Date` do JS só guarda
 * milissegundo). Por isso a validação aqui é um formato, não um parse.
 */
const CURSOR_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

/** `null` para cursor malformado/adulterado — quem chama decide como responder (400). */
export function decodeCursor(cursor: string): DecodedCursor | null {
  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
    const separatorIndex = decoded.lastIndexOf('|');
    if (separatorIndex <= 0 || separatorIndex === decoded.length - 1) return null;

    const createdAt = decoded.slice(0, separatorIndex);
    const id = decoded.slice(separatorIndex + 1);
    if (!CURSOR_TIMESTAMP_PATTERN.test(createdAt)) return null;

    return { createdAt, id };
  } catch {
    return null;
  }
}
