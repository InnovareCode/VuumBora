/**
 * Estado que VIAJA entre as telas de conta enquanto o fluxo dura: para quem o código foi enviado e quando o reenvio
 * volta a valer. Fica em memória (nunca em disco, nunca na URL) por três motivos:
 *  - o e-mail é dado pessoal e a URL do web fica no histórico do navegador;
 *  - a SENHA nunca entra aqui — o contrato exige que a tela do código a peça de novo;
 *  - sair da tela e voltar não pode zerar o relógio do reenvio (`nextResendAt` é um instante, não "60").
 * É global porque cadastro → código e esqueci → redefinir são telas diferentes, mas só isso: o que é de uma tela só
 * (campos, erro, carregando) fica no estado local dela.
 */
import { create } from 'zustand';

/** Por que a pessoa está na tela do código: o texto de abertura muda. */
export type VerificationOrigin = 'register' | 'login';

/** Aviso a mostrar na tela de login depois de um passo concluído (ele some ao ser lido, ou no próximo login). */
export type LoginNotice = 'email_confirmed' | 'password_changed';

export interface PendingVerification {
  /** E-mail (ou ID público) da conta que está confirmando. */
  readonly identifier: string;
  readonly origin: VerificationOrigin;
  /** `false` = a conta existe mas o e-mail não saiu: o reenvio já fica liberado e a tela avisa. */
  readonly emailSent: boolean;
  readonly nextResendAt: number;
}

export interface PendingReset {
  readonly email: string;
  readonly nextResendAt: number;
}

interface AuthFlowState {
  readonly verification: PendingVerification | null;
  readonly reset: PendingReset | null;
  /** E-mail/ID a pré-preencher no login depois de confirmar o e-mail ou trocar a senha. */
  readonly loginHint: string | null;
  readonly loginNotice: LoginNotice | null;

  startVerification(input: { identifier: string; origin: VerificationOrigin; emailSent: boolean; resendAfterSeconds: number }): void;
  markVerificationResent(resendAfterSeconds: number): void;
  startReset(input: { email: string; resendAfterSeconds: number }): void;
  markResetResent(resendAfterSeconds: number): void;
  /** Conclui um passo e leva a pessoa ao login com o aviso certo. */
  finishToLogin(hint: string, notice: LoginNotice): void;
  /** Só pré-preenche o login (sem aviso): "Entrar na minha conta" depois de `email_taken` no cadastro. */
  prefillLogin(hint: string): void;
  consumeLoginNotice(): void;
  /** Login concluído (ou conta trocada): nada do fluxo anterior pode vazar para o próximo. */
  clearAll(): void;
}

const EMPTY = { verification: null, reset: null, loginHint: null, loginNotice: null } as const;

export const useAuthFlowStore = create<AuthFlowState>((set) => ({
  ...EMPTY,

  startVerification: ({ identifier, origin, emailSent, resendAfterSeconds }) =>
    set({
      verification: {
        identifier,
        origin,
        emailSent,
        // E-mail que não saiu: reenviar já vale. Saiu: respeita a espera que o servidor informou.
        nextResendAt: emailSent ? Date.now() + resendAfterSeconds * 1000 : Date.now(),
      },
    }),

  markVerificationResent: (resendAfterSeconds) =>
    set((state) =>
      state.verification
        ? { verification: { ...state.verification, emailSent: true, nextResendAt: Date.now() + resendAfterSeconds * 1000 } }
        : state,
    ),

  startReset: ({ email, resendAfterSeconds }) =>
    set({ reset: { email, nextResendAt: Date.now() + resendAfterSeconds * 1000 } }),

  markResetResent: (resendAfterSeconds) =>
    set((state) => (state.reset ? { reset: { ...state.reset, nextResendAt: Date.now() + resendAfterSeconds * 1000 } } : state)),

  finishToLogin: (hint, notice) => set({ verification: null, reset: null, loginHint: hint, loginNotice: notice }),

  prefillLogin: (hint) => set({ loginHint: hint }),

  consumeLoginNotice: () => set({ loginNotice: null }),

  clearAll: () => set({ ...EMPTY }),
}));
