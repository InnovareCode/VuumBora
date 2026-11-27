/**
 * O ÚNICO cliente do CADASTRO DE MOTORISTA do app (M3, fatia D6 do `docs/plano-m3-m4.md`): vínculo com a candidatura,
 * etapa 2 (dados, CNH, endereço), veículo, verificação e envio de documentos. Nenhuma tela monta o próprio cliente.
 *
 * CONTA NÃO É CADASTRO. A conta (identidade, B2) é de quem entra no app; o cadastro de motorista é esta outra etapa, e
 * só existe para a conta ligada a uma candidatura APROVADA de mesmo e-mail (N3, `linkApplication`).
 *
 * **Só existe o adaptador `mock` no `api-client`** (o `http` entra com as rotas do D4). Por isso:
 * - com a identidade simulada (`identity.mode === 'mock'`, só `development`), o cadastro roda sobre
 *   `createMockDriverOnboarding` — uma instância por carregamento de página (some no `page.goto`/recarregar, igual à
 *   sessão simulada; sobrevive à navegação dentro do app);
 * - com a identidade REAL (`http`, toda build de preview/produção), `getOnboardingClient()` devolve `null` e o app
 *   mostra o cadastro como **ainda não aberto**. Ligar o mock aqui faria uma conta real "enviar" CNH para a memória do
 *   aparelho e ver "Em análise" de um cadastro que o compromisso público diz que não abriu (Q5). Quando o D4 existir, o
 *   `null` vira o adaptador `http`, pela mesma troca de módulo da identidade (`src/identity/mode.ts`).
 *
 * Gancho de prova (só `__DEV__` no web, igual ao `__vuumboraIdentity`): `window.__vuumboraOnboarding` expõe a porta, o
 * `control` do mock (fazer o papel do revisor: `review`, `expireDocument`, `suspend`, `failNext`, `failNextUpload`) e
 * `refresh()` para a tela reler a verificação. Nunca existe no app da loja.
 */
import { Platform } from 'react-native';
import { createMockDriverOnboarding, type MockDriverOnboarding } from '@vuumbora/api-client/driver';
import { identity } from '../identity/identityClient';

/** Passo do progresso simulado do envio: o bastante para a barra ser vista, curto para não atrasar a prova. */
const MOCK_UPLOAD_STEP_DELAY_MS = 250;

let current: MockDriverOnboarding | null = null;

/** `false` = esta build não tem cadastro de motorista (identidade real sem o adaptador `http` do D4). */
export function isOnboardingAvailable(): boolean {
  return identity.mode === 'mock';
}

export function getOnboardingClient(): MockDriverOnboarding | null {
  if (!isOnboardingAvailable()) return null;
  if (!current) current = createMockDriverOnboarding({ uploadStepDelayMs: MOCK_UPLOAD_STEP_DELAY_MS });
  return current;
}

/**
 * Descarta o cadastro simulado: a próxima leitura começa do zero. Chamado ao sair da conta (outra conta no mesmo
 * aparelho não herda o cadastro da anterior) e pelos cenários de desenvolvimento.
 */
export function resetOnboardingClient(options?: {
  readonly application?: 'approved' | 'pending' | 'none';
  readonly uploadStepDelayMs?: number;
}): MockDriverOnboarding | null {
  if (!isOnboardingAvailable()) {
    current = null;
    return null;
  }
  current = createMockDriverOnboarding({
    uploadStepDelayMs: options?.uploadStepDelayMs ?? MOCK_UPLOAD_STEP_DELAY_MS,
    ...(options?.application !== undefined ? { application: options.application } : {}),
  });
  return current;
}

interface OnboardingDevHook {
  readonly client: () => MockDriverOnboarding | null;
  refresh?: () => Promise<void>;
}

/** Registra o gancho de prova (só `__DEV__` web). `refresh` é ligado pela store, que importa este módulo. */
export function registerOnboardingDevHook(refresh: () => Promise<void>): void {
  if (!__DEV__ || Platform.OS !== 'web') return;
  const hooks = globalThis as { __vuumboraOnboarding?: OnboardingDevHook };
  hooks.__vuumboraOnboarding = {
    client: () => getOnboardingClient(),
    refresh,
  };
}
