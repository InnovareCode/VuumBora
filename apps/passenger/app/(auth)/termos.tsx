import { LegalDocumentScreen } from '../../src/components/auth/LegalDocumentScreen';

/** Termos de Uso — público (abre do cadastro e da P01). Conteúdo e versão: `src/legal/legalDocuments.ts`. */
export default function TermosScreen() {
  return <LegalDocumentScreen kind="terms" testID="termos-screen" />;
}
