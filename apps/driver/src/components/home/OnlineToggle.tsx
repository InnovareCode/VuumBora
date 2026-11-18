import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SignalHigh } from 'lucide-react-native';
import { MockBadge, theme, textStyle } from '@vuumbora/ui';

export interface OnlineToggleProps {
  readonly online: boolean;
  /** Cadastro/documentação aprovados (MOTORISTA.md). Sem isso o controle fica desabilitado. */
  readonly approved: boolean;
  readonly onToggle: (next: boolean) => void;
}

/**
 * Alterna ONLINE/OFFLINE. Duas regras de domínio (MOTORISTA.md) que a tela precisa
 * respeitar, não só parecer:
 * 1. "Não permitir online antes de cadastro e documentação aprovados" — por isso o
 *    controle fica `disabled` e explica o motivo quando `approved` é `false`.
 * 2. "Atualizar status com confirmação do backend; não assumir sucesso otimista em
 *    ações críticas" — como não há backend ainda, a troca aqui é só estado local
 *    (otimista) vindo do componente pai. O `MockBadge` deixa isso explícito: este
 *    status NÃO está confirmado por nenhum servidor.
 */
export const OnlineToggle = memo(function OnlineToggle({ online, approved, onToggle }: OnlineToggleProps) {
  const disabled = !approved;
  const checked = approved && online;

  return (
    <View style={styles.card} testID="online-toggle-card">
      <View style={styles.topRow}>
        <Text style={styles.title}>Status do motorista</Text>
        <MockBadge label="status local, sem confirmação do servidor" />
      </View>
      <View style={styles.bottomRow}>
        <Pressable
          onPress={() => (disabled ? undefined : onToggle(!online))}
          disabled={disabled}
          accessibilityRole="switch"
          accessibilityState={{ checked, disabled }}
          accessibilityLabel={checked ? 'Online. Toque para ficar offline' : 'Offline. Toque para ficar online'}
          style={[styles.switchPill, checked ? styles.switchOn : styles.switchOff, disabled && styles.switchDisabled]}
        >
          <View
            style={[
              styles.switchDot,
              { backgroundColor: disabled ? theme.role.textMuted : checked ? theme.role.success : theme.role.textMuted },
            ]}
          />
          <Text
            style={[
              styles.switchLabel,
              { color: disabled ? theme.role.textMuted : checked ? theme.role.ctaText : theme.role.textPrimary },
            ]}
          >
            {checked ? 'ONLINE' : 'OFFLINE'}
          </Text>
          <View style={[styles.thumb, checked && styles.thumbOn]} />
        </Pressable>
        <View style={styles.divider} />
        <View style={styles.statusTextBlock}>
          {disabled ? (
            <Text style={styles.statusText} numberOfLines={2}>
              Cadastro em análise. Você poderá ficar online após a aprovação.
            </Text>
          ) : (
            <View style={styles.statusRow}>
              <SignalHigh size={16} color={theme.role.textSecondary} strokeWidth={2} />
              <Text style={styles.statusText} numberOfLines={2}>
                {checked ? 'Você está online e recebendo corridas.' : 'Você está offline. Fique online para receber corridas.'}
              </Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.role.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.role.border,
    padding: theme.spacing['3'],
    gap: theme.spacing['2'],
  },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing['2'], flexWrap: 'wrap' },
  title: { color: theme.role.textPrimary, ...textStyle('semibold', 'small') },
  bottomRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing['3'] },
  switchPill: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: theme.layout.touchTarget,
    borderRadius: theme.radius.pill,
    borderWidth: 1.5,
    paddingLeft: theme.spacing['3'],
    paddingRight: 6,
    gap: 6,
  },
  switchOn: { backgroundColor: theme.role.ctaBackground, borderColor: theme.role.ctaBackground },
  switchOff: { backgroundColor: theme.role.surfaceElevated, borderColor: theme.role.borderControl },
  switchDisabled: { backgroundColor: theme.role.surfaceElevated, borderColor: theme.role.borderControl },
  switchDot: { width: 8, height: 8, borderRadius: 4 },
  switchLabel: { ...textStyle('bold', 'small') },
  thumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: theme.role.surface,
    marginLeft: 4,
  },
  thumbOn: { backgroundColor: theme.role.ctaText },
  divider: { width: 1, alignSelf: 'stretch', backgroundColor: theme.role.border },
  statusTextBlock: { flex: 1 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusText: { flex: 1, color: theme.role.textSecondary, ...textStyle('regular', 'caption') },
});
