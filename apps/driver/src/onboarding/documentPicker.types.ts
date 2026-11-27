import type { DocumentContentType } from '@vuumbora/domain/driver';

/** De onde vem o arquivo do documento (ficha M03: "Tirar foto" é o CTA, "Escolher arquivo" o secundário). */
export type PickSource = 'camera' | 'file';

/** O arquivo pronto para pedir a URL de envio: tipo, tamanho e SHA-256 já conferidos no aparelho. */
export interface PickedDocument {
  /** `blob:` no navegador; `file://`/`content://` no aparelho (quando houver o módulo nativo). */
  readonly uri: string;
  readonly name: string;
  readonly contentType: DocumentContentType;
  readonly sizeBytes: number;
  /** SHA-256 em hexadecimal minúsculo (o servidor confere no `submit`). */
  readonly sha256: string;
}

/**
 * - `cancelled`: a pessoa fechou o seletor sem escolher (não é erro: a tela não diz nada).
 * - `permission_denied`: câmera negada (a tela oferece "Escolher arquivo").
 * - `unavailable`: este aparelho/versão ainda não tem como escolher arquivo (módulo nativo não instalado).
 * - `unsupported_type`, `too_large`, `empty`: o arquivo não serve (conferido ANTES de pedir a URL).
 * - `read_failed`: não deu para ler o arquivo para calcular o hash.
 */
export type PickFailure = 'cancelled' | 'permission_denied' | 'unavailable' | 'unsupported_type' | 'too_large' | 'empty' | 'read_failed';

export type PickResult = { readonly ok: true; readonly file: PickedDocument } | { readonly ok: false; readonly reason: PickFailure };

export interface DocumentPickerSupport {
  readonly camera: boolean;
  readonly file: boolean;
}

/** Texto de cada falha de escolha (a tela mostra no próprio cartão do arquivo). `cancelled` não tem texto. */
export const PICK_FAILURE_MESSAGE: Record<Exclude<PickFailure, 'cancelled'>, string> = {
  permission_denied: 'Para fotografar o documento, permita o uso da câmera. Você também pode escolher um arquivo.',
  unavailable: 'Enviar documento por este aparelho ainda não está disponível nesta versão do aplicativo.',
  unsupported_type: 'Este tipo de arquivo não é aceito. Envie uma foto (JPG ou PNG) ou um PDF.',
  too_large: 'O arquivo passa de 10 MB. Escolha um arquivo menor.',
  empty: 'O arquivo está vazio. Escolha outro.',
  read_failed: 'Não conseguimos ler este arquivo. Escolha outro.',
};
