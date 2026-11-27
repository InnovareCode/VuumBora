/**
 * Regras de APRESENTAÇÃO do cadastro de motorista (M02 etapa 2, M03, M04), puras e sem React: o que cada estado da
 * verificação (`GET /v1/driver/verification`) vira na tela. A regra de negócio (estado derivado, vencimento, "pode
 * ficar online") é do servidor e do `@vuumbora/domain/driver`; aqui só se decide texto, ordem e destino.
 *
 * Nada aqui conhece nomes de documento: a lista vem do contrato (N1, "a lista é dado"). Os textos de recusa também
 * (N2, catálogo fechado `rejection.text`) — o app mostra o que veio, sem reescrever.
 */
import type { DriverVerification } from '@vuumbora/api-client/driver';
import { goOnlineBlocker, isDocumentExpired, natalCalendarDate } from '@vuumbora/domain/driver';
import { REGISTRATION_FACT } from '../components/auth/registrationFact';
import type { OnboardingErrorView } from './onboardingErrors';

/** Por que a conta não tem cadastro: o build não tem o cadastro (`closed`) ou o vínculo N3 recusou. */
export type NotStartedReason = 'closed' | 'application_not_approved' | 'email_not_verified' | 'application_already_linked' | 'unknown';

export type DocumentItemState = 'todo' | 'submitted' | 'approved' | 'rejected' | 'expired';

export type ChecklistItem =
  | { readonly kind: 'profile'; readonly key: 'dados'; readonly label: string; readonly required: true; readonly state: 'todo' | 'done' }
  | { readonly kind: 'vehicle'; readonly key: 'veiculo'; readonly label: string; readonly required: true; readonly state: 'todo' | 'done' }
  | {
      readonly kind: 'document';
      readonly key: string;
      readonly typeCode: string;
      readonly label: string;
      readonly required: boolean;
      readonly hasExpiry: boolean;
      readonly state: DocumentItemState;
      readonly rejectionText?: string;
      /** `AAAA-MM-DD`, último dia válido (só documento aprovado com validade). */
      readonly expiresOn?: string;
      /**
       * Só em `expired`, e só quando a validade de fato ficou para trás (`expiresOn` < hoje): a data a mostrar em
       * "Vencido em". Documento marcado vencido com validade ainda no futuro (não deveria acontecer no servidor) não
       * ganha data — mostrar "venceu em" uma data que ainda não chegou seria pior que não dizer a data.
       */
      readonly expiredOn?: string;
    };

export type DocumentChecklistItem = Extract<ChecklistItem, { kind: 'document' }>;

export const PROFILE_STEP_LABEL = 'Seus dados e CNH';
export const VEHICLE_STEP_LABEL = 'Veículo';

/** "Hoje" em Natal, o dia que decide se um documento venceu (mesma régua do servidor). */
export function todayInNatal(nowMs: number = Date.now()): string {
  return natalCalendarDate(nowMs);
}

export function buildChecklist(verification: DriverVerification, today: string = todayInNatal()): readonly ChecklistItem[] {
  const items: ChecklistItem[] = [
    { kind: 'profile', key: 'dados', label: PROFILE_STEP_LABEL, required: true, state: verification.onboarding.profileSubmitted ? 'done' : 'todo' },
    { kind: 'vehicle', key: 'veiculo', label: VEHICLE_STEP_LABEL, required: true, state: verification.onboarding.vehicleRegistered ? 'done' : 'todo' },
  ];
  for (const requirement of verification.requirements) {
    const document = requirement.document;
    let state: DocumentItemState = 'todo';
    if (document) {
      if (isDocumentExpired(document, today)) state = 'expired';
      else if (document.status === 'approved') state = 'approved';
      else if (document.status === 'rejected') state = 'rejected';
      else if (document.status === 'submitted') state = 'submitted';
    }
    items.push({
      kind: 'document',
      key: requirement.typeCode,
      typeCode: requirement.typeCode,
      label: requirement.label,
      required: requirement.required,
      hasExpiry: requirement.hasExpiry,
      state,
      ...(state === 'rejected' && document?.rejection ? { rejectionText: document.rejection.text } : {}),
      ...(document?.expiresOn !== undefined ? { expiresOn: document.expiresOn } : {}),
      ...(state === 'expired' && document?.expiresOn !== undefined && document.expiresOn < today ? { expiredOn: document.expiresOn } : {}),
    });
  }
  return items;
}

/** O que ainda depende do motorista: nunca enviado, recusado ou vencido. Enviado/aprovado já saiu da mão dele. */
export function isPending(item: ChecklistItem): boolean {
  return item.state === 'todo' || item.state === 'rejected' || item.state === 'expired';
}

/** "Faltam {pending} de {total}" — só o que é obrigatório conta. */
export function checklistProgress(items: readonly ChecklistItem[]): { readonly pending: number; readonly total: number } {
  const required = items.filter((item) => item.required);
  return { pending: required.filter(isPending).length, total: required.length };
}

/**
 * A próxima coisa a fazer, na ordem da lista (dados → veículo → documentos). Correção pedida e documento vencido
 * vêm antes de documento nunca enviado: é o que trava a análise ou o "ficar online" de quem já está andando.
 */
export function nextPendingItem(items: readonly ChecklistItem[]): ChecklistItem | undefined {
  const pending = items.filter((item) => item.required && isPending(item));
  return (
    pending.find((item) => item.kind !== 'document') ??
    pending.find((item) => item.state === 'rejected' || item.state === 'expired') ??
    pending[0]
  );
}

export function findDocument(items: readonly ChecklistItem[], typeCode: string): DocumentChecklistItem | undefined {
  return items.find((item): item is DocumentChecklistItem => item.kind === 'document' && item.typeCode === typeCode);
}

/** `AAAA-MM-DD` → `DD/MM/AAAA`. Valor fora do formato volta como veio (nunca inventa uma data). */
export function formatCalendarDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

/** Instante ISO → "29/11 às 14:30", no horário de Natal (UTC−3 fixo, mesma régua de `natalCalendarDate`). */
export function formatNatalDateTime(iso: string): string | undefined {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return undefined;
  const local = new Date(ms - 3 * 60 * 60 * 1000);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(local.getUTCDate())}/${pad(local.getUTCMonth() + 1)} às ${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}`;
}

/** Rótulo curto do estado de um item, igual ao selo do cartão (ficha M03 §7). */
export function itemStateLabel(item: ChecklistItem): string {
  switch (item.state) {
    case 'done':
      return 'Enviado';
    case 'todo':
      return item.kind === 'document' ? 'Enviar' : 'Preencher';
    case 'submitted':
      return 'Em análise';
    case 'approved':
      return 'Aprovado';
    case 'rejected':
      return 'Correção pedida';
    case 'expired':
      return item.kind === 'document' && item.expiredOn !== undefined ? `Vencido em ${formatCalendarDate(item.expiredOn)}` : 'Vencido';
  }
}

export type SummaryTone = 'info' | 'warning' | 'danger' | 'success';

/** Para onde a ação do cartão leva. A tela traduz em navegação; aqui não há `router`. */
export type SummaryTarget =
  | { readonly to: 'checklist' }
  | { readonly to: 'analysis' }
  | { readonly to: 'profile' }
  | { readonly to: 'vehicle' }
  | { readonly to: 'document'; readonly typeCode: string }
  | { readonly to: 'support' }
  | { readonly to: 'retry' }
  | { readonly to: 'sign_in' }
  | { readonly to: 'home' };

export interface VerificationSummary {
  /** Chave estável do estado (testID, roteiro de prova). */
  readonly key: string;
  readonly tone: SummaryTone;
  readonly title: string;
  readonly message: string;
  readonly action?: { readonly label: string; readonly target: SummaryTarget };
}

function targetOf(item: ChecklistItem): SummaryTarget {
  if (item.kind === 'profile') return { to: 'profile' };
  if (item.kind === 'vehicle') return { to: 'vehicle' };
  return { to: 'document', typeCode: item.typeCode };
}

/**
 * O cartão do cadastro quando ele não existe para esta conta (M04 `not_started`). Sem ação: nada a fazer no app.
 * Exceção: a candidatura aprovada já é de OUTRA conta (`409 application_already_linked`, D4) — aí o cadastro existe,
 * mas só o suporte destrava; o fato "só abre depois..." não se aplica e não aparece.
 */
export function notStartedSummary(reason: NotStartedReason): VerificationSummary {
  if (reason === 'application_already_linked') {
    return {
      key: 'application_already_linked',
      tone: 'warning',
      title: 'Candidatura ligada a outra conta',
      message: 'A candidatura aprovada com este e-mail já está ligada a outra conta de motorista. Fale com o suporte para resolver.',
      action: { label: 'Falar com o suporte', target: { to: 'support' } },
    };
  }
  const detail =
    reason === 'application_not_approved'
      ? ' Ele vale para a conta com o mesmo e-mail da candidatura aprovada.'
      : reason === 'email_not_verified'
        ? ' Para começar, o e-mail desta conta precisa estar confirmado.'
        : '';
  return { key: 'not_started', tone: 'info', title: 'Cadastro de motorista ainda não aberto', message: `${REGISTRATION_FACT}${detail}` };
}

/**
 * O cartão do cadastro (M04 §2): um por estado do servidor. `approved` sem bloqueio devolve o cartão de "aprovado"
 * (a Home troca por "Ficar online"); `approved` com documento vencido é bloqueio, não aprovação.
 */
export function summarizeVerification(verification: DriverVerification, today: string = todayInNatal()): VerificationSummary {
  const items = buildChecklist(verification, today);
  switch (verification.status) {
    case 'not_started':
      return notStartedSummary('unknown');
    case 'pending_documents': {
      const { pending, total } = checklistProgress(items);
      const next = nextPendingItem(items);
      return {
        key: 'pending_documents',
        tone: 'info',
        title: `Faltam ${pending} de ${total} etapas do cadastro`,
        message: next ? `Próxima etapa: ${next.label}.` : 'Confira o que falta enviar.',
        action: { label: pending === total ? 'Começar cadastro' : 'Continuar cadastro', target: { to: 'checklist' } },
      };
    }
    case 'under_review': {
      const deadline = verification.reviewDeadline !== undefined ? formatNatalDateTime(verification.reviewDeadline) : undefined;
      return {
        key: 'under_review',
        tone: 'info',
        title: 'Cadastro em análise',
        message: deadline
          ? `Tudo foi enviado. A resposta da análise sai até ${deadline}.`
          : 'Tudo foi enviado. Agora é com a nossa equipe de análise.',
        action: { label: 'Ver análise', target: { to: 'analysis' } },
      };
    }
    case 'changes_requested': {
      const rejected = items.filter((item): item is DocumentChecklistItem => item.kind === 'document' && item.state === 'rejected');
      const first = rejected[0];
      const more = rejected.length > 1 ? ` E mais ${rejected.length - 1} ${rejected.length - 1 === 1 ? 'documento' : 'documentos'}.` : '';
      return {
        key: 'changes_requested',
        tone: 'warning',
        title: 'Precisamos de uma correção',
        message: first ? `${first.label}: ${first.rejectionText ?? 'o documento foi recusado.'}${more}` : 'Um documento foi recusado.',
        action: { label: 'Corrigir agora', target: first ? { to: 'document', typeCode: first.typeCode } : { to: 'checklist' } },
      };
    }
    case 'suspended':
      return {
        key: 'suspended',
        tone: 'danger',
        title: 'Cadastro suspenso',
        message: 'Você não pode ficar online enquanto o cadastro estiver suspenso. Fale com o suporte para entender o motivo.',
        action: { label: 'Falar com o suporte', target: { to: 'support' } },
      };
    case 'approved': {
      if (goOnlineBlocker(verification, today) === 'document_expired') {
        const expired = items.find((item): item is DocumentChecklistItem => item.kind === 'document' && item.required && item.state === 'expired');
        const when = expired?.expiredOn !== undefined ? ` venceu em ${formatCalendarDate(expired.expiredOn)}` : ' venceu';
        return {
          key: 'document_expired',
          tone: 'danger',
          title: 'Documento vencido',
          message: `${expired?.label ?? 'Um documento'}${when}. Envie o documento novo para voltar a ficar online.`,
          action: { label: 'Enviar documento novo', target: expired ? targetOf(expired) : { to: 'checklist' } },
        };
      }
      return { key: 'approved', tone: 'success', title: 'Cadastro aprovado', message: 'Você já pode ficar online pelo painel.' };
    }
  }
}

/** Estado em 1-3 palavras, para a linha do Perfil (M13) que leva à lista. */
export function shortStatusLabel(verification: DriverVerification, today: string = todayInNatal()): string {
  switch (verification.status) {
    case 'not_started':
      return 'Ainda não aberto';
    case 'pending_documents': {
      const { pending, total } = checklistProgress(buildChecklist(verification, today));
      return `Faltam ${pending} de ${total}`;
    }
    case 'under_review':
      return 'Em análise';
    case 'changes_requested':
      return 'Correção pedida';
    case 'suspended':
      return 'Suspenso';
    case 'approved':
      return canGoOnline(verification, today) ? 'Aprovado' : 'Documento vencido';
  }
}

/** O cartão quando a leitura do cadastro falhou: o texto e a ação vêm do `code` (`describeOnboardingError`). */
export function loadErrorSummary(error: OnboardingErrorView): VerificationSummary {
  const target: SummaryTarget | undefined = error.action === 'sign_in' ? { to: 'sign_in' } : error.action === 'retry' ? { to: 'retry' } : undefined;
  return {
    key: `error-${error.key}`,
    tone: 'danger',
    title: 'Não foi possível carregar seu cadastro',
    message: error.message,
    ...(target && error.actionLabel !== undefined ? { action: { label: error.actionLabel, target } } : {}),
  };
}

/** `true` só quando o motorista pode ficar online agora (aprovado e sem documento obrigatório vencido). */
export function canGoOnline(verification: DriverVerification, today: string = todayInNatal()): boolean {
  return goOnlineBlocker(verification, today) === null;
}
