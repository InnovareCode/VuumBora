import { memo, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronRight, CircleX, Headphones, Siren } from 'lucide-react-native';
import { theme, textStyle, withAlpha, focusRingStyle, useKeyboardFocusRing } from '@vuumbora/ui';

export interface MoreOptionsSheetProps {
  readonly visible: boolean;
  readonly onClose: () => void;
  /** Omitido = linha não aparece (M09: cancelar não é permitido depois de `in_progress`, D-33). */
  readonly onCancelRide?: () => void;
  /** PP-11: "Ligar 190" — só onde a ficha pede (M09). */
  readonly onEmergencyCall?: () => void;
  readonly onSupport: () => void;
  readonly testID?: string;
}

/**
 * "Mais opções" (M07/M08/M09, `⋯` no cabeçalho) — painel local sem arrastar, mesmo padrão já usado
 * em P05/M07 (`role.surface` + `elevation.3` + `radius.xxl` + `layout.sheetHandle{Width,Height}`,
 * sem o `BottomSheet`/C-02 de verdade, que ainda não existe em `packages/ui`). Sem "tocar fora
 * fecha" (mesma decisão do `ConfirmDialog`: o scrim é um `View` sem toque, Esc/voltar fecham pelo
 * `onRequestClose` embutido do `Modal` do RNW).
 */
export const MoreOptionsSheet = memo(function MoreOptionsSheet({
  visible,
  onClose,
  onCancelRide,
  onEmergencyCall,
  onSupport,
  testID,
}: MoreOptionsSheetProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent testID={testID}>
      <View style={styles.scrim}>
        <View style={styles.sheet} accessibilityViewIsModal>
          <View style={styles.handle} accessibilityElementsHidden importantForAccessibility="no" />
          {onCancelRide ? (
            <Row icon={<CircleX size={20} color={theme.role.danger} strokeWidth={1.75} />} label="Cancelar corrida" onPress={onCancelRide} danger />
          ) : null}
          {onEmergencyCall ? (
            <Row icon={<Siren size={20} color={theme.role.danger} strokeWidth={1.75} />} label="Ligar 190" onPress={onEmergencyCall} danger />
          ) : null}
          <Row icon={<Headphones size={20} color={theme.role.textSecondary} strokeWidth={1.75} />} label="Suporte" onPress={onSupport} />
        </View>
      </View>
    </Modal>
  );
});

const Row = memo(function Row({
  icon,
  label,
  onPress,
  danger = false,
}: {
  readonly icon: ReactNode;
  readonly label: string;
  readonly onPress: () => void;
  readonly danger?: boolean;
}) {
  const { focusVisible, focusProps } = useKeyboardFocusRing();
  return (
    <Pressable
      {...focusProps}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.row, focusVisible && FOCUS_RING]}
    >
      <View style={styles.rowIcon}>{icon}</View>
      <Text style={[styles.rowLabel, danger && { color: theme.role.danger }]}>{label}</Text>
      <ChevronRight size={18} color={theme.role.textMuted} strokeWidth={2} />
    </Pressable>
  );
});

const FOCUS_RING = focusRingStyle('inside', theme.radius.md);

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: withAlpha(theme.role.screen, theme.opacity.scrim),
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: theme.role.surface,
    borderTopLeftRadius: theme.radius.xxl,
    borderTopRightRadius: theme.radius.xxl,
    boxShadow: theme.elevation['3'],
    paddingTop: theme.spacing['3'],
    paddingBottom: theme.spacing['6'],
    paddingHorizontal: theme.layout.screenPadding,
    gap: theme.spacing['1'],
  },
  handle: {
    alignSelf: 'center',
    width: theme.layout.sheetHandleWidth,
    height: theme.layout.sheetHandleHeight,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.role.borderControl,
    marginBottom: theme.spacing['2'],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing['3'],
    minHeight: theme.layout.touchTarget,
    paddingVertical: theme.spacing['2'],
  },
  rowIcon: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { flex: 1, color: theme.role.textPrimary, ...textStyle('semibold', 'body') },
});
