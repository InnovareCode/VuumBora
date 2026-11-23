import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Hash, User } from 'lucide-react-native';
import { AppShell, InlineAlert, ListRow, LoadingSkeleton, ScreenHeader, SecondaryButton, theme } from '@vuumbora/ui';
import { useAccountSummary } from '../../../src/identity/useAccountSummary';

/**
 * `/perfil/dados` — "Meus dados" (ficha P13 §2.1, linha "Meus dados"), só LEITURA: edição
 * depende de `PATCH /v1/me`, que não existe no contrato ainda (ficha). Mostra o que
 * `GET /me` de verdade devolve — **não** o que a prancha pedia: o contrato
 * (`AccountSummary`, `packages/api-client`) não tem e-mail, telefone nem data de nascimento,
 * só nome completo e ID público. Reportado como pendência no handoff, não inventado aqui.
 */
export default function MyDataScreen() {
  const { state, retry } = useAccountSummary();

  return (
    <AppShell scroll glow testID="my-data-screen">
      <View style={styles.content}>
        <ScreenHeader title="Meus dados" onBack={() => router.back()} testID="my-data-header" />

        {state.status === 'loading' ? (
          <LoadingSkeleton variant="block" height={56} lines={2} testID="my-data-loading" />
        ) : state.status === 'error' ? (
          <View style={styles.errorBlock} testID="my-data-error">
            <InlineAlert tone="danger" message="Não foi possível carregar seus dados." />
            <SecondaryButton label="Tentar de novo" onPress={retry} testID="my-data-retry" />
          </View>
        ) : (
          <View style={styles.list} testID="my-data-list">
            <ListRow icon={<NameGlyph />} label="Nome completo" value={state.account.fullName} valueLines={2} testID="my-data-name" />
            <ListRow icon={<IdGlyph />} label="ID público" value={state.account.publicId} testID="my-data-public-id" />
          </View>
        )}
      </View>
    </AppShell>
  );
}

// Ícones triviais: só a cor-padrão de ícone de linha (`textSecondary`, D-30).
function NameGlyph() {
  return <User size={20} color={theme.role.textSecondary} strokeWidth={1.75} />;
}
function IdGlyph() {
  return <Hash size={20} color={theme.role.textSecondary} strokeWidth={1.75} />;
}

const styles = StyleSheet.create({
  content: { gap: theme.spacing['4'] },
  list: { gap: theme.spacing['2'] },
  errorBlock: { gap: theme.spacing['3'] },
});
