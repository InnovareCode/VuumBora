import { memo, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '@vuumbora/tokens';
import { SurfaceRaised } from './SurfaceRaised';
import { ToggleSwitch } from './ToggleSwitch';
import { textStyle } from './typography';
import { focusRingStyle, useKeyboardFocusRing } from './useFocusRing';

export interface ListRowToggleProps {
  readonly value: boolean;
  readonly onValueChange: (next: boolean) => void;
}

export interface ListRowProps {
  readonly icon: ReactNode;
  readonly label: string;
  /** Valor exibido embaixo do rótulo (nunca ao lado — ver nota em `textBlock`). */
  readonly value?: string;
  /** Linha vira interruptor: toda a linha é o alvo de toque. */
  readonly toggle?: ListRowToggleProps;
  /** Ação simples (ex.: navegar, "Limpar cache"). Ignorado quando `toggle` está presente. */
  readonly onPress?: () => void;
  readonly accessibilityLabel?: string;
  readonly testID?: string;
}

/**
 * Linha de lista transversal (C-08, `docs/padrao-premium-telas.md` §15/§18.1 item 2):
 * ícone em pastilha + rótulo/valor + (interruptor | chevron). Promovida de
 * `apps/passenger/src/components/shared/ListMenuRow.tsx` — perfil, configurações e
 * documentos dos dois apps usam a mesma linha.
 *
 * O comportamento de "seção sem destino real" (`unavailableMessage`/`UnavailableNoticeBanner`
 * do `ListMenuRow` original) não entrou aqui: é específico do passageiro e depende de um
 * componente que não mora em `packages/ui`. Quem precisar disso continua compondo por fora
 * (`{onPress: () => setNoticeVisible(true)}` + o próprio banner abaixo do `ListRow`) — esta
 * fatia não altera as telas que já usam o padrão antigo (`apps/*​/app` fora do escopo).
 */
export const ListRow = memo(function ListRow({ icon, label, value, toggle, onPress, accessibilityLabel, testID }: ListRowProps) {
  const { focusVisible, focusProps } = useKeyboardFocusRing();

  function handlePress() {
    if (toggle) {
      toggle.onValueChange(!toggle.value);
      return;
    }
    onPress?.();
  }

  const interactive = Boolean(toggle || onPress);
  const showChevron = interactive && !toggle;

  const rowLabel =
    accessibilityLabel ?? (toggle ? `${label}${toggle.value ? ', ativado' : ', desativado'}` : value ? `${label}, ${value}` : label);

  const content = (
    <View style={styles.row}>
      <View style={styles.iconBox}>{icon}</View>
      {/* `value` fica EMBAIXO do rótulo (bloco de texto flex:1), nunca como irmão de
          largura fixa na mesma linha — ver [[bug_flex_fixo_espreme_texto_flex1_vizinho]]
          na memória da Lyra: um rótulo longo dividindo linha com interruptor/chevron
          espremeria a 1 palavra em telas estreitas. */}
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

  if (!interactive) {
    return (
      <SurfaceRaised style={styles.card} testID={testID}>
        {content}
      </SurfaceRaised>
    );
  }

  return (
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
  );
});

// Anel de foco de teclado em volta da linha inteira (é ela o alvo, não só o interruptor), FORA dela, com o raio do cartão.
const FOCUS_RING = focusRingStyle('outside', theme.radius.lg);

const styles = StyleSheet.create({
  card: {
    minHeight: theme.layout.touchTarget,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    // Borda iluminada de cima (direção de arte §4/§9 item 2). Fundo: item 6 (`SurfaceRaised`).
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
});
