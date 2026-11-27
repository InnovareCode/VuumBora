/**
 * Estado COMPARTILHADO do cadastro de motorista: a verificação (`GET /v1/driver/verification`) que a Home (M05/M04),
 * o Perfil (M13), a lista (M03) e a análise (M04) leem. É global porque as quatro telas mostram o MESMO fato e uma
 * mudança numa (documento enviado) tem de aparecer nas outras sem cada uma buscar de novo por conta própria.
 * Formulários, arquivo escolhido e progresso de envio ficam no estado LOCAL de cada tela.
 *
 * Carregar = ler a verificação; se a conta ainda não tem cadastro (`not_started`), pedir o vínculo com a candidatura
 * (N3, idempotente) e ler de novo. O vínculo recusado (`409 application_not_approved` / `email_not_verified`) não é
 * erro de tela: é o estado "cadastro ainda não aberto" com o motivo.
 *
 * Voo único: chamadas simultâneas (Home montando + foco da tela) esperam a MESMA leitura. Reler com dado na tela não
 * volta ao esqueleto (`refreshing`), e uma falha nessa releitura mantém o último estado bom em vez de trocar a tela
 * inteira por erro (a `NetworkBanner` já avisa da falta de rede).
 */
import { create } from 'zustand';
import type { ApiError, Result } from '@vuumbora/api-client';
import type { DriverVerification } from '@vuumbora/api-client/driver';
import { applyDevScenario, type DevScenario } from './devScenarios';
import { getOnboardingClient, registerOnboardingDevHook, resetOnboardingClient } from './onboardingClient';
import { describeOnboardingError, type OnboardingErrorView } from './onboardingErrors';
import type { NotStartedReason } from './verificationModel';

export type OnboardingView =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'not_started'; readonly reason: NotStartedReason }
  | { readonly status: 'ready'; readonly verification: DriverVerification }
  | { readonly status: 'error'; readonly error: OnboardingErrorView };

interface OnboardingStoreState {
  readonly view: OnboardingView;
  readonly refreshing: boolean;
  readonly appliedScenario: DevScenario | undefined;
}

export const useOnboardingStore = create<OnboardingStoreState>(() => ({
  view: { status: 'idle' },
  refreshing: false,
  appliedScenario: undefined,
}));

/** A porta devolve `Result` e não rejeita no caminho normal; o que escapar vira `unknown` (a tela sabe mostrar). */
async function safe<T>(call: () => Promise<Result<T>>): Promise<Result<T>> {
  try {
    return await call();
  } catch (error) {
    console.warn('[cadastro] a chamada lançou exceção', error instanceof Error ? error.name : 'erro');
    return { ok: false, error: { kind: 'unknown', message: 'Falha inesperada.' } };
  }
}

function linkRefusal(error: ApiError): NotStartedReason | undefined {
  if (error.kind !== 'conflict') return undefined;
  const code = error.code ?? error.reason;
  if (code === 'application_not_approved' || code === 'email_not_verified' || code === 'application_already_linked') return code;
  return undefined;
}

async function readView(): Promise<OnboardingView> {
  const client = getOnboardingClient();
  if (!client) return { status: 'not_started', reason: 'closed' };

  const first = await safe(() => client.port.verification());
  if (!first.ok) return { status: 'error', error: describeOnboardingError('load', first.error) };
  if (first.data.status !== 'not_started') return { status: 'ready', verification: first.data };

  const link = await safe(() => client.port.linkApplication());
  if (!link.ok) {
    const reason = linkRefusal(link.error);
    return reason ? { status: 'not_started', reason } : { status: 'error', error: describeOnboardingError('load', link.error) };
  }
  const second = await safe(() => client.port.verification());
  if (!second.ok) return { status: 'error', error: describeOnboardingError('load', second.error) };
  return { status: 'ready', verification: second.data };
}

let inFlight: Promise<void> | null = null;
/** Muda a cada `reset`: uma leitura que começou antes do reset não escreve por cima do estado novo. */
let generation = 0;

function run(work: () => Promise<void>): Promise<void> {
  if (inFlight) return inFlight;
  const promise = work().finally(() => {
    if (inFlight === promise) inFlight = null;
  });
  inFlight = promise;
  return promise;
}

async function load(): Promise<void> {
  const started = generation;
  // "Ainda não aberto" também é resposta: reler não volta ao esqueleto (senão o cartão pisca a cada volta à Home).
  const current = useOnboardingStore.getState().view.status;
  const hasData = current === 'ready' || current === 'not_started';
  useOnboardingStore.setState(hasData ? { refreshing: true } : { view: { status: 'loading' }, refreshing: false });
  const next = await readView();
  if (started !== generation) return;
  // Releitura que falhou com dado na tela: fica o último estado bom.
  if (hasData && next.status === 'error') {
    useOnboardingStore.setState({ refreshing: false });
    return;
  }
  useOnboardingStore.setState({ view: next, refreshing: false });
}

/** Lê de novo (ao voltar a uma tela, depois de enviar algo, "Tentar de novo"). */
export function refreshOnboarding(): Promise<void> {
  return run(load);
}

/**
 * Garante que há uma leitura. Em desenvolvimento, um `?devCenario=` novo recomeça o cadastro simulado e o leva ao
 * estado pedido antes de ler (ver `devScenarios.ts`); `carregando` segura a tela em "carregando" de propósito.
 */
export function ensureOnboardingLoaded(scenario?: DevScenario): Promise<void> {
  const state = useOnboardingStore.getState();
  if (__DEV__ && scenario !== undefined && scenario !== state.appliedScenario) {
    generation += 1;
    inFlight = null;
    useOnboardingStore.setState({ appliedScenario: scenario, view: { status: 'loading' }, refreshing: false });
    if (scenario === 'carregando') {
      resetOnboardingClient();
      const never = new Promise<void>(() => undefined);
      inFlight = never;
      return never;
    }
    const started = generation;
    return run(async () => {
      try {
        await applyDevScenario(scenario);
      } catch (error) {
        console.warn('[cadastro] cenário de desenvolvimento falhou', error instanceof Error ? error.message : error);
      }
      if (started !== generation) return;
      await load();
    });
  }
  if (state.view.status === 'idle') return run(load);
  return inFlight ?? Promise.resolve();
}

/** Ao sair da conta: outra conta no mesmo aparelho começa do zero. */
export function resetOnboarding(): void {
  generation += 1;
  inFlight = null;
  resetOnboardingClient();
  useOnboardingStore.setState({ view: { status: 'idle' }, refreshing: false, appliedScenario: undefined });
}

registerOnboardingDevHook(refreshOnboarding);
