import { LegalDocumentScreen } from '../../src/components/auth/LegalDocumentScreen';

/** Política de Privacidade — pública (abre do cadastro e da P01). Conteúdo e versão: `src/legal/legalDocuments.ts`. */
export default function PrivacidadeScreen() {
  return <LegalDocumentScreen kind="privacy" testID="privacidade-screen" />;
}
