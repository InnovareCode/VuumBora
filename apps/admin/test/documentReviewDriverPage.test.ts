/**
 * Detalhe do motorista RENDERIZADO (react-dom + DOM mínimo + MemoryRouter + AuthProvider de verdade) contra
 * uma porta falsa: `403 forbidden` em QUALQUER chamada da área tira da tela nome, CPF, endereço, CNH e
 * veículo e deixa só o erro de permissão — reprovação da Íris na D7 (o cadastro ficava à vista até o F5).
 * Erro de rede ao atualizar continua mantendo o dado.
 */
import './helpers/miniDom';
import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';
import { createElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { button, buttons, click, findAll, render, type, type Rendered } from './helpers/render';
import { CPF_FORMATTED, DRIVER_NAME, driverDetail, fakeApi, forbidden, network, ok, STREET } from './helpers/fakeApi';
import { ApiProvider } from '../src/context/ApiContext';
import { AuthProvider } from '../src/context/AuthContext';
import { DocumentReviewDriverPage } from '../src/pages/DocumentReviewDriverPage';
import type { DocumentReviewPort } from '../src/api';

const PERMISSION = 'Seu usuário não tem permissão para ver isto.';

let view: Rendered | undefined;
afterEach(async () => {
  await view?.unmount();
  view = undefined;
});

async function openDriverPage(overrides: Partial<DocumentReviewPort> = {}) {
  const { api, calls } = fakeApi(overrides);
  const page = createElement(Routes, null, createElement(Route, { path: '/document-reviews/drivers/:driverId', element: createElement(DocumentReviewDriverPage) }));
  const router = createElement(MemoryRouter, { initialEntries: ['/document-reviews/drivers/drv-1'] }, page);
  view = await render(createElement(ApiProvider, { api, children: createElement(AuthProvider, { children: router }) }));
  const text = view.text();
  assert.ok(text.includes(DRIVER_NAME) && text.includes(CPF_FORMATTED), 'o cadastro abriu');
  return { calls, view };
}

/** Nada do cadastro na tela, só o erro de permissão, sem "Tentar de novo" e sem diálogo aberto. */
function assertDataGone(v: Rendered, when: string): void {
  const text = v.text();
  assert.equal(text.includes(DRIVER_NAME), false, `${when}: nome continua na tela`);
  assert.equal(text.includes(CPF_FORMATTED), false, `${when}: CPF continua na tela`);
  assert.equal(text.includes(STREET), false, `${when}: endereço continua na tela`);
  assert.equal(text.includes('ABC1D23'), false, `${when}: placa continua na tela`);
  // O aviso de decisão pode citar o TIPO ("CNH com EAR: aprovado."), nunca o cartão do documento.
  assert.equal(findAll(v.container, (el) => el.tagName === 'ARTICLE').length, 0, `${when}: cartão de documento continua na tela`);
  assert.ok(text.includes(PERMISSION), `${when}: falta o erro de permissão`);
  assert.equal(buttons(v.container, 'Tentar de novo').length, 0, `${when}: "Tentar de novo" num 403`);
  assert.equal(findAll(v.container, (el) => el.getAttribute('role') === 'dialog').length, 0, `${when}: diálogo ficou aberto`);
}

describe('403 com o detalhe aberto descarta o cadastro', () => {
  test('"Ver documento" com 403 (F-c)', async () => {
    const { calls } = await openDriverPage({ viewUrl: async () => forbidden() });
    await click(button(view!.container, 'Ver documento'));
    assert.equal(calls.viewUrl, 1);
    assertDataGone(view!, 'view-url 403');
  });

  test('aprovar com 403 (F-d)', async () => {
    await openDriverPage({ approve: async () => forbidden() });
    await click(button(view!.container, /^Aprovar/));
    await click(button(view!.container, 'Confirmar aprovação'));
    assertDataGone(view!, 'aprovar 403');
  });

  test('decisão aceita, recarga do detalhe com 403 (F-e)', async () => {
    let driverCalls = 0;
    const { calls } = await openDriverPage({
      driver: async () => {
        driverCalls += 1;
        return driverCalls === 1 ? ok(driverDetail()) : forbidden();
      },
    });
    await click(button(view!.container, /^Aprovar/));
    await click(button(view!.container, 'Confirmar aprovação'));
    assert.equal(calls.approve, 1);
    assert.equal(calls.driver, 2, 'recarregou depois da decisão');
    assertDataGone(view!, 'recarga 403');
    assert.equal(view!.text().includes('A decisão foi registrada'), false, 'o aviso de "não atualizou" é só para rede');
    assert.ok(view!.text().includes('CNH com EAR: aprovado.'), 'a confirmação da decisão fica (só o tipo, sem dado do motorista)');
  });

  test('recusar: catálogo de motivos com 403', async () => {
    await openDriverPage({ rejectionReasons: async () => forbidden() });
    await click(button(view!.container, /^Recusar/));
    assertDataGone(view!, 'motivos 403');
  });

  test('recusar com 403', async () => {
    await openDriverPage({ reject: async () => forbidden() });
    await click(button(view!.container, /^Recusar/));
    // `type` de <input> o React põe como PROPRIEDADE (`element.type = ...`), não como atributo.
    const [radio] = findAll(view!.container, (el) => el.tagName === 'INPUT' && (el as unknown as { type?: string }).type === 'radio');
    assert.ok(radio, 'motivo do catálogo');
    await click(radio);
    await click(button(view!.container, 'Confirmar recusa'));
    assertDataGone(view!, 'recusar 403');
  });

  test('suspender com 403', async () => {
    await openDriverPage({ suspend: async () => forbidden() });
    await click(button(view!.container, 'Suspender motorista'));
    const [textarea] = findAll(view!.container, (el) => el.tagName === 'TEXTAREA');
    assert.ok(textarea);
    await type(textarea, 'documento adulterado identificado');
    await click(button(view!.container, 'Confirmar suspensão'));
    assertDataGone(view!, 'suspender 403');
  });
});

describe('erro que NÃO é 403 mantém o cadastro', () => {
  test('recarga com falha de rede: dado fica, com o aviso de atualizar', async () => {
    let driverCalls = 0;
    await openDriverPage({
      driver: async () => {
        driverCalls += 1;
        return driverCalls === 1 ? ok(driverDetail()) : network();
      },
    });
    await click(button(view!.container, /^Aprovar/));
    await click(button(view!.container, 'Confirmar aprovação'));
    const text = view!.text();
    assert.ok(text.includes(DRIVER_NAME) && text.includes(CPF_FORMATTED));
    assert.ok(text.includes('A decisão foi registrada'));
  });

  test('"Ver documento" com falha de rede: mensagem no cartão, cadastro fica', async () => {
    await openDriverPage({ viewUrl: async () => network() });
    await click(button(view!.container, 'Ver documento'));
    const text = view!.text();
    assert.ok(text.includes(DRIVER_NAME) && text.includes(CPF_FORMATTED));
    assert.ok(text.includes('Não foi possível conectar à API'));
  });
});
