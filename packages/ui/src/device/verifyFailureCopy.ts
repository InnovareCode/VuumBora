/**
 * Texto NOSSO para cada motivo pelo qual um texto baixado não pôde ser exibido (`VerifyFailureReason`). PURO e idêntico
 * para os dois apps (o texto legal é o mesmo problema nos dois), por isso mora aqui e não duplicado nas telas.
 *
 * Regras de copy: sem jargão ("SHA", "hash", "origem"), sem culpar a pessoa, sempre dizer o que fazer, e nenhuma palavra
 * "cadastro" (o motorista distingue CONTA de CADASTRO DE MOTORISTA — plano de execução, princípio 5). `retryable`: tentar
 * de novo pode resolver (rede, servidor, conteúdo trocado no meio do caminho); nos demais casos repetir dá o mesmo.
 */
import type { VerifyFailureReason } from './verifiedText';

export interface VerifyFailureView {
  readonly title: string;
  readonly message: string;
  readonly retryable: boolean;
}

const SUPPORT_IF_PERSISTS = 'Se continuar, fale com o suporte.';
const SUPPORT_NOW = 'Fale com o suporte.';

export const VERIFY_FAILURE_COPY: Record<VerifyFailureReason, VerifyFailureView> = {
  hash_mismatch: {
    title: 'Não foi possível confirmar o texto',
    message: `O texto que chegou não é o da versão publicada, por isso não vamos exibi-lo. Tente de novo em alguns minutos. ${SUPPORT_IF_PERSISTS}`,
    retryable: true,
  },
  network: {
    title: 'Não foi possível baixar o texto',
    message: 'Confira sua conexão e tente de novo.',
    retryable: true,
  },
  timeout: {
    title: 'O texto demorou demais para chegar',
    message: 'Confira sua conexão e tente de novo.',
    retryable: true,
  },
  http_status: {
    title: 'O texto não está disponível agora',
    message: `O servidor não entregou o texto. Tente de novo em alguns minutos. ${SUPPORT_IF_PERSISTS}`,
    retryable: true,
  },
  redirected: {
    title: 'O texto veio de um endereço não aceito',
    message: `Por segurança, o aplicativo não exibe textos de endereços que não são os da versão publicada. ${SUPPORT_NOW}`,
    retryable: false,
  },
  insecure_url: {
    title: 'O endereço do texto não é seguro',
    message: `Por segurança, o aplicativo só abre textos por conexão protegida. ${SUPPORT_NOW}`,
    retryable: false,
  },
  bad_url: {
    title: 'O endereço do texto não é válido',
    message: `Não foi possível abrir o texto desta versão. ${SUPPORT_NOW}`,
    retryable: false,
  },
  bad_expected_hash: {
    title: 'Não foi possível confirmar o texto',
    message: `Os dados desta versão chegaram incompletos, por isso não vamos exibir o texto. ${SUPPORT_NOW}`,
    retryable: false,
  },
  too_large: {
    title: 'O texto não pôde ser exibido',
    message: `O arquivo é maior do que o aplicativo consegue mostrar. ${SUPPORT_NOW}`,
    retryable: false,
  },
  invalid_text: {
    title: 'O texto não pôde ser exibido',
    message: `O arquivo está num formato que o aplicativo não consegue mostrar. ${SUPPORT_NOW}`,
    retryable: false,
  },
  hash_unavailable: {
    title: 'Não foi possível confirmar o texto aqui',
    message: 'Este ambiente não consegue conferir o texto, por isso não vamos exibi-lo. Abra o aplicativo em um aparelho ou por uma conexão segura.',
    retryable: false,
  },
};

export function describeVerifyFailure(reason: VerifyFailureReason): VerifyFailureView {
  return VERIFY_FAILURE_COPY[reason];
}
