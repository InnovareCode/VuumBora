import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { HelpCircle, LogOut, Shield, User } from 'lucide-react-native';
import {
  AppShell,
  Avatar,
  BottomTabBar,
  ConfirmDialog,
  DangerButton,
  InlineAlert,
  LinkButton,
  ListRow,
  LoadingSkeleton,
  MockBadge,
  ScreenHeader,
  theme,
  textStyle,
} from '@vuumbora/ui';
import { buildDriverTabs } from '../../src/navigation/driverTabs';
import { useSession } from '../../src/session/SessionProvider';

const DRIVER_NAME = 'Carlos Santos';
const CADASTRO_FACT = 'O cadastro de motorista é outra etapa e só abre depois que as regras de taxa e repasse forem publicadas.';

type DevState = 'carregando' | 'erro' | 'aprovado';

function isDevState(value: string | undefined): value is DevState {
  return value === 'carregando' || value === 'erro' || value === 'aprovado';
}

/**
 * M13 — Perfil e documentos (motorista), sobre `docs/fichas-de-tela/M13-perfil-e-documentos.md`.
 * Substitui a M13 PROVISÓRIA da onda 2 (que o próprio arquivo mandava descartar quando esta ficha
 * existisse — `[[project_m05_onda2_painel_motorista]]`): corrige as 5 lacunas que a ficha §11
 * listava (tela provisória; "Sair" como linha; abas sem ação; nome/e-mail de exemplo; sem estado
 * do cadastro).
 *
 * Linhas por PP-15 ("sem destino real não aparece"): só **Dados pessoais**, **Privacidade e
 * termos** e **Ajuda e suporte** entram — Veículo, Documentos (decisão 9), Forma de recebimento
 * (D-25) e Notificações (D5) ficam de fora até a decisão/dado existir.
 *
 * Avatar `lg` (64pt), não os 88pt da prancha: `packages/ui` `Avatar` só tem `sm`/`md`/`lg` — pedido
 * de tamanho novo é mudança de DS, fora da zona desta fatia (mesma régua do `VehicleIconBox`/C-11
 * em `DriverTripRow`). A própria ficha já aceita 64 em 320×568 (§2), então um só tamanho em toda
 * largura simplifica sem contrariar a ficha.
 */
export default function DriverProfileScreen() {
  const { signOut, mode: sessionMode } = useSession();
  const { devEstado } = useLocalSearchParams<{ devEstado?: string }>();
  const forcedState = __DEV__ && isDevState(devEstado) ? devEstado : undefined;

  const [confirmVisible, setConfirmVisible] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [erroSimulado, setErroSimulado] = useState(forcedState === 'erro');

  const loading = forcedState === 'carregando';
  const erro = forcedState === 'erro' ? erroSimulado : false;
  const approved = forcedState === 'aprovado';

  async function handleConfirmSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    await signOut(); // sempre sai localmente, mesmo sem servidor; a guarda de rota manda para /entrar sozinha
    // Sem `setSigningOut(false)`/fechar o diálogo depois: a tela é desmontada pela guarda ao sair.
  }

  const tabs = buildDriverTabs('perfil');

  return (
    <AppShell scroll glow footer={<BottomTabBar items={tabs} activeKey="perfil" testID="driver-tab-bar" />} testID="perfil-screen">
      <View style={styles.content}>
        <ScreenHeader title="Meu Perfil" testID="perfil-header" />

        {loading ? (
          <View style={styles.headerCarregando} testID="perfil-carregando">
            <LoadingSkeleton variant="circle" height={64} />
            <LoadingSkeleton variant="line" width={160} />
            <LoadingSkeleton variant="block" height={56} />
          </View>
        ) : (
          <>
            <View style={styles.headerBlock}>
              <Avatar name={erro ? 'Motorista' : DRIVER_NAME} size="lg" testID="perfil-avatar" />
              <Text style={styles.name} numberOfLines={2}>
                {erro ? 'Motorista' : DRIVER_NAME}
              </Text>
              <Text style={styles.rating} testID="perfil-rating">
                {approved ? '★ 4,9 · 436 avaliações' : 'Sem avaliações ainda'}
              </Text>
            </View>

            {erro ? (
              <InlineAlert tone="danger" message="Não foi possível carregar seus dados." testID="perfil-erro">
                <LinkButton
                  label="Tentar de novo"
                  role="button"
                  align="flex-start"
                  onPress={() => setErroSimulado(false)}
                  testID="perfil-erro-tentar-de-novo"
                />
              </InlineAlert>
            ) : !approved ? (
              <InlineAlert
                tone="info"
                title="Cadastro de motorista ainda não aberto"
                message={CADASTRO_FACT}
                announce={false}
                testID="perfil-registration-notice"
              />
            ) : null}
          </>
        )}

        <View style={styles.rows}>
          <ListRow
            icon={<User size={20} color={theme.role.textSecondary} strokeWidth={1.75} />}
            label="Dados pessoais"
            onPress={() => router.push('/perfil/dados')}
            testID="perfil-row-dados"
          />
          <ListRow
            icon={<Shield size={20} color={theme.role.textSecondary} strokeWidth={1.75} />}
            label="Privacidade e termos"
            onPress={() => router.push('/privacidade-e-termos')}
            testID="perfil-row-privacidade"
          />
          <ListRow
            icon={<HelpCircle size={20} color={theme.role.textSecondary} strokeWidth={1.75} />}
            label="Ajuda e suporte"
            onPress={() => router.push('/suporte')}
            testID="perfil-row-suporte"
          />
        </View>

        <View style={styles.signOutBlock}>
          <DangerButton
            label="Sair da conta"
            icon={<LogOut size={20} color={theme.role.danger} strokeWidth={1.75} />}
            onPress={() => setConfirmVisible(true)}
            testID="perfil-sign-out-button"
          />
          {sessionMode === 'mock' ? <MockBadge label="dados de exemplo" testID="perfil-mock-badge" /> : null}
        </View>
      </View>

      <ConfirmDialog
        visible={confirmVisible}
        title="Sair da conta?"
        description="Você vai precisar entrar de novo para usar o aplicativo."
        confirmLabel="Sair"
        cancelLabel="Cancelar"
        destructive
        loading={signingOut}
        onConfirm={() => void handleConfirmSignOut()}
        onCancel={() => setConfirmVisible(false)}
        testID="perfil-sign-out-dialog"
      />
    </AppShell>
  );
}

const styles = StyleSheet.create({
  content: { gap: theme.spacing['5'] },
  headerCarregando: { alignItems: 'center', gap: theme.spacing['3'] },
  headerBlock: { alignItems: 'center', gap: theme.spacing['1'] },
  name: { color: theme.role.textPrimary, ...textStyle('bold', 'title'), textAlign: 'center' },
  rating: { color: theme.role.textSecondary, ...textStyle('medium', 'small') },
  rows: { gap: theme.spacing['2'] },
  signOutBlock: { gap: theme.spacing['2'] },
});
