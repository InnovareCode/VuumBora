import { memo, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { SurfaceRaised, focusRingStyle, theme, textStyle, useKeyboardFocusRing } from '@vuumbora/ui';
import { UnavailableNoticeBanner } from '../auth/UnavailableNoticeBanner';
import { ToggleSwitch } from './ToggleSwitch';

export interface ListMenuRowToggleProps {
  readonly value: boolean;
  readonly onValueChange: (next: boolean) => void;
}

export interface ListMenuRowProps {
  readonly icon: ReactNode;
  readonly label: string;
  /** Valor exibido à direita antes do chevron (ex.: "Escuro", "12,4 MB"). */
  readonly value?: string;
  /** Linha vira interruptor: toda a linha é o alvo de toque (ver `ToggleSwitch`). */
  readonly toggle?: ListMenuRowToggleProps;
  /** Ação real (ex.: "Limpar cache"). Mutuamente exclusivo com `toggle`/`unavailableMessage`. */
  readonly onPress?: () => void;
  /**
   * Quando a seção não tem destino real (perfil/privacidade/tema/idioma): o toque revela
   * um `UnavailableNoticeBanner` embaixo da própria linha em vez de navegar para rota
   * vazia — mesmo padrão de `LegalNotice`/`login.tsx` (uma vez visível, não some mais).
   */
  readonly unavailableMessage?: string;
  readonly accessibilityLabel?: string;
  readonly testID?: string;
}

/**
 * Linha de lista transversal entre Perfil (P13) e Configurações (P13b): ícone + rótulo +
 * (valor | interruptor | chevron). Candidata a subir para `@vuumbora/ui` depois — por ora
 * vive só em `apps/passenger` (duas telas a usam, nenhuma de `packages/ui` ainda).
 */
export const ListMenuRow = memo(function ListMenuRow({
  icon,
  label,
  value,
  toggle,
  onPress,
  unavailableMessage,
  accessibilityLabel,
  testID,
}: ListMenuRowProps) {
  const [noticeVisible, setNoticeVisible] = useState(false);
  const { focusVisible, focusProps } = useKeyboardFocusRing();

  function handlePress() {
    if (toggle) {
      toggle.onValueChange(!toggle.value);
      return;
    }
    if (unavailableMessage) {
      setNoticeVisible(true);
      return;
    }
    onPress?.();
  }

  const interactive = Boolean(toggle || unavailableMessage || onPress);
  const showChevron = interactive && !toggle;

  const rowLabel =
    accessibilityLabel ?? (toggle ? `${label}${toggle.value ? ', ativado' : ', desativado'}` : value ? `${label}, ${value}` : label);

  const content = (
    <View style={styles.row}>
      <View style={styles.iconBox}>{icon}</View>
      {/* `value` fica EMBAIXO do rótulo (bloco de texto flex:1), nunca como irmão de
          largura fixa na mesma linha — mesma causa raiz evitada em
          bug_flex_fixo_espreme_texto_flex1_vizinho (memória da Lyra): um rótulo longo
          ("Localização em tempo real", "Preferências de viagem") dividindo linha com
          interruptor/chevron espremeria a 1 palavra em telas estreitas. */}
      <View style={styles.textBlock}>
        <Text style={styles.label} numberOfLines={2}>
          {label}
        </Text>
        {value ? (
          <Text style={styles.value} numberOfLines={1}>
            {value}
          </Text>
        ) : null}
      </View>
      {toggle ? <ToggleSwitch value={toggle.value} {...(testID !== undefined ? { testID: `${testID}-switch` } : {})} /> : null}
      {showChevron ? <ChevronRight size={18} color={theme.role.textMuted} strokeWidth={2} /> : null}
    </View>
  );

  return (
    <View>
      {interactive ? (
        <Pressable
          {...focusProps}
          onPress={handlePress}
          style={focusVisible ? FOCUS_RING : undefined}
          accessibilityRole={toggle ? 'switch' : 'button'}
          accessibilityState={toggle ? { checked: toggle.value } : undefined}
          accessibilityLabel={rowLabel}
          testID={testID}
        >
          {({ pressed }) => <SurfaceRaised style={[styles.card, pressed && styles.cardPressed]}>{content}</SurfaceRaised>}
        </Pressable>
      ) : (
        <SurfaceRaised style={styles.card} testID={testID}>
          {content}
        </SurfaceRaised>
      )}
      {unavailableMessage && noticeVisible ? (
        <View style={styles.notice}>
          <UnavailableNoticeBanner message={unavailableMessage} {...(testID !== undefined ? { testID: `${testID}-notice` } : {})} />
        </View>
      ) : null}
    </View>
  );
});

// Anel de foco de teclado em volta da linha inteira (é ela o alvo, não só o interruptor), FORA dela, com o raio do cartão.
const FOCUS_RING = focusRingStyle('outside', theme.radius.lg);

const styles = StyleSheet.create({
  card: {
    minHeight: theme.layout.touchTarget,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    // Borda iluminada de cima (direção de arte §4/§9 item 2). Fundo: item 6
    // (`gradient.surface.raised`, ver SurfaceRaised).
    borderTopColor: theme.role.edgeTop,
    borderColor: theme.role.edgeBottom,
    paddingHorizontal: theme.spacing['4'],
    paddingVertical: theme.spacing['3'],
  },
  cardPressed: { opacity: 0.85 },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing['3'] },
  iconBox: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  textBlock: { flex: 1, gap: 2 },
  label: { color: theme.role.textPrimary, ...textStyle('semibold', 'body') },
  value: { color: theme.role.textSecondary, ...textStyle('regular', 'small') },
  notice: { marginTop: theme.spacing['2'] },
});
