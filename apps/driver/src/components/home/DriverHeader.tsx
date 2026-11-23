import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Bell } from 'lucide-react-native';
import { Avatar, focusRingStyle, theme, textStyle, useKeyboardFocusRing } from '@vuumbora/ui';

export interface DriverHeaderProps {
  /** Nome exibido — dado de DEMONSTRAÇÃO enquanto não há sessão autenticada real. */
  readonly driverName: string;
  readonly notificationCount?: number;
  /** Foto remota (sessão real, futuro). Sem avatar de demonstração (D-27): sem foto, cai na inicial. */
  readonly avatarUri?: string;
  readonly onPressNotifications?: () => void;
}

function firstNameOf(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

// Anel de foco de teclado do sino — mesmo padrão do `ButtonCore` (fora do alvo, 2pt), raio igual ao círculo do botão.
const FOCUS_RING = focusRingStyle('outside', theme.layout.touchTarget / 2);

/**
 * Saudação da Home do motorista (ficha M05 §2): avatar + "Olá, {nome}! / Pronto para
 * dirigir?" + sino de notificações à direita. Substitui o par antigo
 * `DriverHeader` (marca centralizada) + `DriverProfileRow` (avatar + selo de
 * verificação + "Motorista VuumBora") — a prancha de 22/11 não tem marca nem selo
 * nesta tela, só a saudação (consolidado nesta rodada, onda 2 "casa").
 */
export const DriverHeader = memo(function DriverHeader({
  driverName,
  notificationCount = 0,
  avatarUri,
  onPressNotifications,
}: DriverHeaderProps) {
  const { focusVisible, focusProps } = useKeyboardFocusRing();
  return (
    <View style={styles.row}>
      <Avatar name={driverName} size="md" {...(avatarUri !== undefined ? { imageUri: avatarUri } : {})} />
      <View style={styles.textBlock}>
        <Text style={styles.greeting} numberOfLines={1}>
          Olá, {firstNameOf(driverName)}!
        </Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          Pronto para dirigir?
        </Text>
      </View>
      <Pressable
        {...focusProps}
        onPress={onPressNotifications}
        accessibilityRole="button"
        accessibilityLabel={notificationCount > 0 ? `Notificações, ${notificationCount} não lidas` : 'Notificações'}
        hitSlop={8}
        style={[styles.bellTarget, focusVisible && FOCUS_RING]}
      >
        <Bell size={22} color={theme.role.textPrimary} strokeWidth={1.75} />
        {notificationCount > 0 ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{notificationCount > 9 ? '9+' : notificationCount}</Text>
          </View>
        ) : null}
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing['3'] },
  textBlock: { flex: 1, gap: 2 },
  greeting: { color: theme.role.textPrimary, ...textStyle('bold', 'subtitle') },
  subtitle: { color: theme.role.textSecondary, ...textStyle('regular', 'small') },
  bellTarget: {
    width: theme.layout.touchTarget,
    height: theme.layout.touchTarget,
    borderRadius: theme.layout.touchTarget / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 3,
    backgroundColor: theme.role.dangerFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: theme.role.textPrimary, fontSize: 10, lineHeight: 12, fontWeight: theme.typography.weight.bold },
});
