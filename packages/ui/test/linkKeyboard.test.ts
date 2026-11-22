/**
 * Teclado do link de texto no web (Q4 da Íris): Enter ativa, uma vez por aperto; Espaço não (convenção de link, como um
 * `<a href>`); nada muda no iOS/Android nem em `role="button"`. A prova de verdade (Tab, Enter, anel de foco, nos dois
 * apps e nos três motores) está nos roteiros de navegador — aqui ficam as regras, sem React.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isFocusVisibleEvent, isLinkActivationKey, linkKeyDownProps, type LinkKeyEvent } from '../src/linkKeyboard';

const press = (key: string, extra: Partial<LinkKeyEvent> = {}): LinkKeyEvent => ({ key, repeat: false, altKey: false, ...extra });

describe('isLinkActivationKey', () => {
  it('Enter ativa', () => {
    assert.equal(isLinkActivationKey(press('Enter')), true);
  });

  it('Enter sem as propriedades opcionais (evento mínimo) também ativa', () => {
    assert.equal(isLinkActivationKey({ key: 'Enter' }), true);
  });

  it('Espaço NÃO ativa (link nativo só ativa com Enter)', () => {
    assert.equal(isLinkActivationKey(press(' ')), false);
    assert.equal(isLinkActivationKey(press('Spacebar')), false);
  });

  it('outras teclas não ativam', () => {
    for (const key of ['Tab', 'Escape', 'ArrowDown', 'a', 'NumpadEnter', 'enter']) {
      assert.equal(isLinkActivationKey(press(key)), false, key);
    }
  });

  it('auto-repeat de Enter segurado não ativa de novo', () => {
    assert.equal(isLinkActivationKey(press('Enter', { repeat: true })), false);
  });

  it('Alt+Enter não ativa (como o clique com Alt do react-native-web)', () => {
    assert.equal(isLinkActivationKey(press('Enter', { altKey: true })), false);
  });
});

describe('linkKeyDownProps', () => {
  const calls = () => {
    let n = 0;
    return { onPress: () => void n++, count: () => n };
  };

  it('no web, role link: Enter chama onPress uma vez', () => {
    const c = calls();
    const props = linkKeyDownProps({ platform: 'web', role: 'link', disabled: false, onPress: c.onPress });
    props.onKeyDown?.(press('Enter'));
    assert.equal(c.count(), 1);
  });

  it('no web, role link: Espaço, Tab e repetição não chamam onPress', () => {
    const c = calls();
    const props = linkKeyDownProps({ platform: 'web', role: 'link', disabled: false, onPress: c.onPress });
    props.onKeyDown?.(press(' '));
    props.onKeyDown?.(press('Tab'));
    props.onKeyDown?.(press('Enter', { repeat: true }));
    assert.equal(c.count(), 0);
  });

  it('desabilitado: Enter não chama onPress', () => {
    const c = calls();
    const props = linkKeyDownProps({ platform: 'web', role: 'link', disabled: true, onPress: c.onPress });
    props.onKeyDown?.(press('Enter'));
    assert.equal(c.count(), 0);
  });

  it('o estado "desabilitado" vale no momento do aperto, não no da criação', () => {
    const c = calls();
    const enabled = linkKeyDownProps({ platform: 'web', role: 'link', disabled: false, onPress: c.onPress });
    const disabled = linkKeyDownProps({ platform: 'web', role: 'link', disabled: true, onPress: c.onPress });
    enabled.onKeyDown?.(press('Enter'));
    disabled.onKeyDown?.(press('Enter'));
    assert.equal(c.count(), 1);
  });

  it('o nativo continua igual: iOS e Android não recebem nenhum handler', () => {
    for (const platform of ['ios', 'android', 'windows', 'macos']) {
      const props = linkKeyDownProps({ platform, role: 'link', disabled: false, onPress: () => {} });
      assert.deepEqual(props, {}, platform);
    }
  });

  it('role button continua igual: o react-native-web já ativa por Enter e Espaço, nenhum handler extra', () => {
    const props = linkKeyDownProps({ platform: 'web', role: 'button', disabled: false, onPress: () => {} });
    assert.deepEqual(props, {});
  });
});

describe('isFocusVisibleEvent', () => {
  const eventWith = (matches: (selector: string) => boolean) => ({ target: { matches } });

  it('foco de teclado (:focus-visible casa) mostra o anel', () => {
    assert.equal(isFocusVisibleEvent(eventWith((selector) => selector === ':focus-visible')), true);
  });

  it('foco de mouse (:focus-visible não casa) não mostra o anel', () => {
    assert.equal(isFocusVisibleEvent(eventWith(() => false)), false);
  });

  it('pergunta exatamente por :focus-visible', () => {
    const asked: string[] = [];
    isFocusVisibleEvent(eventWith((selector) => (asked.push(selector), true)));
    assert.deepEqual(asked, [':focus-visible']);
  });

  it('navegador que não conhece :focus-visible (lança): mostra o anel, nunca foco invisível', () => {
    const throwing = eventWith(() => {
      throw new SyntaxError("':focus-visible' is not a valid selector");
    });
    assert.equal(isFocusVisibleEvent(throwing), true);
  });

  it('nativo (target sem matches), undefined e null: sem anel e sem erro', () => {
    assert.equal(isFocusVisibleEvent({ target: 7 }), false);
    assert.equal(isFocusVisibleEvent({ target: {} }), false);
    assert.equal(isFocusVisibleEvent({}), false);
    assert.equal(isFocusVisibleEvent(undefined), false);
    assert.equal(isFocusVisibleEvent(null), false);
  });
});
