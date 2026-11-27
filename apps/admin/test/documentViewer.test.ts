/**
 * `DocumentViewer` RENDERIZADO (react-dom + DOM mínimo, efeitos de verdade): a URL do documento só é
 * pedida no clique. Teste que só chama a porta não pega um `useEffect` que pede na montagem — este pega
 * (foi a mutação da Íris na reprovação da D7, que passou pelos 54 testes anteriores).
 */
import './helpers/miniDom';
import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';
import { createElement } from 'react';
import { button, buttons, click, findAll, flush, render, type Rendered } from './helpers/render';
import { fakeApi, forbidden, SECRET } from './helpers/fakeApi';
import { ApiProvider } from '../src/context/ApiContext';
import { DocumentViewer } from '../src/components/documents/DocumentViewer';
import type { DocumentReviewPort } from '../src/api';

let view: Rendered | undefined;
afterEach(async () => {
  await view?.unmount();
  view = undefined;
});

async function mountViewer(overrides: Partial<DocumentReviewPort> = {}, onForbidden: () => void = () => {}) {
  const { api, calls } = fakeApi(overrides);
  view = await render(
    createElement(ApiProvider, {
      api,
      children: createElement(DocumentViewer, { documentId: 'doc-cnh', typeLabel: 'CNH com EAR', driverName: 'Joana Teste', contentType: 'image/png', onForbidden }),
    }),
  );
  return { calls, view };
}

const images = (v: Rendered) => findAll(v.container, (el) => el.tagName === 'IMG');

describe('URL do documento só no clique', () => {
  test('montar não pede URL (nem depois de esperar)', async () => {
    const { calls } = await mountViewer();
    await new Promise((resolve) => setTimeout(resolve, 50));
    await flush();
    assert.equal(calls.viewUrl, 0);
    assert.equal(images(view!).length, 0);
    assert.equal(view!.container.textContent.includes(SECRET), false);
  });

  test('1 clique = 1 pedido; a imagem aparece; fechar tira a URL e não pede de novo', async () => {
    const { calls } = await mountViewer();
    await click(button(view!.container, 'Ver documento'));
    assert.equal(calls.viewUrl, 1);
    const [img] = images(view!);
    assert.ok(img, 'imagem renderizada');
    assert.equal(img.getAttribute('src')?.includes(SECRET), true);
    assert.equal(img.getAttribute('referrerpolicy'), 'no-referrer');
    await click(button(view!.container, 'Fechar visualização'));
    assert.equal(images(view!).length, 0);
    assert.equal(calls.viewUrl, 1);
  });

  test('403 vai para onForbidden (a página descarta o cadastro), sem imagem e sem mensagem local', async () => {
    let forbiddenCalls = 0;
    await mountViewer({ viewUrl: async () => forbidden() }, () => (forbiddenCalls += 1));
    await click(button(view!.container, 'Ver documento'));
    assert.equal(forbiddenCalls, 1);
    assert.equal(images(view!).length, 0);
    assert.equal(buttons(view!.container, 'Ver documento').length, 1, 'volta ao estado inicial');
  });
});
