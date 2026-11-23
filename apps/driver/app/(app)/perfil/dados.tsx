import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { AppShell, ListRow, MockBadge, ScreenHeader, theme } from '@vuumbora/ui';
import { useSession } from '../../../src/session/SessionProvider';

const DRIVER_NAME = 'Carlos Santos';
const DRIVER_EMAIL = 'carlos.santos@exemplo.com';
const DRIVER_PUBLIC_ID = 'MOT-2K9F';
const DRIVER_BIRTH_DATE = '14/03/1991';

/**
 * M13 · "Dados pessoais" — só leitura (ficha: "nome, e-mail, ID público e data de nascimento de
 * `GET /v1/me`"). Esse endpoint não existe ainda (pendência B2/Vega); os 4 campos ficam
 * demonstração, com o selo. Sem edição nesta tela — a ficha não pede (e editar e-mail, por
 * exemplo, reabriria verificação, fora do escopo aqui).
 */
export default function DriverPersonalDataScreen() {
  const { mode: sessionMode } = useSession();

  return (
    <AppShell scroll testID="perfil-dados-screen">
      <View style={styles.content}>
        <ScreenHeader title="Dados pessoais" onBack={() => router.back()} testID="perfil-dados-header" />

        <View style={styles.rows}>
          <ListRow icon={<Dot />} label="Nome" value={DRIVER_NAME} testID="perfil-dados-nome" />
          <ListRow icon={<Dot />} label="E-mail" value={DRIVER_EMAIL} testID="perfil-dados-email" />
          <ListRow icon={<Dot />} label="ID público" value={DRIVER_PUBLIC_ID} testID="perfil-dados-id" />
          <ListRow icon={<Dot />} label="Data de nascimento" value={DRIVER_BIRTH_DATE} testID="perfil-dados-nascimento" />
        </View>

        {sessionMode === 'mock' ? <MockBadge label="dados de exemplo" testID="perfil-dados-mock-badge" /> : null}
      </View>
    </AppShell>
  );
}

/** Marcador neutro no lugar de um ícone por campo — a ficha não pede ícone diferente por linha aqui. */
function Dot() {
  return <Text style={styles.dot}>•</Text>;
}

const styles = StyleSheet.create({
  content: { gap: theme.spacing['4'] },
  rows: { gap: theme.spacing['2'] },
  dot: { color: theme.role.textMuted, fontSize: 18 },
});
