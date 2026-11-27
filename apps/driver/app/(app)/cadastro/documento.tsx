import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Image, StyleSheet, Text, View, type ViewInstance } from 'react-native';
import { FileText, ImageIcon } from 'lucide-react-native';
import {
  AppShell,
  ErrorState,
  FooterActions,
  InlineAlert,
  LinkButton,
  LoadingSkeleton,
  MockBadge,
  NetworkBanner,
  PrimaryButton,
  ScreenHeader,
  SecondaryButton,
  SurfaceRaised,
  theme,
  textStyle,
  tabularNums,
  useNetworkStatus,
} from '@vuumbora/ui';
import type { ApiError } from '@vuumbora/api-client';
import type { DocumentUploadTarget } from '@vuumbora/api-client/driver';
import { CadastroNotOpenScreen } from '../../../src/components/onboarding/CadastroNotOpenScreen';
import { ProgressBar } from '../../../src/components/onboarding/ProgressBar';
import { useFocusAfterRender } from '../../../src/lib/focusAfterRender';
import { goBackOr } from '../../../src/navigation/goBack';
import {
  PICK_FAILURE_MESSAGE,
  documentPickerSupport,
  pickDocument,
  releasePickedDocument,
  type PickedDocument,
  type PickSource,
} from '../../../src/onboarding/documentPicker';
import { getOnboardingClient } from '../../../src/onboarding/onboardingClient';
import { describeOnboardingError, type OnboardingErrorView, type OnboardingOperation } from '../../../src/onboarding/onboardingErrors';
import { refreshOnboarding } from '../../../src/onboarding/onboardingStore';
import { useOnboarding } from '../../../src/onboarding/useOnboarding';
import { useSummaryAction } from '../../../src/onboarding/useSummaryAction';
import {
  buildChecklist,
  findDocument,
  formatCalendarDate,
  nextPendingItem,
  type DocumentChecklistItem,
} from '../../../src/onboarding/verificationModel';
import { useSession } from '../../../src/session/SessionProvider';

type Phase =
  | { readonly kind: 'idle' }
  | { readonly kind: 'reading' }
  | { readonly kind: 'ready'; readonly file: PickedDocument }
  | { readonly kind: 'sending'; readonly file: PickedDocument; readonly step: 'url' | 'upload' | 'submit'; readonly progress: number }
  | { readonly kind: 'failed'; readonly file: PickedDocument; readonly error: OnboardingErrorView }
  | { readonly kind: 'done' };

type DevSend = 'arquivo' | 'progresso' | 'erro' | 'enviado';

/** Arquivo de exemplo só para os estados de desenvolvimento (`?devEnvio=`): nunca sai do aparelho. */
const DEV_FILE: PickedDocument = {
  uri: 'about:blank',
  name: 'documento-exemplo.pdf',
  contentType: 'application/pdf',
  sizeBytes: 245_760,
  sha256: 'b'.repeat(64),
};

function parseDevSend(value: string | undefined): DevSend | undefined {
  if (!__DEV__) return undefined;
  return value === 'arquivo' || value === 'progresso' || value === 'erro' || value === 'enviado' ? value : undefined;
}

function initialPhase(devSend: DevSend | undefined): Phase {
  if (devSend === 'arquivo') return { kind: 'ready', file: DEV_FILE };
  if (devSend === 'progresso') return { kind: 'sending', file: DEV_FILE, step: 'upload', progress: 0.5 };
  if (devSend === 'enviado') return { kind: 'done' };
  return { kind: 'idle' };
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

const STEP_LABEL: Record<'url' | 'upload' | 'submit', string> = {
  url: 'Preparando o envio…',
  upload: 'Enviando',
  submit: 'Confirmando o recebimento…',
};

/**
 * M03, tela do documento (fatia D6): enviar UM documento da lista, por foto ou arquivo, com progresso e reenvio.
 * A rota recebe `?tipo=<typeCode>` (o código do contrato, nunca uma lista fixa do app) e a tela interna é montada de
 * novo a cada tipo (`key`), para "Enviar próximo documento" não herdar o arquivo nem o estado do anterior.
 */
export default function CadastroDocumentoScreen() {
  const { tipo } = useLocalSearchParams<{ tipo?: string }>();
  return <DocumentUploadView key={tipo ?? ''} typeCode={tipo ?? ''} />;
}

/**
 * O envio segue o contrato (`DriverOnboardingPort` + `DocumentUploadPort`): conferir tipo e tamanho no aparelho
 * (antes de qualquer rede) → `requestUploadUrl` (com o SHA-256) → `upload` para a URL assinada, com progresso →
 * `submitDocument`. Cada falha tem texto e ação pelo `code`; o ARQUIVO NÃO SE PERDE (ficha M03 §5): "Enviar de novo"
 * recomeça com o mesmo arquivo e uma URL nova. URL vencida no meio do envio é refeita uma vez sem perguntar (é o que
 * o contrato manda: "peça outra URL"). Sem rede, o envio fica desligado com o motivo (não há fila garantida).
 *
 * Correção pedida mostra o motivo que o servidor mandou (`rejection.text`, catálogo N2) no topo; vencido mostra a
 * data. Documento em análise ou aprovado não oferece envio (o servidor recusaria com `document_under_review`).
 */
function DocumentUploadView({ typeCode }: { readonly typeCode: string }) {
  const { mode: sessionMode, signOut } = useSession();
  const { view, refresh } = useOnboarding();
  const summaryAction = useSummaryAction();
  const online = useNetworkStatus();
  const { devEnvio } = useLocalSearchParams<{ devEnvio?: string }>();
  const devSend = parseDevSend(devEnvio);

  const [phase, setPhase] = useState<Phase>(() => initialPhase(devSend));
  const [pickMessage, setPickMessage] = useState<string | null>(null);
  const mounted = useRef(true);
  const fileUri = useRef<string | null>(null);
  const resultRef = useRef<ViewInstance>(null);
  const focusAfterRender = useFocusAfterRender();

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (fileUri.current) releasePickedDocument(fileUri.current);
    };
  }, []);

  const items = view.status === 'ready' ? buildChecklist(view.verification) : [];
  const item: DocumentChecklistItem | undefined = findDocument(items, typeCode);
  const canSend = item !== undefined && (item.state === 'todo' || item.state === 'rejected' || item.state === 'expired');

  const keepFile = useCallback((file: PickedDocument | null) => {
    if (fileUri.current && fileUri.current !== file?.uri) releasePickedDocument(fileUri.current);
    fileUri.current = file?.uri ?? null;
  }, []);

  async function choose(source: PickSource) {
    setPickMessage(null);
    const previous = phase;
    setPhase({ kind: 'reading' });
    const result = await pickDocument(source);
    if (!mounted.current) return;
    if (result.ok) {
      keepFile(result.file);
      setPhase({ kind: 'ready', file: result.file });
      return;
    }
    // Cancelar o seletor não é erro: volta ao que estava, sem dizer nada.
    setPhase(previous.kind === 'reading' ? { kind: 'idle' } : previous);
    if (result.reason !== 'cancelled') setPickMessage(PICK_FAILURE_MESSAGE[result.reason]);
  }

  const fail = useCallback(
    (file: PickedDocument, operation: OnboardingOperation, error: ApiError) => {
      if (!mounted.current) return;
      setPhase({ kind: 'failed', file, error: describeOnboardingError(operation, error) });
      focusAfterRender(() => resultRef.current?.focus());
    },
    [focusAfterRender],
  );

  const send = useCallback(
    async (file: PickedDocument) => {
      const client = getOnboardingClient();
      if (!client) return;
      const request = { typeCode, contentType: file.contentType, sizeBytes: file.sizeBytes, sha256: file.sha256 };

      let target: DocumentUploadTarget | undefined;
      let uploaded = false;
      // Duas voltas no máximo: a segunda só quando a URL venceu no meio do envio (o contrato manda pedir outra).
      for (let attempt = 0; attempt < 2 && !uploaded; attempt += 1) {
        setPhase({ kind: 'sending', file, step: 'url', progress: 0 });
        const urlResult = await client.port.requestUploadUrl(request);
        if (!urlResult.ok) return fail(file, 'upload_url', urlResult.error);
        target = urlResult.data;
        if (!mounted.current) return;
        setPhase({ kind: 'sending', file, step: 'upload', progress: 0 });
        const uploadResult = await client.uploader.upload(target, { uri: file.uri }, (fraction) => {
          if (mounted.current) setPhase({ kind: 'sending', file, step: 'upload', progress: fraction });
        });
        if (uploadResult.ok) {
          uploaded = true;
        } else if (!(uploadResult.error.kind === 'forbidden' && uploadResult.error.code === 'upload_url_expired' && attempt === 0)) {
          return fail(file, 'upload', uploadResult.error);
        }
      }
      if (!target || !uploaded) return;

      setPhase({ kind: 'sending', file, step: 'submit', progress: 1 });
      const submitResult = await client.port.submitDocument(target.documentId);
      if (!submitResult.ok) return fail(file, 'submit', submitResult.error);

      keepFile(null);
      await refreshOnboarding();
      if (!mounted.current) return;
      setPhase({ kind: 'done' });
      focusAfterRender(() => resultRef.current?.focus());
    },
    [typeCode, fail, keepFile, focusAfterRender],
  );

  function handleFailureAction(file: PickedDocument, error: OnboardingErrorView) {
    if (error.action === 'retry' || error.action === 'restart_upload') void send(file);
    else if (error.action === 'pick_again') {
      keepFile(null);
      setPhase({ kind: 'idle' });
    } else if (error.action === 'refresh') {
      setPhase({ kind: 'idle' });
      void refresh();
    } else if (error.action === 'go_home') router.replace('/');
    else if (error.action === 'sign_in') void signOut();
    else if (error.action === 'support') summaryAction.run({ to: 'support' });
    else if (error.action === 'go_vehicle') router.push('/cadastro/veiculo');
  }

  // Só desenvolvimento: `?devEnvio=erro` envia o arquivo de exemplo com a rede caindo no meio do envio (o mesmo
  // caminho real de falha), para a ferramenta de qualidade de tela fotografar o erro de envio.
  const devFired = useRef(false);
  useEffect(() => {
    if (!__DEV__ || devSend !== 'erro' || devFired.current || view.status !== 'ready' || !canSend) return;
    const client = getOnboardingClient();
    if (!client) return;
    devFired.current = true;
    client.control.failNextUpload('network');
    void send(DEV_FILE);
  }, [devSend, view.status, canSend, send]);

  // Depois de enviar: o próximo documento que falta (a lista já foi relida).
  const nextAfterDone = phase.kind === 'done' ? nextPendingItem(items) : undefined;

  const pickerAvailable = documentPickerSupport.file || documentPickerSupport.camera;
  const file = phase.kind === 'ready' || phase.kind === 'sending' || phase.kind === 'failed' ? phase.file : undefined;
  const sending = phase.kind === 'sending';

  let footer: ReactNode = undefined;
  if (view.status === 'ready' && item) {
    if (phase.kind === 'done') {
      footer = (
        <FooterActions testID="documento-footer">
          {nextAfterDone && nextAfterDone.kind === 'document' ? (
            <PrimaryButton
              label="Enviar próximo documento"
              onPress={() => router.replace({ pathname: '/cadastro/documento', params: { tipo: nextAfterDone.typeCode } })}
              testID="documento-proximo"
            />
          ) : nextAfterDone ? null : (
            <PrimaryButton label="Acompanhar a análise" onPress={() => router.replace('/cadastro/analise')} testID="documento-ver-analise" />
          )}
          <LinkButton label="Ver meus documentos" role="button" onPress={() => goBackOr('/cadastro')} testID="documento-voltar-lista" />
        </FooterActions>
      );
    } else if (!canSend) {
      footer = (
        <FooterActions testID="documento-footer">
          <SecondaryButton label="Voltar aos documentos" onPress={() => goBackOr('/cadastro')} testID="documento-voltar-lista" />
        </FooterActions>
      );
    } else if (file) {
      footer = (
        <FooterActions testID="documento-footer">
          {!online ? (
            <Text style={styles.offlineHint} testID="documento-sem-rede">
              Sem conexão: o envio fica disponível quando a internet voltar.
            </Text>
          ) : null}
          <PrimaryButton
            label="Enviar documento"
            onPress={() => void send(file)}
            loading={sending}
            disabled={!online}
            accessibilityLabel={online ? 'Enviar documento' : 'Enviar documento, indisponível sem conexão'}
            testID="documento-enviar"
          />
          <LinkButton
            label="Trocar arquivo"
            role="button"
            disabled={sending}
            onPress={() => {
              keepFile(null);
              setPhase({ kind: 'idle' });
            }}
            testID="documento-trocar"
          />
        </FooterActions>
      );
    } else {
      footer = (
        <FooterActions testID="documento-footer">
          <PrimaryButton
            label="Tirar foto"
            onPress={() => void choose('camera')}
            disabled={!documentPickerSupport.camera || phase.kind === 'reading'}
            loading={phase.kind === 'reading'}
            testID="documento-tirar-foto"
          />
          <SecondaryButton
            label="Escolher arquivo"
            onPress={() => void choose('file')}
            disabled={!documentPickerSupport.file || phase.kind === 'reading'}
            testID="documento-escolher-arquivo"
          />
        </FooterActions>
      );
    }
  }

  if (view.status === 'not_started') return <CadastroNotOpenScreen title="Documento" reason={view.reason} testID="cadastro-documento-screen" />;

  return (
    <AppShell scroll glow footer={footer} testID="cadastro-documento-screen">
      <View style={styles.content}>
        <NetworkBanner testID="documento-network-banner" />
        <ScreenHeader title="Documento" onBack={() => goBackOr('/cadastro')} testID="documento-header" />

        {view.status === 'idle' || view.status === 'loading' ? (
          <View style={styles.block} testID="documento-carregando">
            <LoadingSkeleton variant="line" width={200} />
            <LoadingSkeleton variant="line" lines={2} />
            <LoadingSkeleton variant="block" height={160} />
          </View>
        ) : view.status === 'error' ? (
          <ErrorState
            title="Não foi possível carregar o documento"
            description={view.error.message}
            onRetry={() => void refresh()}
            retryLabel="Tentar de novo"
            testID="documento-erro-carregar"
          />
        ) : !item ? (
          <ErrorState
            title="Documento não encontrado"
            description="Ele não está na lista pedida agora. Volte e confira os seus documentos."
            onRetry={() => goBackOr('/cadastro')}
            retryLabel="Ver meus documentos"
            testID="documento-nao-encontrado"
          />
        ) : (
          <>
            <View style={styles.block}>
              <Text style={styles.title} accessibilityRole="header" testID="documento-titulo">
                {item.label}
              </Text>
              <Text style={styles.caption}>{item.required ? 'Obrigatório' : 'Opcional'}</Text>
            </View>

            {phase.kind === 'done' ? (
              <InlineAlert
                tone="success"
                title="Documento enviado"
                message="Agora ele vai para a análise. Você acompanha o resultado em Meus documentos."
                focusRef={resultRef}
                testID="documento-enviado"
              />
            ) : item.state === 'rejected' ? (
              <InlineAlert
                tone="warning"
                title="Correção pedida"
                message={item.rejectionText ?? 'O documento foi recusado. Envie de novo.'}
                announce={false}
                testID="documento-motivo-recusa"
              />
            ) : item.state === 'expired' ? (
              <InlineAlert
                tone="danger"
                title="Documento vencido"
                message={
                  item.expiredOn !== undefined
                    ? `Venceu em ${formatCalendarDate(item.expiredOn)}. Envie o documento novo.`
                    : 'Este documento venceu. Envie o documento novo.'
                }
                announce={false}
                testID="documento-vencido"
              />
            ) : item.state === 'submitted' ? (
              <InlineAlert
                tone="info"
                title="Em análise"
                message="Este documento já foi enviado e aguarda a análise. Não é preciso enviar de novo."
                announce={false}
                testID="documento-em-analise"
              />
            ) : item.state === 'approved' ? (
              <InlineAlert
                tone="success"
                title="Aprovado"
                message={item.expiresOn !== undefined ? `Válido até ${formatCalendarDate(item.expiresOn)}.` : 'Nada a fazer por aqui.'}
                announce={false}
                testID="documento-aprovado"
              />
            ) : null}

            {canSend && phase.kind !== 'done' ? (
              <>
                <Text style={styles.instructions}>
                  Envie uma foto nítida ou um PDF do documento inteiro, sem cortes e sem reflexo. JPG, PNG ou PDF de até 10 MB.
                </Text>

                {!pickerAvailable ? (
                  <InlineAlert tone="info" message={PICK_FAILURE_MESSAGE.unavailable} announce={false} testID="documento-sem-seletor" />
                ) : null}

                <SurfaceRaised style={styles.frame} testID="documento-arquivo">
                  {file ? (
                    <View style={styles.fileBlock}>
                      {file.contentType !== 'application/pdf' ? (
                        <Image
                          source={{ uri: file.uri }}
                          style={styles.preview}
                          resizeMode="contain"
                          accessibilityLabel="Prévia da foto escolhida"
                          accessibilityIgnoresInvertColors
                          testID="documento-previa"
                        />
                      ) : null}
                      <View style={styles.fileRow}>
                        {file.contentType === 'application/pdf' ? (
                          <FileText size={24} color={theme.role.textSecondary} strokeWidth={1.75} />
                        ) : (
                          <ImageIcon size={24} color={theme.role.textSecondary} strokeWidth={1.75} />
                        )}
                        <View style={styles.fileText}>
                          <Text style={styles.fileName} numberOfLines={2} testID="documento-arquivo-nome">
                            {file.name}
                          </Text>
                          <Text style={styles.fileSize}>{formatSize(file.sizeBytes)}</Text>
                        </View>
                      </View>
                    </View>
                  ) : (
                    <View style={styles.empty}>
                      <FileText size={28} color={theme.role.textMuted} strokeWidth={1.5} />
                      <Text style={styles.emptyText}>Nenhum arquivo escolhido</Text>
                    </View>
                  )}
                </SurfaceRaised>

                {pickMessage ? <InlineAlert tone="danger" message={pickMessage} testID="documento-erro-arquivo" /> : null}

                {phase.kind === 'sending' ? (
                  <View style={styles.block} accessibilityLiveRegion="polite" testID="documento-enviando">
                    <Text style={styles.progressText}>
                      {phase.step === 'upload' ? `${STEP_LABEL.upload}… ${Math.round(phase.progress * 100)}%` : STEP_LABEL[phase.step]}
                    </Text>
                    <ProgressBar
                      fraction={phase.step === 'url' ? 0 : phase.progress}
                      accessibilityLabel="Envio do documento"
                      testID="documento-progresso"
                    />
                  </View>
                ) : null}

                {phase.kind === 'failed' ? (
                  <InlineAlert
                    tone="danger"
                    title="Não foi possível enviar"
                    message={phase.error.message}
                    focusRef={resultRef}
                    testID={`documento-falha-${phase.error.key}`}
                  >
                    {phase.error.actionLabel !== undefined && phase.error.action !== 'none' ? (
                      <LinkButton
                        label={phase.error.actionLabel}
                        role="button"
                        align="flex-start"
                        disabled={!online && (phase.error.action === 'retry' || phase.error.action === 'restart_upload')}
                        onPress={() => handleFailureAction(phase.file, phase.error)}
                        testID="documento-falha-acao"
                      />
                    ) : null}
                  </InlineAlert>
                ) : null}
              </>
            ) : null}
          </>
        )}

        {sessionMode === 'mock' ? <MockBadge label="cadastro simulado, nada é enviado de verdade" testID="documento-mock-badge" /> : null}
      </View>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  content: { gap: theme.spacing['5'] },
  block: { gap: theme.spacing['2'] },
  title: { color: theme.role.textPrimary, ...textStyle('bold', 'title') },
  caption: { color: theme.role.textSecondary, ...textStyle('regular', 'small') },
  instructions: { color: theme.role.textSecondary, ...textStyle('regular', 'body') },
  frame: {
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: theme.role.borderControl,
    padding: theme.spacing['4'],
  },
  empty: { minHeight: 120, alignItems: 'center', justifyContent: 'center', gap: theme.spacing['2'] },
  emptyText: { color: theme.role.textSecondary, ...textStyle('regular', 'small') },
  fileBlock: { gap: theme.spacing['3'] },
  preview: { width: '100%', height: 180, borderRadius: theme.radius.md, backgroundColor: theme.role.surfaceElevated },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing['3'] },
  fileText: { flex: 1, minWidth: 0, gap: 2 },
  fileName: { color: theme.role.textPrimary, ...textStyle('semibold', 'body') },
  fileSize: { color: theme.role.textSecondary, ...textStyle('regular', 'small'), ...tabularNums },
  progressText: { color: theme.role.textPrimary, ...textStyle('medium', 'body'), ...tabularNums },
  offlineHint: { color: theme.role.textSecondary, ...textStyle('regular', 'small'), textAlign: 'center' },
});
