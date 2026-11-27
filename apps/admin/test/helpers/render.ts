import { installMiniDom, MiniElement, MiniEvent, MiniNode } from './miniDom';
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const doc = installMiniDom();

/** Deixa promessas, `setTimeout(0)` e efeitos do React assentarem (o mock/fake responde em microtarefas). */
export async function flush(rounds = 6): Promise<void> {
  for (let i = 0; i < rounds; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

export interface Rendered {
  readonly container: MiniElement;
  readonly text: () => string;
  readonly unmount: () => Promise<void>;
}

export async function render(element: ReactElement): Promise<Rendered> {
  const container = doc.body.appendChild(doc.createElement('div'));
  let root: Root | undefined;
  await act(async () => {
    root = createRoot(container as unknown as Element);
    root.render(element);
  });
  await flush();
  return {
    container,
    text: () => container.textContent,
    unmount: async () => {
      await act(async () => root?.unmount());
      doc.body.removeChild(container);
    },
  };
}

function* walk(node: MiniNode): Generator<MiniElement> {
  for (const child of node.childNodes) {
    if (child instanceof MiniElement) {
      yield child;
      yield* walk(child);
    }
  }
}

export function findAll(root: MiniNode, predicate: (el: MiniElement) => boolean): MiniElement[] {
  return [...walk(root)].filter(predicate);
}

/** Botão cujo texto (sem espaços nas pontas) casa — `string` = começa com. */
export function buttons(root: MiniNode, name: string | RegExp): MiniElement[] {
  return findAll(root, (el) => el.tagName === 'BUTTON' && (typeof name === 'string' ? el.textContent.trim().startsWith(name) : name.test(el.textContent.trim())));
}

export function button(root: MiniNode, name: string | RegExp): MiniElement {
  const [first] = buttons(root, name);
  if (!first) throw new Error(`botão não encontrado: ${String(name)}`);
  return first;
}

export async function click(el: MiniElement): Promise<void> {
  await act(async () => {
    el.dispatchEvent(new MiniEvent('click', { bubbles: true, cancelable: true }));
  });
  await flush();
}

/** Digita num `<input>`/`<textarea>` controlado: troca o valor e dispara `input` (o onChange do React escuta esse). */
export async function type(el: MiniElement, value: string): Promise<void> {
  await act(async () => {
    (el as unknown as { value: string }).value = value;
    el.dispatchEvent(new MiniEvent('input', { bubbles: true }));
  });
  await flush();
}
