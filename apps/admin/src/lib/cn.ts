/** Junta classNames condicionais sem trazer uma dependência só para isso. */
export function cn(...values: ReadonlyArray<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}
