import styles from './HeroScene.module.css';

/**
 * A animação de impacto da página: o pino da marca em 3D sobre uma rota que
 * se desenha, parado sobre um fundo com leve brilho — ver
 * `HeroScene.module.css` para por que isso é SSR/sem JS e seguro sob
 * `prefers-reduced-motion: reduce`. Puramente decorativo (`aria-hidden`),
 * nunca a única forma de entender a página.
 */
export function HeroScene() {
  return (
    <div className={styles['scene']} aria-hidden="true">
      <div className={styles['glow']} />
      <svg className={styles['map']} viewBox="0 0 320 360" fill="none" focusable="false">
        <path className={styles['route']} d="M58 286 C 30 210 130 232 146 168 C 158 118 196 148 224 100" />
        <circle className={styles['pickupHalo']} cx="58" cy="286" r="10" />
        <circle className={styles['pickup']} cx="58" cy="286" r="5" />
      </svg>
      <div className={styles['pinWrap']} style={{ left: '70%', top: '28%' }}>
        <div className={styles['pinStage']}>
          <svg className={styles['pin']} viewBox="0 0 32 40" fill="none" focusable="false">
            <defs>
              <linearGradient id="vuumbora-pin-gradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" style={{ stopColor: 'var(--color-brand-yellow-deep)' }} />
                <stop offset="0.45" style={{ stopColor: 'var(--color-brand-yellow)' }} />
                <stop offset="1" style={{ stopColor: 'var(--color-brand-yellow-pressed)' }} />
              </linearGradient>
            </defs>
            <path
              d="M16 0C7.2 0 0 7.2 0 16c0 10.5 16 24 16 24s16-13.5 16-24C32 7.2 24.8 0 16 0z"
              fill="url(#vuumbora-pin-gradient)"
            />
            <circle cx="16" cy="16" r="6.5" style={{ fill: 'var(--color-brand-navy)' }} />
          </svg>
        </div>
      </div>
    </div>
  );
}
