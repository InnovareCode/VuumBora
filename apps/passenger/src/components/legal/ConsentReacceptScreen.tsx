import { useCallback, useEffect, useState } from 'react';
import { BackHandler, Platform, StyleSheet, Text, View } from 'react-native';
import type { PendingConsentDocument } from '@vuumbora/api-client/identity';
import {
  AppShell,
  ConsentCheckbox,
  MockBadge,
  PrimaryButton,
  ScreenHeader,
  SecondaryButton,
  theme,
  textStyle,
} from '@vuumbora/ui';
import { AuthErrorAlert } from '../auth/AuthErrorAlert';
import { AuthHeader } from '../auth/AuthHeader';
import { LegalDocumentBody } from './LegalDocumentBody';
import { describeAuthError, type AuthErrorView } from '../../identity/authErrors';
import { identity } from '../../identity/identityClient';
import { safeCall } from '../../identity/safeCall';
import { LEGAL_LABELS } from '../../legal/legalDocuments';
import {
  describeDocuments,
  pendingToLegalDocuments,
  reacceptPayload,
  replaceWithCurrent,
  type LegalDocumentView,
  type LegalKind,
} from '../../legal/legalModel';
import { useSession } from '../../session/SessionProvider';

export interface ConsentReacceptScreenProps {
  /** `me().consent.pending`: a versão VIGENTE de cada documento que a conta ainda não aceitou. */
  readonly pending: readonly PendingConsentDocument[];
  /** O servidor confirmou que a conta está em dia. */
  readonly onDone: () => void;
}

type Accepted = Readonly<Record<LegalKind, boolean>>;
const NONE_ACCEPTED: Accepted = { terms: false, privacy: false };

/**
 * Reaceite (B3): a conta tem Termos e/ou Política com versão nova ainda não aceita (`me().consent.pending`). Ocupa o
 * lugar das rotas de `(app)` (ver `app/(app)/_layout.tsx`), então não há como "pular" a tela por URL ou deep link.
 *
 *  - cada documento pendente tem a sua caixa (nunca nasce marcada), o link para o texto E a versão ao lado do link;
 *  - só as versões que a tela RENDERIZOU vão a `identity.acceptConsents` (`reacceptPayload`) — nenhuma constante;
 *  - `409 consent_outdated` (saiu versão nova no meio): troca os textos (`error.current`; sem ele, pergunta `me()` de
 *    novo), desmarca as caixas e avisa. NÃO reenvia sozinho;
 *  - o texto abre AQUI, numa subtela local (as rotas `/termos` e `/privacidade` são de `(auth)` e não existem com sessão);
 *  - "Sair da conta" existe: quem não concorda não fica preso numa tela sem saída.
 */
export function ConsentReacceptScreen({ pending, onDone }: ConsentReacceptScreenProps) {
  const { signOut } = useSession();
  // Decidido pelo MODO do cliente: o mock não tem texto real (url `.invalid`), então mostra o provisório marcado.
  const provisional = identity.mode === 'mock';
  const [documents, setDocuments] = useState<readonly LegalDocumentView[]>(() => pendingToLegalDocuments(pending, provisional));
  const [accepted, setAccepted] = useState<Accepted>(NONE_ACCEPTED);
  const [showMissing, setShowMissing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<{ readonly view: AuthErrorView; readonly attempt: number } | null>(null);
  const [reading, setReading] = useState<LegalKind | null>(null);

  // Textos trocados: o que foi marcado valia para o texto ANTERIOR.
  const showNewTexts = useCallback((next: readonly LegalDocumentView[]) => {
    setDocuments(next);
    setAccepted(NONE_ACCEPTED);
    setShowMissing(false);
  }, []);

  const showFailure = useCallback((view: AuthErrorView) => {
    setFailure((previous) => ({ view, attempt: (previous?.attempt ?? 0) + 1 }));
  }, []);

  // Android: o botão voltar fecha o texto (subtela local), não sai do app. SÓ no Android: no web o `BackHandler` do
  // react-native-web registra `console.error("BackHandler is not supported on web")` e o Expo mostra o toast de erro.
  useEffect(() => {
    if (reading === null || Platform.OS !== 'android') return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setReading(null);
      return true;
    });
    return () => subscription.remove();
  }, [reading]);

  async function submit() {
    if (submitting) return;
    if (documents.some((document) => !accepted[document.kind])) {
      setShowMissing(true);
      return;
    }
    const shown = documents; // o que a tela RENDERIZOU neste toque
    setFailure(null);
    setSubmitting(true);

    const result = await safeCall(() => identity.acceptConsents(reacceptPayload(shown)));
    if (result.ok) {
      if (result.data.upToDate) {
        onDone();
        return;
      }
      // Entrou outra pendência no meio: mostra o que falta, com a versão vigente.
      showNewTexts(pendingToLegalDocuments(result.data.pending, provisional));
      setSubmitting(false);
      return;
    }

    const view = describeAuthError('consent', result.error);
    if (view.key === 'consent_outdated') {
      if (result.error.current !== undefined) {
        showNewTexts(replaceWithCurrent(shown, result.error.current, provisional));
      } else {
        // Sem `current` válido: pergunta de novo o que está pendente (o texto novo vem de `me`).
        const refreshed = await safeCall(() => identity.me());
        const consent = refreshed.ok ? refreshed.data.consent : null;
        if (refreshed.ok && (consent === null || consent.upToDate)) {
          onDone();
          return;
        }
        if (refreshed.ok && consent !== null) {
          showNewTexts(pendingToLegalDocuments(consent.pending, provisional));
        } else if (!refreshed.ok) {
          showFailure(describeAuthError('consent', refreshed.error));
          setSubmitting(false);
          return;
        }
      }
    }
    showFailure(view);
    setSubmitting(false);
  }

  if (reading !== null) {
    const document = documents.find((item) => item.kind === reading);
    if (document !== undefined) {
      return (
        <AppShell scroll testID="reaceite-texto-screen">
          <View style={styles.content}>
            <ScreenHeader title={document.shortTitle} onBack={() => setReading(null)} />
            <Text style={styles.title} accessibilityRole="header">
              {document.title}
            </Text>
            <LegalDocumentBody document={document} testID="reaceite-texto" />
            <SecondaryButton label="Voltar" onPress={() => setReading(null)} testID="reaceite-texto-back-button" />
          </View>
        </AppShell>
      );
    }
  }

  return (
    <AppShell scroll testID="reaceite-screen">
      <View style={styles.content}>
        <AuthHeader
          title="Atualizamos nossos documentos"
          subtitle={`Para continuar usando o VuumBora, leia e aceite ${describeDocuments(documents)}.`}
        />

        <View style={styles.consents}>
          {provisional ? <MockBadge label="textos legais provisórios" testID="reaceite-provisional" /> : null}
          {documents.map((document) => (
            <ConsentCheckbox
              key={document.kind}
              label={LEGAL_LABELS[document.kind].acceptLabel}
              checked={accepted[document.kind]}
              onChange={(checked) => setAccepted((previous) => ({ ...previous, [document.kind]: checked }))}
              disabled={submitting}
              error={showMissing && !accepted[document.kind]}
              errorMessage="Marque para continuar."
              linkLabel={LEGAL_LABELS[document.kind].readLabel}
              linkCaption={`Versão ${document.version}`}
              onPressLink={() => setReading(document.kind)}
              testID={`reaceite-${document.kind}-checkbox`}
              linkTestID={`reaceite-${document.kind}-link`}
            />
          ))}
        </View>

        <View style={styles.actions}>
          {failure !== null ? <AuthErrorAlert key={failure.attempt} view={failure.view} testID="reaceite-alert" /> : null}
          <PrimaryButton
            label="Aceitar e continuar"
            onPress={() => void submit()}
            loading={submitting}
            testID="reaceite-submit-button"
          />
          <SecondaryButton
            label="Sair da conta"
            onPress={() => void signOut()}
            disabled={submitting}
            testID="reaceite-signout-button"
          />
        </View>
      </View>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  content: { gap: theme.spacing['6'] },
  title: { color: theme.role.textPrimary, ...textStyle('bold', 'title') },
  consents: { gap: theme.spacing['2'] },
  actions: { gap: theme.spacing['3'] },
});
