import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Shield } from 'lucide-react-native';
import { AppShell, ListRow, ScreenHeader, SectionHeader, theme } from '@vuumbora/ui';
import { DangerLinkButton } from '../../src/components/shared/DangerLinkButton';

/**
 * P13b — Configurações (`docs/fichas-de-tela/P13-perfil-e-configuracoes.md` §2.2), onda 5 do
 * padrão premium. As lacunas da ficha eram todas de ENFEITE (chave que não liga nada de
 * verdade): Notificações e "Receber promoções" dependem de decisão/contrato que não existe
 * (push D5, consentimento de marketing D-15); "Localização em tempo real" dependia de
 * `expo-location`, que não está integrado no app (sem permissão real para refletir — reportado
 * como pendência, não fabricado); Tema e Idioma tinham UMA opção cada, sem alternativa real;
 * "Limpar cache" não apagava nada. Nenhuma delas é real hoje, então nenhuma entra (PP-15).
 * Resultado: a tela fica com só "Privacidade e termos" e "Excluir conta" — a própria ficha já
 * previa isso ("Prefiro vazia e verdadeira") e recomendava manter as duas telas separadas.
 */
export default function SettingsScreen() {
  return (
    <AppShell scroll glow testID="settings-screen">
      <View style={styles.content}>
        <ScreenHeader title="Configurações" onBack={() => router.back()} testID="settings-header" />

        <SectionHeader title="Conta" testID="settings-account-section" />
        <ListRow
          icon={<Shield size={20} color={theme.role.textSecondary} strokeWidth={1.75} />}
          label="Privacidade e termos"
          onPress={() => router.push('/privacidade-e-termos')}
          testID="settings-privacy"
        />

        <View style={styles.deleteRow}>
          <DangerLinkButton label="Excluir conta" onPress={() => router.push('/excluir-conta')} testID="settings-delete-account" />
        </View>
      </View>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  content: { gap: theme.spacing['4'] },
  deleteRow: { alignItems: 'center', marginTop: theme.spacing['3'] },
});
