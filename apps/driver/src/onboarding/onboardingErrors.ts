/**
 * Texto e ação de cada erro do cadastro de motorista (catálogo `DRIVER_ONBOARDING_ERRORS`, K0). A tela ramifica pelo
 * `error.kind` (estável, sai do status HTTP) e escolhe texto e ação pelo `error.code` / `reason` — NUNCA pela
 * `message` do servidor (`packages/api-client/README.md`, seção do M3).
 *
 * Cada operação tem a sua leitura do mesmo código: `invalid_body` no formulário é "confira os campos"; no envio de
 * arquivo é "não conseguimos ler este arquivo".
 *
 * Copy do motorista: "conta" nunca vira "cadastro"; "cadastro" é só o cadastro de motorista (esta etapa).
 */
import type { ApiError } from '@vuumbora/api-client';

export type OnboardingOperation = 'load' | 'profile' | 'vehicle' | 'upload_url' | 'upload' | 'submit';

/**
 * - `retry`: repetir a mesma operação.
 * - `restart_upload`: recomeçar o envio do MESMO arquivo do zero (URL nova).
 * - `pick_again`: escolher outro arquivo.
 * - `refresh`: reler a verificação (o estado mudou do lado do servidor).
 * - `go_home`: voltar ao painel.
 * - `go_vehicle`: informar o veículo antes (documento de veículo sem veículo ativo).
 * - `support`: só o suporte resolve (CPF/CNH travados, candidatura de outra conta).
 * - `sign_in`: a sessão acabou (ou a conta não é de motorista).
 * - `none`: só informar (ou o erro é de um campo).
 */
export type OnboardingErrorAction =
  | 'retry'
  | 'restart_upload'
  | 'pick_again'
  | 'refresh'
  | 'go_home'
  | 'go_vehicle'
  | 'support'
  | 'sign_in'
  | 'none';

export interface OnboardingErrorView {
  /** `code` do servidor, ou o `kind` quando não há `code` (rede). Estável: vai para `testID` e roteiro de prova. */
  readonly key: string;
  readonly message: string;
  /** Campo do contrato a destacar (`cpf`, `cnh.ear`, `year`, `plate`). Ausente = aviso da tela. */
  readonly field?: string;
  readonly action: OnboardingErrorAction;
  readonly actionLabel?: string;
}

const ACTION_LABEL: Record<Exclude<OnboardingErrorAction, 'none'>, string> = {
  retry: 'Tentar de novo',
  restart_upload: 'Enviar de novo',
  pick_again: 'Escolher outro arquivo',
  refresh: 'Ver o estado atual',
  go_home: 'Voltar ao painel',
  go_vehicle: 'Informar o veículo',
  support: 'Falar com o suporte',
  sign_in: 'Entrar de novo',
};

function view(key: string, message: string, action: OnboardingErrorAction, field?: string): OnboardingErrorView {
  return {
    key,
    message,
    action,
    ...(action !== 'none' ? { actionLabel: ACTION_LABEL[action] } : {}),
    ...(field !== undefined ? { field } : {}),
  };
}

function conflictView(operation: OnboardingOperation, reason: string): OnboardingErrorView {
  switch (reason) {
    case 'application_not_approved':
      return view(reason, 'Não encontramos uma candidatura aprovada com o e-mail desta conta.', 'go_home');
    case 'application_already_linked':
      return view(reason, 'A candidatura aprovada com este e-mail já está ligada a outra conta de motorista. Fale com o suporte para resolver.', 'support');
    case 'cpf_locked':
      return view(reason, 'O CPF não muda depois de informado. Se ele está errado, fale com o suporte.', 'support');
    case 'cnh_locked':
      return view(reason, 'Os dados da CNH estão em análise ou já foram aprovados e não mudam por aqui. Para corrigir, fale com o suporte.', 'support');
    case 'cpf_in_use':
      return view(reason, 'Este CPF já está em outro cadastro de motorista. Fale com o suporte.', 'support');
    case 'vehicle_not_registered':
      return view(reason, 'Informe o veículo antes de enviar este documento.', 'go_vehicle');
    case 'email_not_verified':
      return view(reason, 'Confirme o e-mail desta conta antes de continuar.', 'go_home');
    case 'driver_not_linked':
      return view(reason, 'Esta conta ainda não está ligada a uma candidatura aprovada.', 'go_home');
    case 'plate_in_use':
      return view(reason, 'Esta placa já está em uso em outra conta de motorista. Confira a placa.', 'none', 'plate');
    case 'upload_missing':
      return view(reason, 'O arquivo não chegou completo. Envie de novo.', 'restart_upload');
    case 'document_under_review':
      return view(reason, 'Este documento já está em análise. Não é preciso enviar de novo.', 'refresh');
    case 'invalid_transition':
      return view(reason, 'Este documento já foi analisado. Confira o estado atual.', 'refresh');
    default:
      return view(reason, 'Não foi possível concluir agora. Tente de novo.', operation === 'load' ? 'retry' : 'refresh');
  }
}

function validationView(operation: OnboardingOperation, code: string | undefined): OnboardingErrorView {
  switch (code) {
    case 'invalid_cpf':
      return view(code, 'CPF inválido. Confira os 11 números.', 'none', 'cpf');
    case 'cnh_without_ear':
      return view(code, 'A CNH precisa ter a observação EAR (exerce atividade remunerada) para dirigir pelo aplicativo.', 'none', 'cnh.ear');
    case 'vehicle_too_old':
      return view(code, 'O veículo passa da idade máxima aceita.', 'none', 'year');
    case 'file_too_large':
      return view(code, 'O arquivo passa de 10 MB. Escolha um arquivo menor.', 'pick_again');
    case 'unknown_document_type':
      return view(code, 'Este documento não está mais na lista pedida. Confira a lista atualizada.', 'refresh');
    default:
      // `invalid_body` (ou um código de validação que o app não conhece): o que o servidor recusou é a forma do pedido.
      if (operation === 'upload_url' || operation === 'upload') {
        return view(code ?? 'invalid_body', 'Não conseguimos ler este arquivo. Escolha outro.', 'pick_again');
      }
      return view(code ?? 'invalid_body', 'Alguns dados não foram aceitos. Confira os campos e tente de novo.', 'none');
  }
}

export function describeOnboardingError(operation: OnboardingOperation, error: ApiError): OnboardingErrorView {
  switch (error.kind) {
    case 'network':
      return view('network', 'Sem conexão com a internet. Confira e tente de novo.', operation === 'upload' ? 'restart_upload' : 'retry');
    case 'unavailable':
      return view(error.code ?? 'unavailable', 'O cadastro está fora do ar agora. Tente de novo em alguns minutos.', 'retry');
    case 'rate_limited':
      return view(error.code ?? 'rate_limited', 'Muitas tentativas seguidas. Aguarde um pouco e tente de novo.', 'retry');
    case 'unauthorized':
      return view(error.code ?? 'unauthorized', 'Sua sessão expirou. Entre de novo para continuar.', 'sign_in');
    case 'forbidden':
      if (error.code === 'upload_url_expired') {
        return view(error.code, 'O tempo para enviar este arquivo acabou. Envie de novo.', 'restart_upload');
      }
      if (error.code === 'not_driver_account') {
        return view(error.code, 'Esta conta não é de motorista. Entre com a sua conta de motorista.', 'sign_in');
      }
      return view(error.code ?? 'forbidden', 'Esta conta não tem acesso a esta etapa do cadastro.', 'go_home');
    case 'not_found':
      if (operation === 'submit') return view(error.code ?? 'not_found', 'Não encontramos este envio. Envie o arquivo de novo.', 'restart_upload');
      return view(error.code ?? 'not_found', 'Não encontramos este documento. Confira a lista atualizada.', 'refresh');
    case 'conflict':
      return conflictView(operation, error.code ?? error.reason);
    case 'validation':
      return validationView(operation, error.code);
    case 'unknown':
      return view(error.code ?? 'unknown', 'Não foi possível concluir agora. Tente de novo.', 'retry');
  }
}
