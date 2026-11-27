import { Platform } from 'react-native';

/**
 * Espaço ativa a opção de um `radiogroup` no web. O react-native-web 0.21 só aceita Espaço em role `button`/`menuitem`
 * (`PressResponder.isValidKeyPress`); com role `radio` só o Enter funcionava. Mesma correção do `ConsentCheckbox` do DS
 * (memória `bug_rnweb_checkbox_aria_checked_e_espaco`). Nativo: nada (o leitor de tela ativa pelo gesto padrão).
 */
export function radioSpaceKeyProps(onSelect: () => void): object {
  if (Platform.OS !== 'web') return {};
  return {
    onKeyDown: (event: { key: string; preventDefault: () => void }) => {
      if (event.key !== ' ') return;
      event.preventDefault(); // não rola a página
      onSelect();
    },
  };
}
