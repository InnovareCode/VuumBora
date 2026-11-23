import { LegalDocumentScreen } from '../../../src/components/auth/LegalDocumentScreen';

/** Termos de Uso, dentro da conta (M13) — mesmo texto/versão de `(auth)/termos.tsx`. */
export default function DriverAccountTermsScreen() {
  return <LegalDocumentScreen kind="terms" backFallback="/privacidade-e-termos" testID="privacidade-e-termos-termos-screen" />;
}
