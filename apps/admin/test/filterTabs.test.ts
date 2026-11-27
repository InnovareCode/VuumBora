/**
 * Abas de filtro (A02 pré-cadastro, A08 usuários) RENDERIZADAS: o papel ARIA certo (só `aria-selected`, sem o
 * `aria-pressed` que convivia com ele), uma aba no Tab, setas movendo só o foco (ativação manual) e o clique trocando o
 * filtro. Também a saída da tela "não encontrada", que deixou de apontar fixo para o pré-cadastro.
 */
import './helpers/miniDom';
import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';
import { act, createElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { click, findAll, flush, render, type Rendered } from './helpers/render';
import { MiniEvent, type MiniElement } from './helpers/miniDom';
import { FilterTabs, filterTabId } from '../src/components/FilterTabs';
import { NotFoundPage } from '../src/pages/NotFoundPage';

let view: Rendered | undefined;
afterEach(async () => {
  await view?.unmount();
  view = undefined;
});

const OPTIONS = [
  { value: 'all', label: 'Todas', count: 8 },
  { value: 'pending', label: 'Pendentes', count: 4 },
  { value: 'approved', label: 'Aprovadas', count: null },
] as const;

async function mount(value: 'all' | 'pending' | 'approved' = 'pending') {
  const changes: string[] = [];
  view = await render(
    createElement(FilterTabs<'all' | 'pending' | 'approved'>, {
      label: 'Filtrar por status',
      options: OPTIONS,
      value,
      onChange: (next) => changes.push(next),
      idPrefix: 'f',
      panelId: 'f-panel',
    }),
  );
  const tabs = findAll(view.container, (el) => el.getAttribute('role') === 'tab');
  return { changes, tabs };
}

async function press(el: MiniElement, key: string) {
  await act(async () => {
    el.dispatchEvent(Object.assign(new MiniEvent('keydown', { bubbles: true, cancelable: true }), { key }));
  });
  await flush();
}

const active = () => (globalThis.document as unknown as { activeElement: MiniElement }).activeElement;

describe('FilterTabs', () => {
  test('papel ARIA: tablist rotulada, só aria-selected (nunca aria-pressed), aria-controls no painel', async () => {
    const { tabs } = await mount('pending');
    const [list] = findAll(view!.container, (el) => el.getAttribute('role') === 'tablist');
    assert.equal(list?.getAttribute('aria-label'), 'Filtrar por status');
    assert.equal(tabs.length, 3);
    assert.deepEqual(
      tabs.map((t) => t.getAttribute('aria-selected')),
      ['false', 'true', 'false'],
    );
    assert.equal(tabs.some((t) => t.hasAttribute('aria-pressed')), false);
    assert.ok(tabs.every((t) => t.getAttribute('aria-controls') === 'f-panel'));
    assert.equal(tabs[1]?.getAttribute('id'), filterTabId('f', 'pending'));
    assert.deepEqual(
      tabs.map((t) => t.textContent),
      ['Todas (8)', 'Pendentes (4)', 'Aprovadas'],
    );
  });

  test('uma aba só no Tab: a selecionada', async () => {
    const { tabs } = await mount('approved');
    assert.deepEqual(
      tabs.map((t) => t.getAttribute('tabindex')),
      ['-1', '-1', '0'],
    );
  });

  test('setas, Home e End movem SÓ o foco (com volta nas pontas); não trocam o filtro', async () => {
    const { tabs, changes } = await mount('pending');
    await press(tabs[1]!, 'ArrowRight');
    assert.equal(active(), tabs[2]);
    await press(tabs[2]!, 'ArrowRight');
    assert.equal(active(), tabs[0], 'da última volta para a primeira');
    await press(tabs[0]!, 'ArrowLeft');
    assert.equal(active(), tabs[2], 'da primeira volta para a última');
    await press(tabs[2]!, 'Home');
    assert.equal(active(), tabs[0]);
    await press(tabs[0]!, 'End');
    assert.equal(active(), tabs[2]);
    assert.deepEqual(changes, [], 'ativação manual: seta não dispara chamada à API');
  });

  test('outras teclas não são engolidas (Tab segue o caminho normal)', async () => {
    const { tabs } = await mount('pending');
    const event = Object.assign(new MiniEvent('keydown', { bubbles: true, cancelable: true }), { key: 'Tab' });
    await act(async () => {
      tabs[1]!.dispatchEvent(event);
    });
    assert.equal(event.defaultPrevented, false);
  });

  test('clique (e Enter/Espaço, que o <button> converte em clique) troca o filtro', async () => {
    const { tabs, changes } = await mount('pending');
    await click(tabs[0]!);
    assert.deepEqual(changes, ['all']);
  });
});

describe('NotFoundPage', () => {
  test('tem um <h1> e a saída vai para "/" (que decide pelo papel), não fixo para o pré-cadastro', async () => {
    view = await render(createElement(MemoryRouter, { children: createElement(NotFoundPage) }));
    const [h1] = findAll(view.container, (el) => el.tagName === 'H1');
    assert.equal(h1?.textContent, 'Página não encontrada');
    const links = findAll(view.container, (el) => el.tagName === 'A');
    assert.equal(links.length, 1);
    assert.equal(links[0]?.getAttribute('href'), '/');
  });
});
