const dateFormatter = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
const dateTimeFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export function formatDate(iso: string): string {
  return dateFormatter.format(new Date(iso));
}

export function formatDateTime(iso: string): string {
  return dateTimeFormatter.format(new Date(iso));
}

/** Os três campos opcionais do formulário (ver docs/plano-sistema.md) podem vir sem resposta — não é "não", é "não informado". */
export function formatTristate(value: boolean | null): string {
  if (value === null) return 'Não informado';
  return value ? 'Sim' : 'Não';
}
