import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { tabularNums, textStyle, theme, tokens, useSecondsUntil } from '@vuumbora/ui';

const SIZE = 44;
const STROKE = 3;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
/** Últimos 5 s: `role.warning`, nunca cor sozinha — o número continua lendo o segundo certo. */
const WARNING_THRESHOLD_S = 5;

export interface OfferCountdownProps {
  /** Vem do servidor (`RideOffer.expiresAt`, M06 §0): o contador visual NUNCA é fonte de verdade. */
  readonly expiresAt: string;
  /** Duração total da oferta (§5.4: 15 s) — só para a fração do anel, não para decidir expiração. */
  readonly totalSeconds: number;
  readonly testID?: string;
}

/**
 * C-14 — anel de contagem regressiva da oferta (M06 §4): traço que esvazia de forma linear,
 * últimos 5 s em `role.warning`. `useSecondsUntil` (`@vuumbora/ui`) já resolve pelo INSTANTE
 * (`expiresAt`), não por um `setInterval` que recomeçaria do total ao reabrir a tela.
 */
export const OfferCountdown = memo(function OfferCountdown({ expiresAt, totalSeconds, testID }: OfferCountdownProps) {
  const secondsLeft = useSecondsUntil(Date.parse(expiresAt));
  const warning = secondsLeft <= WARNING_THRESHOLD_S;
  const fraction = totalSeconds > 0 ? Math.max(0, Math.min(1, secondsLeft / totalSeconds)) : 0;
  const color = warning ? theme.role.warning : theme.role.textPrimary;

  return (
    <View
      style={styles.root}
      testID={testID}
      accessibilityRole="timer"
      accessibilityLabel={`Tempo para responder: ${secondsLeft} segundos`}
      accessibilityLiveRegion={warning ? 'assertive' : 'none'}
    >
      <Svg width={SIZE} height={SIZE} style={StyleSheet.absoluteFill}>
        <Circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} stroke={tokens.color.border.default} strokeWidth={STROKE} fill="none" />
        <Circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          stroke={color}
          strokeWidth={STROKE}
          fill="none"
          strokeDasharray={`${CIRCUMFERENCE * fraction} ${CIRCUMFERENCE}`}
          strokeLinecap="round"
          rotation={-90}
          origin={`${SIZE / 2}, ${SIZE / 2}`}
        />
      </Svg>
      <Text style={[styles.text, { color }]}>{Math.max(secondsLeft, 0)}s</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  root: { width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },
  text: { ...textStyle('bold', 'caption'), ...tabularNums },
});
