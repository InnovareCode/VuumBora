import { useState } from 'react';
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { ClipboardList, Home as HomeIcon, LogOut, User, Wallet } from 'lucide-react-native';
import {
  AppShell,
  Avatar,
  BottomTabBar,
  ConfirmDialog,
  ListRow,
  MockBadge,
  ScreenHeader,
  SurfaceRaised,
  theme,
  textStyle,
  type BottomTabBarItem,
} from '@vuumbora/ui';
import { useSession } from '../../src/session/SessionProvider';

/**
 * M13 PROVISÓRIA — só o suficiente para o motorista ter ALGUM caminho de sair da conta (decisão
 * do Atlas, 22/11/2026: "o app não pode ficar sem nenhum caminho de sair" — segurança de aparelho
 * compartilhado/troca de conta, e a Íris testa esse fluxo). A ficha completa da M13 (Perfil) ainda
 * não existe — quando existir, ESTA TELA é descartada, não evoluída (os campos aqui são só nome,
 * e-mail e o aviso de conta × cadastro; a M13 de verdade tem muito mais).
 *
 * Nome e e-mail são DEMONSTRAÇÃO (mesmo "Carlos Santos" da Home) — não existe `me()` ainda.
 * `router.replace` (não `push`) nas trocas de aba: evita empilhar Início/Perfil a cada toque,
 * já que ainda não há um navegador de abas de verdade (M06 a M14 não existem).
 */
export default function DriverProfileScreen() {
  const { signOut, mode: sessionMode } = useSession();
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  async function handleConfirmSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    await signOut(); // sempre sai localmente, mesmo sem servidor; a guarda de rota manda para /entrar sozinha
    // Sem `setSigningOut(false)`/fechar o diálogo depois: a tela é desmontada pela guarda ao sair.
  }

  const tabs: readonly BottomTabBarItem[] = [
    { key: 'inicio', label: 'Início', icon: ({ color, active }) => <HomeIcon size={22} color={color} strokeWidth={active ? 2.25 : 1.75} />, onPress: () => router.replace('/') },
    { key: 'ganhos', label: 'Ganhos', icon: ({ color, active }) => <Wallet size={22} color={color} strokeWidth={active ? 2.25 : 1.75} />, onPress: () => {} },
    {
      key: 'historico',
      label: 'Histórico',
      icon: ({ color, active }) => <ClipboardList size={22} color={color} strokeWidth={active ? 2.25 : 1.75} />,
      onPress: () => {},
    },
    { key: 'perfil', label: 'Perfil', icon: ({ color, active }) => <User size={22} color={color} strokeWidth={active ? 2.25 : 1.75} />, onPress: () => {} },
  ];

  return (
    <AppShell scroll glow footer={<BottomTabBar items={tabs} activeKey="perfil" testID="driver-tab-bar" />} testID="perfil-screen">
      <View style={styles.content}>
        <ScreenHeader title="Perfil" testID="perfil-header" />
        <Text style={styles.provisionalNote}>Tela provisória, até a M13 existir.</Text>

        <SurfaceRaised style={styles.profileCard} testID="perfil-card">
          <Avatar name="Carlos Santos" size="lg" />
          <View style={styles.profileText}>
            <Text style={styles.profileName} numberOfLines={1}>
              Carlos Santos
            </Text>
            <Text style={styles.profileEmail} numberOfLines={1}>
              carlos.santos@exemplo.com
            </Text>
          </View>
        </SurfaceRaised>
        {sessionMode === 'mock' ? <MockBadge label="dados de exemplo" testID="perfil-mock-badge" /> : null}

        <ListRow
          icon={<LogOut size={20} color={theme.role.dangerFill} strokeWidth={1.75} />}
          label="Sair da conta"
          onPress={() => setConfirmVisible(true)}
          accessibilityLabel="Sair da conta"
          testID="perfil-sign-out-row"
        />
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
  provisionalNote: { color: theme.role.textMuted, ...textStyle('regular', 'caption') },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing['3'],
    borderRadius: theme.radius.lg,
    borderTopColor: theme.role.edgeTop,
    borderColor: theme.role.edgeBottom,
    borderWidth: 1,
    padding: theme.spacing['4'],
  },
  profileText: { flex: 1, gap: 2 },
  profileName: { color: theme.role.textPrimary, ...textStyle('bold', 'subtitle') },
  profileEmail: { color: theme.role.textSecondary, ...textStyle('regular', 'small') },
});
