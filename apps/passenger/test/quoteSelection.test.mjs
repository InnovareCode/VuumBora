// Regra de escolha de categoria depois de uma cotação nova (achado bloqueante da Íris na G6: troca silenciosa de
// categoria e de preço). Roda com: npm test --workspace=apps/passenger  (node --import tsx --test).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectCategoryAfterQuote } from '../src/store/quoteSelection.ts';

const cotacao = (...slugs) => slugs.map((categorySlug) => ({ categorySlug }));
const nada = { categoryId: undefined, categoryUnavailable: false };

test('escolha anterior que continua na cotação nova: mantém', () => {
  assert.deepEqual(selectCategoryAfterQuote({ categoryId: 'conforto', categoryUnavailable: false }, cotacao('vuumbora', 'conforto')), {
    categoryId: 'conforto',
    categoryUnavailable: false,
  });
});

test('escolha anterior que SUMIU: nenhuma categoria + aviso — nunca a 1ª da lista', () => {
  for (const [escolhida, restante] of [
    ['conforto', 'vuumbora'],
    ['vuumbora', 'conforto'],
  ]) {
    const depois = selectCategoryAfterQuote({ categoryId: escolhida, categoryUnavailable: false }, cotacao(restante));
    assert.deepEqual(depois, { categoryId: undefined, categoryUnavailable: true }, `${escolhida} sumiu: não pode virar ${restante}`);
  }
});

test('escolha anterior e cotação vazia: nenhuma + aviso', () => {
  assert.deepEqual(selectCategoryAfterQuote({ categoryId: 'conforto', categoryUnavailable: false }, cotacao()), {
    categoryId: undefined,
    categoryUnavailable: true,
  });
});

test('aviso já na tela e outra cotação chega (tentar de novo, preço vencido de novo): continua SEM escolha', () => {
  assert.deepEqual(selectCategoryAfterQuote({ categoryId: undefined, categoryUnavailable: true }, cotacao('vuumbora', 'conforto')), {
    categoryId: undefined,
    categoryUnavailable: true,
  });
});

test('primeira cotação da corrida (nunca houve escolha): a 1ª fica pré-selecionada, sem aviso', () => {
  assert.deepEqual(selectCategoryAfterQuote(nada, cotacao('vuumbora', 'conforto')), { categoryId: 'vuumbora', categoryUnavailable: false });
});

test('primeira cotação vazia: nenhuma, sem aviso (o painel mostra "Ainda não atendemos este trajeto")', () => {
  assert.deepEqual(selectCategoryAfterQuote(nada, cotacao()), nada);
});

test('a regra é pura: não muda a entrada', () => {
  const antes = Object.freeze({ categoryId: 'conforto', categoryUnavailable: false });
  const lista = Object.freeze(cotacao('vuumbora').map((q) => Object.freeze(q)));
  selectCategoryAfterQuote(antes, lista);
  assert.deepEqual(antes, { categoryId: 'conforto', categoryUnavailable: false });
});
