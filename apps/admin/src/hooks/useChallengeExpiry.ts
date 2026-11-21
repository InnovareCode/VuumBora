import { useEffect, useRef } from 'react';

/**
 * Avisa `onExpire` quando o desafio de login (10 min) deixa de valer — sem
 * isso a pessoa só descobriria no envio, depois de digitar. `active = false`
 * desliga (ex.: depois do enrolamento confirmado o desafio já foi consumido e
 * a tela está mostrando os códigos de recuperação: expirar ali não pode
 * jogar a pessoa de volta ao login e perder os códigos).
 */
export function useChallengeExpiry(expiresAt: string, active: boolean, onExpire: () => void): void {
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  useEffect(() => {
    if (!active) return;
    const target = Date.parse(expiresAt);
    if (Number.isNaN(target)) return;
    // setTimeout é limitado a ~24,8 dias; o desafio vale 10 min, então cabe com folga.
    const id = setTimeout(() => onExpireRef.current(), Math.max(0, target - Date.now()));
    return () => clearTimeout(id);
  }, [expiresAt, active]);
}
