import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BadgeCheck, CircleAlert, ClipboardList, Hourglass, Info, ShieldAlert, TriangleAlert } from 'lucide-react-native';
import { LoadingSkeleton, SecondaryButton, SurfaceRaised, theme, textStyle, withAlpha } from '@vuumbora/ui';
import type { SummaryTarget, SummaryTone, VerificationSummary } from '../../onboarding/verificationModel';

const TONE_COLOR: Record<SummaryTone, string> = {
  info: theme.role.info,
  warning: theme.role.warning,
  danger: theme.role.danger,
  success: theme.role.success,
};

function iconFor(key: string) {
  if (key === 'not_started') return Info;
  if (key === 'pending_documents') return ClipboardList;
  if (key === 'under_review') return Hourglass;
  if (key === 'changes_requested') return TriangleAlert;
  if (key === 'suspended') return ShieldAlert;
  if (key === 'approved') return BadgeCheck;
  return CircleAlert;
}

export interface VerificationStatusCardProps {
  readonly summary: VerificationSummary;
  readonly onAction?: (target: SummaryTarget) => void;
  /** Ação em andamento (ex.: abrindo o WhatsApp): spinner no botão. */
  readonly actionLoading?: boolean;
  readonly testID?: string;
}

/**
 * O cartão de status do cadastro (M04 §2): ocupa o lugar do "Você está offline · Ficar online" da Home enquanto o
 * motorista não pode dirigir, e abre a análise. `SurfaceRaised`, ícone 24 em pastilha tingida pelo tom, título
 * `subtitle`, frase `small` e a ação como `SecondaryButton` — o CTA amarelo "Ficar online" só existe no aprovado.
 * Sem `numberOfLines`: título e frase quebram linha (motivo de recusa vem do servidor e pode ser longo).
 */
export const VerificationStatusCard = memo(function VerificationStatusCard({
  summary,
  onAction,
  actionLoading = false,
  testID,
}: VerificationStatusCardProps) {
  const color = TONE_COLOR[summary.tone];
  const Icon = iconFor(summary.key);
  const action = summary.action;
  return (
    <SurfaceRaised style={styles.card} testID={testID}>
      <View style={styles.header}>
        <View style={[styles.iconBox, { backgroundColor: withAlpha(color, 0.14) }]}>
          <Icon size={24} color={color} strokeWidth={1.75} />
        </View>
        <Text style={styles.title} accessibilityRole="header" testID={testID ? `${testID}-title` : undefined}>
          {summary.title}
        </Text>
      </View>
      <Text style={styles.message} testID={testID ? `${testID}-message` : undefined}>
        {summary.message}
      </Text>
      {action && onAction ? (
        <SecondaryButton
          label={action.label}
          onPress={() => onAction(action.target)}
          loading={actionLoading}
          {...(testID ? { testID: `${testID}-action` } : {})}
        />
      ) : null}
    </SurfaceRaised>
  );
});

/** Esqueleto do cartão (ficha M05 §5: "nunca mostrar 'Offline' antes de saber"). */
export function VerificationStatusCardSkeleton({ testID }: { readonly testID?: string }) {
  return (
    <SurfaceRaised style={styles.card} testID={testID} accessibilityLabel="Carregando o estado do seu cadastro">
      <View style={styles.header}>
        <LoadingSkeleton variant="block" width={44} height={44} />
        <LoadingSkeleton variant="line" width={180} />
      </View>
      <LoadingSkeleton variant="line" lines={2} />
    </SurfaceRaised>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: theme.radius.lg,
    borderTopColor: theme.role.edgeTop,
    borderColor: theme.role.edgeBottom,
    borderWidth: 1,
    padding: theme.spacing['4'],
    gap: theme.spacing['3'],
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing['3'] },
  iconBox: { width: 44, height: 44, borderRadius: theme.radius.md, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, minWidth: 0, color: theme.role.textPrimary, ...textStyle('bold', 'subtitle') },
  message: { color: theme.role.textSecondary, ...textStyle('regular', 'small') },
});
