/**
 * Porta de escolha do arquivo do documento — versão NATIVA (iOS/Android). O navegador usa `documentPicker.web.ts`
 * (o Metro escolhe pela extensão da plataforma; o TypeScript confere as duas contra os mesmos tipos).
 *
 * Ainda SEM implementação: a câmera e a seleção de arquivo no aparelho precisam de módulo nativo (ex.:
 * `expo-image-picker` e `expo-document-picker`, mais a leitura dos bytes para o SHA-256), e instalar módulo nativo é
 * decisão do Atlas (regra "módulo nativo entra atrás de porta com versão web"). Até lá a tela mostra o motivo
 * (`unavailable`) em vez de um botão que não faz nada.
 */
import type { DocumentPickerSupport, PickResult, PickSource } from './documentPicker.types';

export type { DocumentPickerSupport, PickedDocument, PickFailure, PickResult, PickSource } from './documentPicker.types';
export { PICK_FAILURE_MESSAGE } from './documentPicker.types';

export const documentPickerSupport: DocumentPickerSupport = { camera: false, file: false };

export async function pickDocument(_source: PickSource): Promise<PickResult> {
  return { ok: false, reason: 'unavailable' };
}

/** Solta o arquivo escolhido (no navegador, a URL `blob:`). No aparelho não há nada a soltar ainda. */
export function releasePickedDocument(_uri: string): void {}
