import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { PrimaryButton, SecondaryButton, SurfaceRaised, focusRingStyle, theme, textStyle, useKeyboardFocusRing } from '@vuumbora/ui';

export interface OnlineToggleProps {
  readonly online: boolean;
  /** Entre o toque e a confirmação (sem servidor ainda, ver nota) — spinner no CTA, chave não muda. */
  readonly loading?: boolean;
  readonly onToggle: (next: boolean) => void;
}

// Anel de foco de teclado da chave — fora do alvo, raio de pílula (mesma receita do `ButtonCore`/`SegmentedControl`).
const FOCUS_RING = focusRingStyle('outside', theme.radius.pill);

/**
 * Cartão de status da Home do motorista (ficha M05 §2/§4, componente local
 * `DriverStatusCard` da ficha — mantido neste arquivo por ser a mesma peça que já
 * existia, agora reescrita). Duas regras de domínio (MOTORISTA.md) que o código
 * respeita, não só a aparência:
 * 1. "Não permitir online antes de cadastro e documentação aprovados" — a Home só
 *    monta este cartão com o cadastro APROVADO e sem documento vencido (fatia D6:
 *    `canGoOnline`, a mesma regra do servidor); antes disso o lugar é do cartão do
 *    cadastro (`VerificationStatusCard`, M04). O ramo "não aprovado" que morava aqui
 *    ("Cadastro em análise...", fixo, inalcançável) saiu: era o Q5.
 * 2. "Atualizar status com confirmação do backend; não assumir sucesso otimista" —
 *    como não há backend ainda, o pai simula a confirmação (`loading`) antes de
 *    comitar o novo estado; aqui dentro, a chave só reflete `online` quando
 *    `loading` for `false` — nunca otimista, mesmo em demonstração.
 *
 * **Dois controles para a mesma ação, de propósito:** a chave (papel `switch`,
 * exigida pela ficha §8) e o CTA abaixo ("Ficar online"/"Ficar offline", a peça
 * grande da referência) chamam o MESMO `onToggle` — a prancha mostra os dois juntos
 * (pílula na linha do título + botão cheio embaixo), e manter a chave interativa
 * evita esconder o papel de acessibilidade que a ficha pede.
 */
export const OnlineToggle = memo(function OnlineToggle({ online, loading = false, onToggle }: OnlineToggleProps) {
  const { focusVisible, focusProps } = useKeyboardFocusRing();
  const checked = online;

  return (
    <SurfaceRaised style={styles.card} testID="online-toggle-card">
      <Text style={styles.statusLabel}>Você está</Text>
      <View style={styles.titleRow}>
        <Text style={styles.statusTitle}>{checked ? 'Online' : 'Offline'}</Text>
        <Pressable
          {...focusProps}
          onPress={() => onToggle(!online)}
          disabled={loading}
          accessibilityRole="switch"
          accessibilityState={{ checked, disabled: loading, busy: loading }}
          accessibilityLabel={checked ? 'Online. Toque para ficar offline' : 'Offline. Toque para ficar online'}
          style={[styles.switchPill, checked ? styles.switchOn : styles.switchOff, focusVisible && FOCUS_RING]}
        >
          <View style={[styles.switchDot, { backgroundColor: checked ? theme.role.success : theme.role.textMuted }]} />
          <View style={[styles.thumb, checked && styles.thumbOn]} />
        </Pressable>
      </View>
      {checked ? (
        <Text style={styles.apoio} numberOfLines={1}>
          Procurando corridas perto de você
        </Text>
      ) : null}
      {checked ? (
        <SecondaryButton
          label="Ficar offline"
          onPress={() => onToggle(false)}
          loading={loading}
          accessibilityLabel="Ficar offline"
          testID="online-toggle-cta"
        />
      ) : (
        <PrimaryButton
          label="Ficar online"
          onPress={() => onToggle(true)}
          loading={loading}
          accessibilityLabel="Ficar online"
          testID="online-toggle-cta"
        />
      )}
    </SurfaceRaised>
  );
});

const styles = StyleSheet.create({
  card: {
    borderRadius: theme.radius.lg,
    // Borda iluminada de cima (direção de arte §4/§9 item 2).
    borderTopColor: theme.role.edgeTop,
    borderColor: theme.role.edgeBottom,
    borderWidth: 1,
    padding: theme.spacing['4'],
    gap: theme.spacing['2'],
  },
  statusLabel: { color: theme.role.textSecondary, ...textStyle('regular', 'small') },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing['2'] },
  statusTitle: { color: theme.role.textPrimary, ...textStyle('bold', 'title') },
  apoio: { color: theme.role.textSecondary, ...textStyle('regular', 'small') },
  switchPill: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: theme.layout.touchTarget,
    borderRadius: theme.radius.pill,
    borderWidth: 1.5,
    paddingHorizontal: 4,
    gap: 6,
  },
  switchOn: { backgroundColor: theme.role.ctaBackground, borderColor: theme.role.ctaBackground },
  switchOff: { backgroundColor: theme.role.surfaceElevated, borderColor: theme.role.borderControl },
  switchDot: { width: 8, height: 8, borderRadius: 4, marginLeft: 6 },
  thumb: { width: 24, height: 24, borderRadius: 12, backgroundColor: theme.role.surface },
  thumbOn: { backgroundColor: theme.role.ctaText },
});
