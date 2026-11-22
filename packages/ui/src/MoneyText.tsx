import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { theme } from '@vuumbora/tokens';
import { tabularNums, textStyle, type TextSizeKey, type TextWeightKey } from './typography';

const BRL_FORMATTER = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** `Intl.NumberFormat` pt-BR (§10 do padrão premium: "Número em pt-BR"), num lugar só. */
export function formatBRL(value: number): string {
  return BRL_FORMATTER.format(value);
}

interface MoneyTextBaseProps {
  readonly value: number;
  readonly size?: TextSizeKey;
  readonly weight?: TextWeightKey;
  readonly color?: string;
  readonly testID?: string;
}

export type MoneyTextProps =
  | (MoneyTextBaseProps & {
      /** `false`/ausente: valor final (preço cobrado, ganho já pago). */
      readonly estimated?: false;
      readonly label?: string;
    })
  | (MoneyTextBaseProps & {
      /**
       * `true`: ainda não é o preço final — a TYPE exige `label` (ex.: "Preço estimado",
       * §10: "Estimativa é chamada de estimativa"). Impede, em tempo de compilação, o
       * defeito que o padrão premium proíbe: "R$ 23,90" sem rótulo antes da cotação real.
       */
      readonly estimated: true;
      readonly label: string;
    });

/**
 * C-10 (`docs/padrao-premium-telas.md` §15): junta `Intl.NumberFormat` pt-BR +
 * `tabularNums` (o número nunca "dança" ao atualizar) + rótulo pequeno em cima (regra N2,
 * §2: "rótulo pequeno em cima e número grande embaixo") — e, quando `estimated`, exige esse
 * rótulo já em tempo de compilação. Usar em todo preço, ETA em R$, total e ganho da tela.
 */
export const MoneyText = memo(function MoneyText({ value, label, size = 'subtitle', weight = 'bold', color, testID }: MoneyTextProps) {
  return (
    <View testID={testID}>
      {label ? <EstimateLabel>{label}</EstimateLabel> : null}
      <Text style={[textStyle(weight, size), tabularNums, { color: color ?? theme.role.textPrimary }]}>{formatBRL(value)}</Text>
    </View>
  );
});

export interface EstimateLabelProps {
  readonly children: string;
  readonly testID?: string;
}

/**
 * Rótulo pequeno para qualquer estimativa (não só dinheiro — ex.: "Chega em cerca de 5
 * min"). `MoneyText` usa por dentro; existe separado para o caso que não é `MoneyText`
 * (ETA em minutos, distância).
 */
export const EstimateLabel = memo(function EstimateLabel({ children, testID }: EstimateLabelProps) {
  return (
    <Text style={styles.label} numberOfLines={1} testID={testID}>
      {children}
    </Text>
  );
});

const styles = StyleSheet.create({
  label: { color: theme.role.textSecondary, ...textStyle('medium', 'caption'), marginBottom: theme.spacing['1'] },
});
