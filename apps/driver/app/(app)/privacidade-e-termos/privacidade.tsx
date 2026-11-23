import { LegalDocumentScreen } from '../../../src/components/auth/LegalDocumentScreen';

/** Política de Privacidade, dentro da conta (M13) — mesmo texto/versão de `(auth)/privacidade.tsx`. */
export default function DriverAccountPrivacyScreen() {
  return <LegalDocumentScreen kind="privacy" backFallback="/privacidade-e-termos" testID="privacidade-e-termos-privacidade-screen" />;
}
