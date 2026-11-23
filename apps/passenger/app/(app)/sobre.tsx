import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import { FileText } from 'lucide-react-native';
import { AppShell, BrandLogo, ListRow, ScreenHeader, SurfaceRaised, theme, textStyle, tabularNums } from '@vuumbora/ui';

const COMPANY_NAME = 'Innovare Code';
// CNPJ é dado público de identificação da empresa (nunca segredo): `docs/decisoes-do-dono.md`,
// "Identificação da empresa" (18/11/2026). Cidade: "a confirmar" no mesmo registro — não
// aparece aqui até ser confirmada (nenhum texto fica melhor com um placeholder).
const COMPANY_CNPJ = '09.813.446/0001-00';

/** `/sobre` — Sobre o VuumBora (ficha P13 §2.1, linha "Sobre o VuumBora"): versão do app e
 * empresa responsável (`docs/decisoes-do-dono.md`), com os mesmos links de "Privacidade e
 * termos". Tela nova. */
export default function AboutScreen() {
  const version = Constants.expoConfig?.version ?? '—';

  return (
    <AppShell scroll glow testID="about-screen">
      <View style={styles.content}>
        <ScreenHeader title="Sobre o VuumBora" onBack={() => router.back()} testID="about-header" />

        <View style={styles.logoBlock}>
          <BrandLogo size="md" />
          <Text style={[styles.version, tabularNums]} testID="about-version">
            Versão {version}
          </Text>
        </View>

        <SurfaceRaised style={styles.companyCard} testID="about-company-card">
          <Text style={styles.companyLabel}>Empresa responsável</Text>
          <Text style={styles.companyName}>{COMPANY_NAME}</Text>
          <Text style={styles.companyDetail}>CNPJ {COMPANY_CNPJ}</Text>
        </SurfaceRaised>

        <View style={styles.menu}>
          <ListRow
            icon={<FileText size={20} color={theme.role.textSecondary} strokeWidth={1.75} />}
            label="Termos de Uso e Política de Privacidade"
            onPress={() => router.push('/privacidade-e-termos')}
            testID="about-legal-row"
          />
        </View>
      </View>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  content: { gap: theme.spacing['5'] },
  logoBlock: { alignItems: 'center', gap: theme.spacing['2'] },
  version: { color: theme.role.textSecondary, ...textStyle('medium', 'small') },
  companyCard: {
    gap: theme.spacing['1'],
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderTopColor: theme.role.edgeTop,
    borderColor: theme.role.edgeBottom,
    padding: theme.spacing['4'],
  },
  companyLabel: { color: theme.role.textMuted, ...textStyle('semibold', 'caption') },
  companyName: { color: theme.role.textPrimary, ...textStyle('bold', 'body') },
  companyDetail: { color: theme.role.textSecondary, ...textStyle('regular', 'small') },
  menu: { gap: theme.spacing['2'] },
});
