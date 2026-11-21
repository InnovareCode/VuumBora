/**
 * Forma "canônica" de um e-mail SÓ para chave de limite de envio (revisão S1 rodada 2, I-5c).
 * O e-mail gravado e o usado no envio NÃO mudam: isto apenas faz `vitima+1@gmail.com`,
 * `vitima+2@gmail.com` e `v.itima@googlemail.com` caírem no mesmo balde — sem isso, uma única caixa
 * de entrada alheia recebe e-mails ilimitados do domínio, um endereço "diferente" a cada vez.
 *
 *  - `+tag` do usuário é descartado em qualquer domínio (todo provedor relevante entrega para a mesma caixa);
 *  - Gmail (`gmail.com` / `googlemail.com`): pontos do usuário não contam e os dois domínios são o mesmo;
 *  - tudo em minúsculas.
 * Domínio fora do Gmail mantém os pontos (lá `a.b` e `ab` podem ser caixas diferentes).
 */
export function canonicalEmailForLimit(email: string): string {
  const text = email.trim().toLowerCase();
  const at = text.lastIndexOf('@');
  if (at <= 0) return text;

  let local = text.slice(0, at);
  let domain = text.slice(at + 1);
  const plus = local.indexOf('+');
  if (plus > 0) local = local.slice(0, plus);
  if (domain === 'googlemail.com') domain = 'gmail.com';
  if (domain === 'gmail.com') local = local.replaceAll('.', '');
  return local === '' ? text : `${local}@${domain}`;
}
