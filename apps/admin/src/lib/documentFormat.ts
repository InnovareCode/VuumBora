/**
 * Formatação só de TELA para a fila de documentos (D7). Nada aqui é regra de negócio: o vencido do prazo
 * vem pronto do servidor (`overdue`), e a validade do documento é conferida por ele (`invalid_expires_on`).
 */

const HOUR = 60 * 60 * 1000;

/**
 * `AAAA-MM-DD` → `DD/MM/AAAA` sem passar por `Date`: `new Date('2027-06-30')` é meia-noite UTC, e em Natal
 * (UTC−3) o `Intl` mostraria 29/06 — um dia a menos na validade de um documento.
 */
export function formatCalendarDate(ymd: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : ymd;
}

/** Hoje em Natal (UTC−3, sem horário de verão), `AAAA-MM-DD` — o `min` do campo de validade. */
export function natalToday(nowMs: number = Date.now()): string {
  return new Date(nowMs - 3 * HOUR).toISOString().slice(0, 10);
}

/** CPF vem sem máscara (11 algarismos). */
export function formatCpf(cpf: string): string {
  return /^\d{11}$/.test(cpf) ? `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}` : cpf;
}

/** CEP vem sem traço (8 algarismos). */
export function formatPostalCode(cep: string): string {
  return /^\d{8}$/.test(cep) ? `${cep.slice(0, 5)}-${cep.slice(5)}` : cep;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

const CONTENT_TYPE_LABEL: Readonly<Record<string, string>> = {
  'image/jpeg': 'JPEG',
  'image/png': 'PNG',
  'application/pdf': 'PDF',
};

export function formatContentType(contentType: string): string {
  return CONTENT_TYPE_LABEL[contentType] ?? contentType;
}

export function isImageContentType(contentType: string): boolean {
  return contentType.startsWith('image/');
}

/** "há 5 h", "em 45 h", "há 2 dias" — só para leitura rápida; a data exata fica ao lado. */
export function formatRelativeHours(targetIso: string, nowMs: number = Date.now()): string {
  const diff = Date.parse(targetIso) - nowMs;
  const hours = Math.round(Math.abs(diff) / HOUR);
  const amount = hours >= 48 ? `${Math.round(hours / 24)} dias` : hours < 1 ? 'menos de 1 h' : `${hours} h`;
  return diff < 0 ? `há ${amount}` : `em ${amount}`;
}

const timeFormatter = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });

export function formatTime(iso: string): string {
  return timeFormatter.format(new Date(iso));
}
