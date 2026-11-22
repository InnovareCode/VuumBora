import { memo } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
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
 * react-native-web) — o scrim fecha ao tocar fora (equivalente a "Cancelar").
 *
 * ⚠ Pendência honesta (handoff): não há armadilha de foco (focus trap) de teclado aqui —
 * o `Modal` nativo tira o conteúdo de trás da árvore de acessibilidade em iOS/Android, mas
 * isso não foi medido no React Native Web. Antes de usar em produção, repetir a medição que
 * achou o mesmo defeito no painel admin (`bug_overlay_sem_focus_trap_escapa_para_fundo`).
 *
 * O scrim e o `Pressable` que absorve o toque dentro do cartão são decorativos — toda AÇÃO
 * real é um `ButtonCore` (já tem o anel de foco compartilhado, `useKeyboardFocusRing`).
 * `focusable={false}` tira os dois da ordem de Tab de propósito (pedido do Atlas, achado
 * Q1 da Íris: todo clicável novo usa o anel por padrão — aqui a resposta certa é NÃO ser
 * um alvo de Tab, em vez de um alvo sem anel. Sem isso, o backdrop virava um botão
 * "Cancelar" fantasma e duplicado para quem navega por teclado/leitor de tela).
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
      <Pressable style={styles.scrim} onPress={onCancel} focusable={false}>
        <Pressable onPress={(event) => event.stopPropagation()} focusable={false}>
          <View accessibilityViewIsModal>
            <SurfaceRaised style={styles.card}>
              <Text style={styles.title} accessibilityRole="header">
                {title}
              </Text>
              {description ? <Text style={styles.description}>{description}</Text> : null}
              <View style={styles.actions}>
                <ConfirmButton label={confirmLabel} onPress={onConfirm} loading={loading} />
                <SecondaryButton label={cancelLabel} onPress={onCancel} disabled={loading} />
              </View>
            </SurfaceRaised>
          </View>
        </Pressable>
      </Pressable>
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
