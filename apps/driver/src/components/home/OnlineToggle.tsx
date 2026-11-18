import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SignalHigh } from 'lucide-react-native';
import { MockBadge, SurfaceRaised, theme, textStyle } from '@vuumbora/ui';

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
 *
 * **Layout (referência motorista-home-alvo.webp item 6) — NÃO ficou numa linha só.**
 * A referência mostra rótulo + pílula + divisor + sinal/texto numa linha. Tentei essa
 * versão de verdade (breakpoint ≥390px) e medi (Playwright, inspeção de
 * `getBoundingClientRect`): mesmo a 430px de largura, depois de "Status do motorista"
 * (133px) + pílula (121px) + divisor + 3 gaps, sobravam só ~70px para o texto de
 * status — "Você está online e recebendo corridas." cortava para "Você está\nonline
 * e…" mesmo em 2 linhas. A linha única da referência só caberia a partir de ~500px
 * de largura (fora dos 4 breakpoints pedidos: 320/360/390/430) — por isso o
 * componente ficou em DUAS linhas (rótulo+selo numa, toggle+divisor+status na outra)
 * em todas as larguras, priorizando o texto completo sobre o arranjo literal da
 * referência. Ver PENDÊNCIAS do handoff.
 */
export const OnlineToggle = memo(function OnlineToggle({ online, approved, onToggle }: OnlineToggleProps) {
  const disabled = !approved;
  const checked = approved && online;

  return (
    <SurfaceRaised style={styles.card} testID="online-toggle-card">
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
        {/* numberOfLines=4 (não 2): medido (Playwright, 320px) que a coluna de status
            (~86pt de texto, depois do rótulo+pílula+divisor) só comporta "Você está
            online e recebendo corridas." em 4 linhas nesse breakpoint — 2 linhas
            cortava a frase com "…" mesmo sendo curta. */}
        <View style={styles.statusTextBlock}>
          {disabled ? (
            <Text style={styles.statusText} numberOfLines={4}>
              Cadastro em análise. Você poderá ficar online após a aprovação.
            </Text>
          ) : (
            <View style={styles.statusRow}>
              <SignalHigh size={16} color={theme.role.textSecondary} strokeWidth={2} />
              <Text style={styles.statusText} numberOfLines={4}>
                {checked ? 'Você está online e recebendo corridas.' : 'Você está offline. Fique online para receber corridas.'}
              </Text>
            </View>
          )}
        </View>
      </View>
    </SurfaceRaised>
  );
});

const styles = StyleSheet.create({
  card: {
    borderRadius: theme.radius.lg,
    // Borda iluminada de cima (direção de arte §4/§9 item 2) — igual a todo outro
    // card premium do app, trocando a borda flat que este componente ainda usava.
    borderTopColor: theme.role.edgeTop,
    borderColor: theme.role.edgeBottom,
    borderWidth: 1,
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
