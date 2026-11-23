import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { FileText, ShieldCheck, Trash2 } from 'lucide-react-native';
import { AppShell, ListRow, ScreenHeader, theme } from '@vuumbora/ui';

/**
 * M13 · "Privacidade e termos" — Termos de Uso e Política de Privacidade (reaproveita
 * `LegalDocumentScreen`, o mesmo componente/texto da criação da conta, com `backFallback`
 * apontando pra ESTA tela em vez de `/criar-conta`) + "Excluir conta" (leva a `/excluir-conta`,
 * fluxo real — `identity.deleteAccount`, igual ao da P13 do passageiro).
 */
export default function DriverPrivacyAndTermsScreen() {
  return (
    <AppShell scroll testID="privacidade-e-termos-screen">
      <View style={styles.content}>
        <ScreenHeader title="Privacidade e termos" onBack={() => router.back()} testID="privacidade-e-termos-header" />

        <View style={styles.rows}>
          <ListRow
            icon={<FileText size={20} color={theme.role.textSecondary} strokeWidth={1.75} />}
            label="Termos de uso"
            onPress={() => router.push('/privacidade-e-termos/termos')}
            testID="privacidade-e-termos-row-termos"
          />
          <ListRow
            icon={<ShieldCheck size={20} color={theme.role.textSecondary} strokeWidth={1.75} />}
            label="Política de Privacidade"
            onPress={() => router.push('/privacidade-e-termos/privacidade')}
            testID="privacidade-e-termos-row-privacidade"
          />
          <ListRow
            icon={<Trash2 size={20} color={theme.role.danger} strokeWidth={1.75} />}
            label="Excluir conta"
            onPress={() => router.push('/excluir-conta')}
            testID="privacidade-e-termos-row-excluir"
          />
        </View>
      </View>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  content: { gap: theme.spacing['4'] },
  rows: { gap: theme.spacing['2'] },
});
