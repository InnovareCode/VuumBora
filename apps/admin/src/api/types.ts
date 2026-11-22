/**
 * Contrato fixo combinado com Vega para esta entrega (ver briefing da tarefa).
 * Campos exatos da candidatura — etapa 1 de 2. Documento, veículo e endereço
 * são a etapa 2 e NÃO existem ainda: não adicionamos campo nem placeholder
 * para eles aqui.
 */

export type DriverApplicationStatus = 'pending' | 'approved' | 'rejected';

export interface DriverApplication {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly phone: string;
  readonly city: string;
  readonly state: string;
  readonly alreadyDrivesForApp: boolean | null;
  readonly hasOwnVehicle: boolean | null;
  readonly status: DriverApplicationStatus;
  readonly source: string;
  readonly createdAt: string;
  /** `null` enquanto `status === 'pending'` — nenhuma decisão ainda. */
  readonly decidedAt: string | null;
  readonly decidedBy: { readonly id: string; readonly name: string } | null;
  /** Só preenchido em recusa; `null` em aprovação ou candidatura pendente. */
  readonly decisionReason: string | null;
}

/** Resposta de `POST .../approve` e `POST .../reject` (contrato fixo desta entrega). */
export interface DriverApplicationDecision {
  readonly id: string;
  readonly status: DriverApplicationStatus;
  readonly decidedAt: string;
  readonly decidedBy: { readonly id: string; readonly name: string };
  readonly decisionReason?: string;
}

export interface DriverApplicationSummary {
  readonly pending: number;
  readonly approved: number;
  readonly rejected: number;
}

export interface DriverApplicationListParams {
  readonly status?: DriverApplicationStatus | undefined;
  readonly q?: string | undefined;
  readonly cursor?: string | undefined;
  readonly limit?: number | undefined;
}

export interface DriverApplicationListResult {
  readonly items: readonly DriverApplication[];
  readonly nextCursor: string | null;
}

/**
 * Mesmo vocabulário de `AdminRole` em `apps/api/src/domain/admin.ts` — espelho
 * manual (o admin é SPA separado, não importa código da API). Se a API
 * acrescentar/renomear um papel, este union muda junto.
 */
export const ADMIN_ROLES = ['dono', 'operacao', 'revisor_documentos', 'financeiro', 'suporte'] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export interface AdminUser {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly role: AdminRole;
}

export interface AdminLoginInput {
  readonly email: string;
  readonly password: string;
}

/**
 * Gestão de usuários do painel (F07, só `dono`) — contrato
 * docs/contrato-admin-usuarios.md. `AdminUserRecord` é `AdminUser` + as duas
 * datas que só a LISTA/mutação devolvem (login e `/me` não precisam delas).
 */
export interface AdminUserRecord extends AdminUser {
  readonly createdAt: string;
  /** `null` = conta ativa. */
  readonly deactivatedAt: string | null;
}

export interface AdminUserListParams {
  readonly role?: AdminRole | undefined;
  /** `false` (padrão do servidor) = só contas ativas. */
  readonly includeDeactivated?: boolean | undefined;
  readonly cursor?: string | undefined;
  readonly limit?: number | undefined;
}

export interface AdminUserListResult {
  readonly items: readonly AdminUserRecord[];
  readonly nextCursor: string | null;
}

/**
 * `password`: senha ATUAL de quem está chamando (reautenticação) — nunca a
 * senha do usuário alvo, que nasce sem senha nenhuma. `code`: TOTP de quem
 * chama, só exigido pelo servidor quando o papel ENVOLVIDO é `dono`/`financeiro`
 * (`roleRequiresSecondFactorGate` em `lib/permissions.ts` decide quando a tela pede o campo).
 */
export interface AdminUserCreateInput {
  readonly name: string;
  readonly email: string;
  readonly role: AdminRole;
  readonly password: string;
  readonly code?: string | undefined;
}

/** `activationToken` só vem UMA vez, nesta resposta — nunca mais recuperável pela API. */
export interface AdminUserCreateResult extends AdminUserRecord {
  readonly activationToken: string;
  readonly activationTokenExpiresAt: string;
}

export interface AdminUserStepUp {
  readonly password: string;
  readonly code?: string | undefined;
}

export interface ActivateAdminUserInput {
  readonly email: string;
  readonly token: string;
  readonly newPassword: string;
}

export interface ActivateAdminUserResult {
  readonly role: AdminRole;
  readonly requiresTwoFactorEnrollment: boolean;
  /** Vêm JUNTOS quando `requiresTwoFactorEnrollment` é `true`; ausentes quando é `false`. */
  readonly enrollmentToken?: string;
  readonly enrollmentTokenExpiresAt?: string;
}

/**
 * Segundo fator (TOTP) — contrato em docs/contrato-admin-2fa.md. Login devolve
 * um de três estados; os dois que exigem o segundo fator trazem um
 * `challengeToken` que vive SÓ em memória (estado da tela de login, nunca
 * storage) e vale 10 min, uma única vez.
 */
export interface SecondFactorChallenge {
  readonly challengeToken: string;
  /** ISO 8601 — quando o desafio deixa de valer. */
  readonly challengeExpiresAt: string;
}

export type LoginOutcome =
  | { readonly status: 'authenticated'; readonly admin: AdminUser }
  | ({ readonly status: 'second_factor_required' } & SecondFactorChallenge)
  | ({ readonly status: 'enrollment_required' } & SecondFactorChallenge);

export interface TotpEnrollment {
  /** Chave base32, para digitar à mão no app autenticador. */
  readonly secret: string;
  /** `otpauth://` — vira o QR code. */
  readonly otpauthUri: string;
}

export interface TwoFactorStatus {
  readonly enabled: boolean;
  /** Papel que não pode viver sem 2FA (dono, financeiro): esconde "desativar". */
  readonly required: boolean;
  readonly recoveryCodesRemaining: number;
}

/** Os 10 códigos de recuperação — aparecem UMA vez; nunca persistir. */
export interface RecoveryCodes {
  readonly recoveryCodes: readonly string[];
}

/**
 * Configuração de e-mail (SMTP) — docs/contrato-admin-email.md. Só o papel
 * `dono`. Por campo vale: painel > variável de ambiente > não definido; a
 * SENHA nunca volta do servidor (só `saved` e a origem).
 */
export type EmailFieldSource = 'panel' | 'env' | 'unset';

export interface EmailEffectiveField<T> {
  readonly value: T | null;
  readonly source: EmailFieldSource;
}

export interface EmailSettings {
  readonly fields: {
    readonly host: EmailEffectiveField<string>;
    readonly port: EmailEffectiveField<number>;
    readonly user: EmailEffectiveField<string>;
    readonly from: EmailEffectiveField<string>;
    readonly password: { readonly saved: boolean; readonly source: EmailFieldSource };
  };
  /** O que está GRAVADO no painel (pré-preenche o formulário); `null` = em branco, cai no ambiente. */
  readonly panel: {
    readonly host: string | null;
    readonly port: number | null;
    readonly user: string | null;
    readonly from: string | null;
    readonly passwordSaved: boolean;
  };
  readonly configured: boolean;
  /** `host` | `port` | `from` | `password` — o que falta quando `configured` é false. */
  readonly missing: readonly string[];
  /** `null` quando não configurado. */
  readonly summary: string | null;
  readonly updatedAt: string | null;
  /** `false` = servidor sem chave de cifra: o campo de senha não pode ser usado (salvar senha dá 503). */
  readonly canStorePassword: boolean;
}

/**
 * Reautenticação exigida por salvar a configuração de e-mail e por "remover a
 * senha salva" (revisão S1 rodada 2, I-2): a senha ATUAL do dono logado + o
 * TOTP de 6 dígitos dele. Código de recuperação NÃO vale aqui (contrato). O
 * nome é `stepUp` porque `password`, no corpo de salvar, é a senha do servidor
 * SMTP. Vive só no estado do diálogo que a pede — nunca em storage, URL ou log.
 */
export interface StepUp {
  readonly password: string;
  readonly code: string;
}

/**
 * Estado inteiro do formulário. `null` = em branco. `password` ausente = mantém a salva.
 * Servidor, porta, usuário e senha são UMA unidade de origem: sem `host`, os outros três
 * têm de ir em branco (o servidor recusa a mistura com 400).
 */
export interface EmailSettingsInput {
  readonly host: string | null;
  readonly port: number | null;
  readonly user: string | null;
  readonly from: string | null;
  readonly password?: string;
}

export interface EmailTestResult {
  readonly delivered: true;
  readonly to: string;
}
