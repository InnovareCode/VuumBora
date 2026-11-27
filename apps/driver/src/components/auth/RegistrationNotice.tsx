import { memo } from 'react';
import { InlineAlert } from '@vuumbora/ui';
import { REGISTRATION_FACT } from './registrationFact';

/**
 * O aviso "conta não é cadastro de motorista" na criação da conta (plano de execução, princípio 5; candidatura x
 * cadastro). O fato mora em `registrationFact.ts`; esta peça só o embrulha no contexto da tela.
 *
 * A Home deixou de usar este aviso fixo (fatia D6, Q5): ela mostra o estado REAL do cadastro vindo do servidor
 * (`summarizeVerification`), e o fato só aparece lá no estado `not_started`.
 */
export type RegistrationNoticeContext = 'create_account';

const COPY: Record<RegistrationNoticeContext, { readonly title: string; readonly message: string }> = {
  create_account: {
    title: 'A conta não é o cadastro de motorista',
    message: `Com a conta você entra no aplicativo. ${REGISTRATION_FACT}`,
  },
};

export interface RegistrationNoticeProps {
  readonly context: RegistrationNoticeContext;
  readonly testID?: string;
}

export const RegistrationNotice = memo(function RegistrationNotice({ context, testID }: RegistrationNoticeProps) {
  const copy = COPY[context];
  // `announce={false}`: é contexto fixo da tela, não resposta a uma ação — o leitor de tela o lê na ordem normal em vez de
  // interromper cada vez que a criação da conta abre.
  return <InlineAlert tone="info" title={copy.title} message={copy.message} testID={testID} announce={false} />;
});
