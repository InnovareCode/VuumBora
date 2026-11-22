import { memo } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { theme } from '@vuumbora/tokens';
import { withAlpha } from './colorAlpha';
import { DangerButton } from './DangerButton';
import { PrimaryButton } from './PrimaryButton';
import { SecondaryButton } from './SecondaryButton';
import { SurfaceRaised } from './SurfaceRaised';
import { textStyle } from './typography';

export interface ConfirmDialogProps {
  readonly visible: boolean;
  readonly title: string;
  readonly description?: string;
  readonly confirmLabel: string;
  readonly cancelLabel?: string;
  /** `true`: o botão de confirmar é o `DangerButton` (cancelar corrida, sair da conta). */
  readonly destructive?: boolean;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
  readonly loading?: boolean;
  readonly testID?: string;
}

/**
 * Confirmação com consequência (C-03, `docs/padrao-premium-telas.md` §15: "Cancelar" agia no
 * primeiro toque em `buscando.tsx`). Usa o `Modal` do React Native (nativo e web via
 * react-native-web).
 *
 * **Sem "tocar fora fecha"** (mudança deliberada, achada medindo no navegador em 22/11/2026):
 * o scrim é um `View` sem toque — Esc (`Modal.onRequestClose`, já embutido no RNW) e os dois
 * botões são os únicos jeitos de fechar. Dois motivos, não só um:
 *  1. Produto: uma confirmação com CONSEQUÊNCIA (cancelar corrida, sair da conta) não devia
 *     fechar sozinha com um toque sem querer fora dela — forçar a escolha explícita é o
 *     comportamento mais seguro para este componente específico (`EstimateLabel`/`ConfirmDialog`
 *     não são a mesma coisa que um menu solto, que pode fechar ao tocar fora).
 *  2. Técnico: o scrim precisava ser um `Pressable` pra "tocar fora fecha" funcionar, mas TODO
 *     `Pressable` do react-native-web sai com `tabIndex` (0 ou -1 — `Pressable/index.js:193-198`,
 *     nunca ausente) — e `tabIndex` de QUALQUER valor, inclusive -1, é focável por `.focus()`
 *     (confirmado medindo: `document.activeElement` muda). Isso fazia o `focusFirstDescendant`
 *     do `ModalFocusTrap` embutido do RNW (ver próximo parágrafo) parar no scrim — o primeiro
 *     nó "focável" que ele encontra — em vez de chegar aos botões de verdade.
 *
 * Foco de teclado: o `Modal` do react-native-web JÁ TEM armadilha de foco e devolução de foco
 * embutidas (`react-native-web/src/exports/Modal/ModalFocusTrap.js` — Tab não escapa do
 * diálogo, e ao desmontar devolve o foco a quem o abriu). Eu tinha construído uma armadilha
 * própria (`useWebFocusTrap`) achando que faltava — competia com a de dentro do RNW (as duas
 * tentavam focar coisas ao mesmo tempo) e criava um salto de foco errado por ~250-400ms (a
 * duração do fade do `ModalAnimation`) antes de o foco assentar no lugar certo. Removida. A
 * única peça que faltava de verdade era o alvo do foco INICIAL: sem nada, o RNW foca o
 * primeiro elemento focável de dentro (`focusFirstDescendant`) — que seria o botão de
 * CONFIRMAR, perigoso quando `destructive`. Resolvido sem código de foco nenhum: o botão de
 * CANCELAR vem primeiro no JSX (`actions` abaixo), então é nele que o foco inicial pousa
 * sozinho.
 */
export const ConfirmDialog = memo(function ConfirmDialog({
  visible,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancelar',
  destructive = false,
  onConfirm,
  onCancel,
  loading = false,
  testID,
}: ConfirmDialogProps) {
  const ConfirmButton = destructive ? DangerButton : PrimaryButton;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel} statusBarTranslucent testID={testID}>
      <View style={styles.scrim}>
        <View accessibilityViewIsModal>
          <SurfaceRaised style={styles.card}>
            <Text style={styles.title} accessibilityRole="header">
              {title}
            </Text>
            {description ? <Text style={styles.description}>{description}</Text> : null}
            <View style={styles.actions}>
              <SecondaryButton label={cancelLabel} onPress={onCancel} disabled={loading} />
              <ConfirmButton label={confirmLabel} onPress={onConfirm} loading={loading} />
            </View>
          </SurfaceRaised>
        </View>
      </View>
    </Modal>
  );
});

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: withAlpha(theme.role.screen, theme.opacity.scrim),
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.layout.screenPadding,
  },
  card: {
    width: '100%',
    maxWidth: theme.layout.contentMaxWidth - theme.layout.screenPadding * 2,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderTopColor: theme.role.edgeTop,
    borderColor: theme.role.edgeBottom,
    padding: theme.spacing['5'],
    gap: theme.spacing['3'],
  },
  title: { color: theme.role.textPrimary, ...textStyle('bold', 'subtitle') },
  description: { color: theme.role.textSecondary, ...textStyle('regular', 'small') },
  actions: { gap: theme.spacing['2'] },
});
