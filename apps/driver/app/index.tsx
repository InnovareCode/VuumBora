import { StyleSheet, Text, View } from 'react-native';
import { theme } from '@vuumbora/ui';

/** Marcador de fundação: só prova que o app sobe com o tema. Não é tela de produto. */
export default function FoundationPlaceholder() {
  return (
    <View style={styles.root} accessibilityRole="summary">
      <Text style={styles.title}>VuumBora Motorista</Text>
      <Text style={styles.note}>Fundação do monorepo — nenhuma tela implementada.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'center',
    padding: theme.layout.screenPadding,
    backgroundColor: theme.role.screen,
  },
  title: {
    color: theme.role.textPrimary,
    fontSize: theme.typography.size.title,
    fontWeight: theme.typography.weight.bold,
  },
  note: {
    marginTop: theme.spacing['2'],
    color: theme.role.textSecondary,
    fontSize: theme.typography.size.small,
  },
});
