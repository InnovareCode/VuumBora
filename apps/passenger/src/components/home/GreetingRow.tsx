import { memo } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { MockBadge, theme, textStyle } from '@vuumbora/ui';

export interface GreetingRowProps {
  /** Nome exibido — dado de DEMONSTRAÇÃO enquanto não há sessão autenticada real. */
  readonly passengerName: string;
}

const NARROW_BREAKPOINT = 360;

/**
 * Saudação + pergunta da tela (N2 da hierarquia, `docs/fichas-de-tela/P03-inicio.md` §2/§3):
 * "Olá, {nome}!" em `subtitle`, "Para onde vamos hoje?" em `title` bold — é a resposta que a
 * Home existe para dar, não um cartão de perfil. Substitui a versão anterior (avatar + rótulo
 * "Passageira VuumBora"), que não vinha da ficha/prancha.
 *
 * < 360pt (ficha, estado "320×568"): some a linha "Olá, {nome}!" e o título encurta para
 * "Para onde vamos?" — cabe em 1 linha sem o nome disputar espaço com o título.
 */
export const GreetingRow = memo(function GreetingRow({ passengerName }: GreetingRowProps) {
  const { width } = useWindowDimensions();
  const narrow = width < NARROW_BREAKPOINT;

  return (
    <View style={styles.block}>
      {narrow ? null : (
        <View style={styles.greetingRow}>
          {/* Texto longo (G-10): nome de até ~30 caracteres quebra em 2 linhas, nunca corta. */}
          <Text style={styles.greeting} numberOfLines={2}>
            Olá, {passengerName}!
          </Text>
          <MockBadge label="nome de exemplo" />
        </View>
      )}
      <Text style={styles.title} accessibilityRole="header" numberOfLines={2}>
        {narrow ? 'Para onde vamos?' : 'Para onde vamos hoje?'}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  block: { gap: theme.spacing['1'] },
  greetingRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing['2'], flexWrap: 'wrap' },
  greeting: { color: theme.role.textSecondary, ...textStyle('regular', 'subtitle') },
  title: { color: theme.role.textPrimary, ...textStyle('bold', 'title') },
});
