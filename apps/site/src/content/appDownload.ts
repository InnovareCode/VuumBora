/**
 * Bloco "Baixe o aplicativo" (`AppDownloadBlock.tsx`) — substitui "Quem está
 * por trás" em 19/11/2026 (`docs/decisoes-do-dono.md`). O CNPJ/empresa que
 * morava nesse bloco foram para o rodapé (ver `content/footer.ts`).
 *
 * Os dois botões de loja são `disabled` de propósito: não existe link real
 * de Google Play/App Store ainda, e não inventamos um nem uma data de
 * lançamento. `comingSoonNote` é o motivo por extenso, ligado aos dois
 * botões via `aria-describedby` — a razão do desabilitado precisa chegar a
 * quem usa leitor de tela, não só a quem vê a cor acinzentada.
 */
export const APP_DOWNLOAD_CONTENT = {
  eyebrow: 'Em breve',
  title: 'Baixe o aplicativo',
  description: 'O app do VuumBora ainda não está nas lojas. Avisamos por aqui assim que o download abrir para Natal e a Grande Natal.',
  comingSoonNote: 'Em breve — ainda não lançamos nas lojas de aplicativo. Os botões abaixo não abrem nada por enquanto.',
  stores: [
    { id: 'google-play', storeName: 'Google Play' },
    { id: 'app-store', storeName: 'App Store' },
  ] as const,
} as const;
