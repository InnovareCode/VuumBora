import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { HelpCircle, Info, LogOut, Settings, Shield, User } from 'lucide-react-native';
import {
  AppShell,
  Avatar,
  ConfirmDialog,
  DangerButton,
  InlineAlert,
  ListRow,
  LoadingSkeleton,
  MockBadge,
  ScreenHeader,
  SecondaryButton,
  theme,
  textStyle,
  focusRingStyle,
  useKeyboardFocusRing,
} from '@vuumbora/ui';
import { useAccountSummary } from '../../src/identity/useAccountSummary';
import { useSession } from '../../src/session/SessionProvider';
import { useRideRequestStore } from '../../src/store/useRideRequestStore';

/**
 * P13 — Meu Perfil (`docs/fichas-de-tela/P13-perfil-e-configuracoes.md`), onda 5 do padrão
 * premium. Nome e ID público agora vêm de `identity.me()` de verdade (não mais
 * `MOCK_PASSENGER_PROFILE`) — ver `useAccountSummary`. **PP-15 aplicada**: das 7 linhas da
 * prancha só entram as que levam a algum lugar real hoje: Meus dados (`/perfil/dados`),
 * Privacidade e termos (`/privacidade-e-termos`, que também concentra "Segurança e privacidade"
 * e "Excluir conta" — ver aquela tela), Ajuda (`/ajuda`, P14, nova nesta onda) e Sobre o
 * VuumBora (`/sobre`, nova). Endereços favoritos, Preferências de viagem e Notificações ficaram
 * de fora (dependem de decisões/contratos que não existem: S3, D-08/D-09, D5) — nenhuma delas
 * mostra mais aviso de "indisponível", só não aparece (regra PP-15, decidida pelo Atlas).
 *
 * "Sair da conta" ganhou `ConfirmDialog` (lacuna #6 da ficha: o motorista já tinha, o
 * passageiro não).
 */
export default function ProfileScreen() {
  const { signOut, mode } = useSession();
  const startNewRide = useRideRequestStore((state) => state.startNewRide);
  const { state: account, retry } = useAccountSummary();
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  async function handleConfirmSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    startNewRide();
    await signOut(); // a tela é desmontada pela guarda ao sair; não há o que reativar depois
  }

  return (
    <AppShell scroll glow testID="profile-screen">
      <View style={styles.content}>
        <ScreenHeader
          title="Meu Perfil"
          onBack={() => router.back()}
          rightSlot={<SettingsButton onPress={() => router.push('/configuracoes')} />}
          testID="profile-header"
        />

        {account.status === 'loading' ? (
          <View style={styles.identityBlock} testID="profile-identity-loading">
            <LoadingSkeleton variant="circle" height={88} />
            <LoadingSkeleton lines={2} width="60%" />
          </View>
        ) : account.status === 'ready' ? (
          <View style={styles.identityBlock}>
            <Avatar name={account.account.fullName} size="lg" />
            <Text style={styles.name} numberOfLines={2}>
              {account.account.fullName}
            </Text>
            <Text style={styles.publicId} numberOfLines={1}>
              ID público: {account.account.publicId}
            </Text>
          </View>
        ) : (
          <View style={styles.identityBlock} testID="profile-identity-error">
            <InlineAlert tone="danger" message="Não foi possível carregar seus dados." />
            <SecondaryButton label="Tentar de novo" onPress={retry} testID="profile-identity-retry" />
          </View>
        )}

        <View style={styles.menu}>
          <ListRow
            icon={<User size={20} color={theme.role.textSecondary} strokeWidth={1.75} />}
            label="Meus dados"
            onPress={() => router.push('/perfil/dados')}
            testID="profile-menu-my-data"
          />
          <ListRow
            icon={<Shield size={20} color={theme.role.textSecondary} strokeWidth={1.75} />}
            label="Privacidade e termos"
            onPress={() => router.push('/privacidade-e-termos')}
            testID="profile-menu-privacy"
          />
          <ListRow
            icon={<HelpCircle size={20} color={theme.role.textSecondary} strokeWidth={1.75} />}
            label="Ajuda"
            onPress={() => router.push('/ajuda')}
            testID="profile-menu-help"
          />
          <ListRow
            icon={<Info size={20} color={theme.role.textSecondary} strokeWidth={1.75} />}
            label="Sobre o VuumBora"
            onPress={() => router.push('/sobre')}
            testID="profile-menu-about"
          />
        </View>

        <DangerButton
          label="Sair da conta"
          icon={<LogOut size={18} color={theme.role.textPrimary} strokeWidth={2} />}
          onPress={() => setConfirmVisible(true)}
          accessibilityLabel="Sair da conta"
          testID="profile-sign-out-button"
        />
        {mode === 'mock' ? (
          <View style={styles.signOutNotice}>
            <MockBadge label="sessão simulada, sem autenticação real" />
          </View>
        ) : null}
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
        testID="profile-sign-out-dialog"
      />
    </AppShell>
  );
}

interface SettingsButtonProps {
  readonly onPress: () => void;
}

/**
 * Abre Configurações, no `rightSlot` do `ScreenHeader`. Componente à parte (como o
 * "Voltar" do próprio `ScreenHeader`) porque o anel de foco de teclado exige o hook —
 * medido com a sonda da ferramenta de qualidade: sem ele o `outline` saía `auto` (padrão
 * do navegador, quase invisível sobre o fundo escuro, G-22).
 */
function SettingsButton({ onPress }: SettingsButtonProps) {
  const { focusVisible, focusProps } = useKeyboardFocusRing();
  return (
    <Pressable
      {...focusProps}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Abrir configurações"
      style={[styles.settingsButton, focusVisible && FOCUS_RING]}
      testID="profile-settings-button"
    >
      <Settings size={22} color={theme.role.textPrimary} strokeWidth={1.75} />
    </Pressable>
  );
}

const FOCUS_RING = focusRingStyle('inside', theme.radius.md);

const styles = StyleSheet.create({
  content: { gap: theme.spacing['5'] },
  settingsButton: {
    width: theme.layout.touchTarget,
    height: theme.layout.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identityBlock: { alignItems: 'center', gap: theme.spacing['1'] },
  name: { color: theme.role.textPrimary, ...textStyle('bold', 'title'), marginTop: theme.spacing['2'] },
  publicId: { color: theme.role.textSecondary, ...textStyle('regular', 'small') },
  menu: { gap: theme.spacing['2'] },
  signOutNotice: { alignItems: 'center' },
});
