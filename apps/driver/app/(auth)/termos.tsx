import { LegalDocumentScreen } from '../../src/components/auth/LegalDocumentScreen';

/** Termos de Uso — público (abre ao criar a conta). Conteúdo e versão: `src/legal/legalDocuments.ts`. */
export default function TermosScreen() {
  return <LegalDocumentScreen kind="terms" testID="termos-screen" />;
}
