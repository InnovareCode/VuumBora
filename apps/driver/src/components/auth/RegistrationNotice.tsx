import { memo } from 'react';
import { InlineAlert } from '@vuumbora/ui';

/**
 * O aviso "conta não é cadastro de motorista" (plano de execução, princípio 5; candidatura x cadastro). UM fato, UM
 * bloco: a frase mora aqui e as telas só escolhem o contexto em volta dela. Não promete nada além do que já é público:
 * o cadastro de motorista é outra etapa e só abre depois que as regras de taxa e repasse forem publicadas. Sem data,
 * sem percentual, sem "você será avisado".
 *
 * REVISAR (M03/M04): quando o cadastro de motorista existir, o texto da Home vira o estado real da análise (vindo do
 * servidor) e deixa de ser este aviso fixo.
 */
const FACT = 'O cadastro de motorista é outra etapa e só abre depois que as regras de taxa e repasse forem publicadas.';

export type RegistrationNoticeContext = 'create_account' | 'home';

const COPY: Record<RegistrationNoticeContext, { readonly title: string; readonly message: string }> = {
  create_account: {
    title: 'A conta não é o cadastro de motorista',
    message: `Com a conta você entra no aplicativo. ${FACT}`,
  },
  home: {
    title: 'Você entrou com uma conta de motorista',
    message: `${FACT} Os dados desta tela são de demonstração.`,
  },
};

export interface RegistrationNoticeProps {
  readonly context: RegistrationNoticeContext;
  readonly testID?: string;
}

export const RegistrationNotice = memo(function RegistrationNotice({ context, testID }: RegistrationNoticeProps) {
  const copy = COPY[context];
  // `announce={false}`: é contexto fixo da tela, não resposta a uma ação — o leitor de tela o lê na ordem normal em vez de
  // interromper cada vez que a criação da conta ou a Home abre.
  return <InlineAlert tone="info" title={copy.title} message={copy.message} testID={testID} announce={false} />;
});
