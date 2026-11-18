import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';

/** `next lint` foi removido no Next 16 — ESLint flat config direto,
 * reaproveitando o preset oficial (core-web-vitals + a11y + import). */
const config = [
  ...nextCoreWebVitals,
  {
    ignores: ['out/**', '.next/**', 'src/styles/tokens.generated.css'],
  },
];

export default config;
