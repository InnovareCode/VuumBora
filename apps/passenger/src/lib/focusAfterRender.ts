/**
 * Foco por código nas telas de conta (depois de um envio, ao chegar na tela).
 *
 * Por que existe: o botão que enviou fica indisponível enquanto a chamada está em curso e o navegador joga o foco no
 * `<body>` (no web o Enter num campo também o desfoca; ver `InputCore`). Quem usa só o teclado, ou um leitor de tela,
 * precisa que o foco volte a um lugar que faça sentido quando a resposta chega.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';

/**
 * Devolve `focusAfterRender(foco)`: guarda o pedido e só o executa DEPOIS do próximo commit. É preciso esperar: na
 * hora em que a resposta chega os campos ainda estão com `submitting` ligado (somente leitura) e o aviso de erro ainda
 * não existe no DOM — `focus()` direto, ali, não acharia o alvo. Como o pedido é estado, ele vem no mesmo lote do
 * `setSubmitting(false)` e do `setFailure(...)` da tela.
 */
export function useFocusAfterRender(): (focus: () => void) => void {
  const [request, setRequest] = useState<{ readonly id: number; readonly focus: () => void } | null>(null);
  useEffect(() => {
    request?.focus();
  }, [request]);
  return useCallback((focus: () => void) => {
    setRequest((previous) => ({ id: (previous?.id ?? 0) + 1, focus }));
  }, []);
}

/**
 * Leva o foco ao campo principal quando a tela abre (ex.: o campo do código, que é tudo o que a pessoa veio fazer
 * aqui). Roda um tick depois da montagem (o campo já está registrado no formulário e visível). Só na abertura: voltar
 * para a tela não rouba o foco de volta. No celular abre o teclado já no campo; isso NÃO foi provado em aparelho (o
 * `InteractionManager`, que esperaria o fim da transição, saiu do núcleo do RN 0.88).
 */
export function useFocusOnArrival(focus: () => void): void {
  const latest = useRef(focus);
  latest.current = focus;
  useEffect(() => {
    const timer = setTimeout(() => latest.current(), 0);
    return () => clearTimeout(timer);
  }, []);
}

/**
 * Leva o foco ao campo quando a tela GANHA o foco de navegação — abre, ou volta a ser a de cima da pilha — e só se
 * `shouldFocus()` disser que sim. Diferente de `useFocusOnArrival`, que roda uma vez na montagem: aqui a tela pode já
 * estar montada embaixo (o motorista tem `entrar` como âncora, e o passageiro pode ter o `login` na pilha) e a montagem
 * não se repete. Sem isto o foco fica no `<body>` da tela que acabou de sair e quem usa teclado ou leitor de tela
 * recomeça do topo da página (N6 da passada 4 da Íris, depois de "Entrar na minha conta").
 *
 * `shouldFocus` e `focus` são lidos na hora de rodar (não entram nas dependências): trocar de função a cada
 * renderização não refaz o efeito. Roda um tick depois, como `useFocusOnArrival`. NÃO foi provado em aparelho.
 */
export function useFocusWhenScreenFocused(focus: () => void, shouldFocus: () => boolean): void {
  const latest = useRef({ focus, shouldFocus });
  latest.current = { focus, shouldFocus };
  useFocusEffect(
    useCallback(() => {
      if (!latest.current.shouldFocus()) return undefined;
      const timer = setTimeout(() => latest.current.focus(), 0);
      return () => clearTimeout(timer);
    }, []),
  );
}
