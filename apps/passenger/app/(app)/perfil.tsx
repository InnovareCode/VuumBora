import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import {
  HelpCircle,
  Info,
  LogOut,
  MapPin,
  Settings,
  Shield,
  SlidersHorizontal,
  Bell as BellIcon,
  User,
} from 'lucide-react-native';
import { AppShell, DangerButton, MockBadge, ScreenHeader, theme, textStyle } from '@vuumbora/ui';
import { EditableAvatar } from '../../src/components/profile/EditableAvatar';
import { ListMenuRow } from '../../src/components/shared/ListMenuRow';
import { MOCK_PASSENGER_PROFILE } from '../../src/data/mockPassengerProfile';
import { useSession } from '../../src/session/SessionProvider';
import { useRideRequestStore } from '../../src/store/useRideRequestStore';

/**
 * P13 — Perfil do passageiro (VuumBora_Claude_Design_System/referencias/premium/
 * passageiro/P13-perfil.webp). Nenhuma das seções abaixo tem tela própria ainda —
 * o toque revela `UnavailableNoticeBanner` (dentro de `ListMenuRow`) em vez de navegar
 * para rota vazia. "Sair da conta" chama o logout do cliente de identidade (`useSession().signOut`): o
 * aparelho sai SEMPRE (mesmo sem rede) e o servidor é avisado se der; a guarda de `app/_layout.tsx`
 * desmonta `(app)` e volta para a P01. Limpa também a jornada de corrida em memória, para a próxima
 * sessão não herdar destino/avaliação da anterior. Nome e telefone abaixo ainda são exemplo (C1 liga
 * `GET /v1/auth/me`).
 */
export default function ProfileScreen() {
  const { signOut, mode } = useSession();
  const startNewRide = useRideRequestStore((state) => state.startNewRide);
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    startNewRide();
    await signOut(); // a tela é desmontada pela guarda ao sair; não há o que reativar depois
  }

  return (
    <AppShell scroll glow>
      <View style={styles.content}>
        <ScreenHeader
          title="Meu Perfil"
          onBack={() => router.back()}
          rightSlot={
            <Pressable
              onPress={() => router.push('/configuracoes')}
              accessibilityRole="button"
              accessibilityLabel="Abrir configurações"
              style={styles.settingsButton}
              testID="profile-settings-button"
            >
              <Settings size={22} color={theme.role.textPrimary} strokeWidth={1.75} />
            </Pressable>
          }
          testID="profile-header"
        />

        <EditableAvatar name={MOCK_PASSENGER_PROFILE.name} testID="profile-avatar" />

        <View style={styles.identityBlock}>
          <Text style={styles.name} numberOfLines={1}>
            {MOCK_PASSENGER_PROFILE.name}
          </Text>
          <Text style={styles.phone} numberOfLines={1}>
            {MOCK_PASSENGER_PROFILE.phoneLabel}
          </Text>
          <MockBadge label="dados de exemplo" />
        </View>

        <View style={styles.menu}>
          <ListMenuRow
            icon={<User size={20} color={theme.role.ctaBackground} strokeWidth={1.75} />}
            label="Meus dados"
            unavailableMessage="Edição de dados pessoais ainda não está disponível nesta versão."
            testID="profile-menu-my-data"
          />
          <ListMenuRow
            icon={<MapPin size={20} color={theme.role.ctaBackground} strokeWidth={1.75} />}
            label="Endereços favoritos"
            unavailableMessage="Gestão de endereços favoritos ainda não está disponível nesta versão."
            testID="profile-menu-addresses"
          />
          <ListMenuRow
            icon={<SlidersHorizontal size={20} color={theme.role.ctaBackground} strokeWidth={1.75} />}
            label="Preferências de viagem"
            unavailableMessage="Preferências de viagem ainda não estão disponíveis nesta versão."
            testID="profile-menu-preferences"
          />
          <ListMenuRow
            icon={<Shield size={20} color={theme.role.ctaBackground} strokeWidth={1.75} />}
            label="Segurança e privacidade"
            unavailableMessage="Segurança e privacidade ainda não estão disponíveis nesta versão."
            testID="profile-menu-security"
          />
          <ListMenuRow
            icon={<BellIcon size={20} color={theme.role.ctaBackground} strokeWidth={1.75} />}
            label="Notificações"
            unavailableMessage="Preferências de notificação detalhadas ainda não estão disponíveis — use a tela de Configurações para ligar/desligar."
            testID="profile-menu-notifications"
          />
          <ListMenuRow
            icon={<HelpCircle size={20} color={theme.role.ctaBackground} strokeWidth={1.75} />}
            label="Ajuda e suporte"
            unavailableMessage="Central de ajuda ainda não está disponível nesta versão."
            testID="profile-menu-help"
          />
          <ListMenuRow
            icon={<Info size={20} color={theme.role.ctaBackground} strokeWidth={1.75} />}
            label="Sobre o VuumBora"
            unavailableMessage="Tela 'Sobre' ainda não está disponível nesta versão."
            testID="profile-menu-about"
          />
        </View>

        <DangerButton
          label="Sair da conta"
          icon={<LogOut size={18} color={theme.role.textPrimary} strokeWidth={2} />}
          onPress={() => void handleSignOut()}
          loading={signingOut}
          accessibilityLabel="Sair da conta"
          testID="profile-sign-out-button"
        />
        {mode === 'mock' ? (
          <View style={styles.signOutNotice}>
            <MockBadge label="sessão simulada, sem autenticação real" />
          </View>
        ) : null}
      </View>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  content: { gap: theme.spacing['5'] },
  settingsButton: {
    width: theme.layout.touchTarget,
    height: theme.layout.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identityBlock: { alignItems: 'center', gap: theme.spacing['1'] },
  name: { color: theme.role.textPrimary, ...textStyle('bold', 'title') },
  phone: { color: theme.role.textSecondary, ...textStyle('regular', 'body') },
  menu: { gap: theme.spacing['2'] },
  signOutNotice: { alignItems: 'center' },
});
