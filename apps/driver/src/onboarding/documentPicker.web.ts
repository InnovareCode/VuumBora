/**
 * Porta de escolha do arquivo do documento — versão WEB (a que roda no `expo start --web`, no export de revisão e no
 * navegador do celular). Abre o seletor do próprio navegador com um `<input type="file">` criado na hora:
 * - "Escolher arquivo": aceita JPG, PNG e PDF;
 * - "Tirar foto": só imagem, com `capture="environment"` (no celular abre a câmera traseira; no computador o navegador
 *   cai no seletor de arquivo, que é o mais perto de "câmera" que ele tem).
 *
 * Confere tipo e tamanho ANTES de qualquer rede (`DOCUMENT_CONTENT_TYPES`, `DOCUMENT_MAX_SIZE_BYTES` do domínio, a
 * mesma régua do servidor) e calcula o SHA-256 que o `upload-url` pede (`expo-crypto`, que no navegador usa o
 * WebCrypto). O arquivo vira uma URL `blob:` que a tela solta (`releasePickedDocument`) ao trocar ou terminar.
 *
 * Tipos do navegador declarados à mão (mínimos): o app compila sem a `lib` DOM, e puxá-la para um arquivo a puxa
 * para o programa inteiro (mesma lição de `packages/ui/src/browserOnline.ts`).
 */
import { CryptoDigestAlgorithm, digest } from 'expo-crypto';
import { DOCUMENT_MAX_SIZE_BYTES, isDocumentContentType, type DocumentContentType } from '@vuumbora/domain/driver';
import type { DocumentPickerSupport, PickFailure, PickResult, PickSource } from './documentPicker.types';

export type { DocumentPickerSupport, PickedDocument, PickFailure, PickResult, PickSource } from './documentPicker.types';
export { PICK_FAILURE_MESSAGE } from './documentPicker.types';

interface BrowserFile {
  readonly name: string;
  readonly type: string;
  readonly size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

interface BrowserFileInput {
  type: string;
  accept: string;
  value: string;
  readonly files: { readonly length: number; item(index: number): BrowserFile | null } | null;
  readonly style: { display: string };
  setAttribute(name: string, value: string): void;
  addEventListener(type: 'change' | 'cancel', listener: () => void): void;
  click(): void;
  remove(): void;
}

interface BrowserGlobals {
  readonly document?: { createElement(tag: 'input'): BrowserFileInput; readonly body: { appendChild(node: BrowserFileInput): void } };
  readonly URL?: { createObjectURL(file: BrowserFile): string; revokeObjectURL(url: string): void };
  readonly addEventListener?: (type: 'focus', listener: () => void) => void;
  readonly removeEventListener?: (type: 'focus', listener: () => void) => void;
}

const browser = globalThis as unknown as BrowserGlobals;

export const documentPickerSupport: DocumentPickerSupport = {
  camera: browser.document !== undefined,
  file: browser.document !== undefined,
};

const ACCEPT: Record<PickSource, string> = {
  camera: 'image/jpeg,image/png',
  file: 'image/jpeg,image/png,application/pdf,.jpg,.jpeg,.png,.pdf',
};

/** O navegador às vezes não diz o tipo (`type` vazio): a extensão decide, e só entre os três aceitos. */
function contentTypeOf(file: BrowserFile): DocumentContentType | undefined {
  if (isDocumentContentType(file.type)) return file.type;
  if (file.type !== '') return undefined;
  const extension = /\.([a-z0-9]+)$/i.exec(file.name)?.[1]?.toLowerCase();
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  if (extension === 'png') return 'image/png';
  if (extension === 'pdf') return 'application/pdf';
  return undefined;
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function prepare(file: BrowserFile): Promise<PickResult> {
  const contentType = contentTypeOf(file);
  if (!contentType) return { ok: false, reason: 'unsupported_type' };
  if (file.size <= 0) return { ok: false, reason: 'empty' };
  if (file.size > DOCUMENT_MAX_SIZE_BYTES) return { ok: false, reason: 'too_large' };
  try {
    const sha256 = toHex(await digest(CryptoDigestAlgorithm.SHA256, new Uint8Array(await file.arrayBuffer())));
    const uri = browser.URL?.createObjectURL(file);
    if (!uri) return { ok: false, reason: 'read_failed' };
    return { ok: true, file: { uri, name: file.name, contentType, sizeBytes: file.size, sha256 } };
  } catch {
    return { ok: false, reason: 'read_failed' };
  }
}

/** Gancho de prova (só `__DEV__`): a PRÓXIMA escolha falha com este motivo, sem abrir o seletor (ex.: câmera negada). */
let forcedFailure: PickFailure | undefined;
if (__DEV__) {
  (globalThis as { __vuumboraDocumentPicker?: { failNext(reason: PickFailure): void } }).__vuumboraDocumentPicker = {
    failNext(reason) {
      forcedFailure = reason;
    },
  };
}

/** Quanto esperar, depois de a janela voltar ao foco, por um `change` atrasado antes de dar o seletor por fechado. */
const CANCEL_GRACE_MS = 800;

export function pickDocument(source: PickSource): Promise<PickResult> {
  if (__DEV__ && forcedFailure !== undefined) {
    const reason = forcedFailure;
    forcedFailure = undefined;
    return Promise.resolve({ ok: false, reason });
  }
  const doc = browser.document;
  if (!doc) return Promise.resolve({ ok: false, reason: 'unavailable' });

  return new Promise<PickResult>((resolve) => {
    const input = doc.createElement('input');
    input.type = 'file';
    input.accept = ACCEPT[source];
    if (source === 'camera') input.setAttribute('capture', 'environment');
    input.style.display = 'none';
    let settled = false;
    let cancelTimer: ReturnType<typeof setTimeout> | undefined;

    const finish = (result: PickResult | Promise<PickResult>) => {
      if (settled) return;
      settled = true;
      if (cancelTimer !== undefined) clearTimeout(cancelTimer);
      browser.removeEventListener?.('focus', onWindowFocus);
      input.remove();
      resolve(result);
    };
    // Navegador sem o evento `cancel` no `<input type=file>`: a janela volta ao foco quando o seletor fecha.
    const onWindowFocus = () => {
      cancelTimer = setTimeout(() => finish({ ok: false, reason: 'cancelled' }), CANCEL_GRACE_MS);
    };

    input.addEventListener('change', () => {
      const file = input.files && input.files.length > 0 ? input.files.item(0) : null;
      finish(file ? prepare(file) : { ok: false, reason: 'cancelled' });
    });
    input.addEventListener('cancel', () => finish({ ok: false, reason: 'cancelled' }));
    browser.addEventListener?.('focus', onWindowFocus);
    doc.body.appendChild(input);
    // Ainda dentro do toque (ativação do usuário): sem isto o navegador bloqueia o seletor.
    input.click();
  });
}

/** Solta a URL `blob:` do arquivo escolhido (ao trocar de arquivo, ao terminar o envio, ao sair da tela). */
export function releasePickedDocument(uri: string): void {
  if (uri.startsWith('blob:')) browser.URL?.revokeObjectURL(uri);
}
