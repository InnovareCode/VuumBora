import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  BarChart3,
  Car,
  ClipboardList,
  Headphones,
  Home as HomeIcon,
  Navigation,
  User,
  Wallet,
} from 'lucide-react-native';
import { AppShell, BottomTabBar, MockBadge, SecondaryButton, driverDemoAvatarSource, theme, type BottomTabBarItem } from '@vuumbora/ui';
import { RegistrationNotice } from '../../src/components/auth/RegistrationNotice';
import { DriverHeader } from '../../src/components/home/DriverHeader';
import { DriverProfileRow } from '../../src/components/home/DriverProfileRow';
import { OnlineToggle } from '../../src/components/home/OnlineToggle';
import { DriverMapPreview } from '../../src/components/home/DriverMapPreview';
import { HighDemandBanner } from '../../src/components/home/HighDemandBanner';
import { DailySummarySection } from '../../src/components/home/DailySummarySection';
import { NewRideOfferCard } from '../../src/components/home/NewRideOfferCard';
import { QuickActionsRow, type QuickActionItem } from '../../src/components/home/QuickActionsRow';
import { useSession } from '../../src/session/SessionProvider';

const OFFER_COUNTDOWN_SECONDS = 15;

const QUICK_ACTIONS: readonly QuickActionItem[] = [
  { key: 'navegar', label: 'Navegar', subtitle: '(GPS)', icon: <Navigation size={20} color={theme.role.ctaBackground} strokeWidth={1.75} /> },
  { key: 'historico', label: 'Histórico', subtitle: 'de corridas', icon: <ClipboardList size={20} color={theme.role.ctaBackground} strokeWidth={1.75} /> },
  { key: 'suporte', label: 'Suporte', subtitle: 'Ajuda e contato', icon: <Headphones size={20} color={theme.role.ctaBackground} strokeWidth={1.75} /> },
];

/**
 * M05 — Dashboard do motorista (VuumBora_Claude_Design_System/referencias/motorista_home.png).
 * Tela só de UI: nenhuma ação abaixo (toggle online, aceitar/recusar oferta, atalhos,
 * abas) chama uma API real ainda — não existe contrato/endpoint definido (pendência
 * para Vega). Duas regras de domínio (MOTORISTA.md) que o CÓDIGO respeita, não só a
 * aparência: `registrationApproved` bloqueia o toggle online (ver `OnlineToggle`), e o
 * contador da oferta é só demonstração local — quem expira de verdade é o servidor.
 *
 * Quem chega aqui tem uma CONTA de motorista (identidade, B2), não um cadastro de motorista aprovado: o
 * `RegistrationNotice` diz isso e o resto da tela segue marcado como exemplo. "Sair da conta" é o logout do cliente de
 * identidade (`useSession().signOut`): o aparelho sai SEMPRE (mesmo sem rede) e o servidor é avisado se der.
 */
export default function DriverHomeScreen() {
  const { signOut, mode: sessionMode } = useSession();
  const [signingOut, setSigningOut] = useState(false);
  const [online, setOnline] = useState(true);
  const [secondsRemaining, setSecondsRemaining] = useState(OFFER_COUNTDOWN_SECONDS);

  // DEMO: cadastro/documentação aprovados viria de uma sessão real (M04). Fixo em
  // `true` aqui só para a tela ficar navegável sem backend — nunca usar como estado
  // de produção.
  const registrationApproved = true;

  // Contador de DEMONSTRAÇÃO: conta até 0 e para. Não decide nada sozinho (não
  // recusa a oferta automaticamente) — a regra "quem expira é o servidor" fica
  // explícita no MockBadge do próprio card.
  useEffect(() => {
    const interval = setInterval(() => {
      setSecondsRemaining((current) => (current > 0 ? current - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    await signOut(); // a tela é desmontada pela guarda ao sair; não há o que reativar depois
  }

  const tabs: readonly BottomTabBarItem[] = [
    { key: 'inicio', label: 'Início', icon: ({ color, active }) => <HomeIcon size={22} color={color} strokeWidth={active ? 2.25 : 1.75} />, onPress: () => {} },
    { key: 'corridas', label: 'Corridas', icon: ({ color, active }) => <Car size={22} color={color} strokeWidth={active ? 2.25 : 1.75} />, onPress: () => {} },
    { key: 'ganhos', label: 'Ganhos', icon: ({ color, active }) => <Wallet size={22} color={color} strokeWidth={active ? 2.25 : 1.75} />, onPress: () => {} },
    {
      key: 'desempenho',
      // "Desempenho" (79px) estoura os 72px de cada uma das 5 abas a 360px (medido) —
      // "Métricas" (51px) cabe com folga e descreve o mesmo conteúdo (avaliação/taxa de aceitação).
      label: 'Métricas',
      icon: ({ color, active }) => <BarChart3 size={22} color={color} strokeWidth={active ? 2.25 : 1.75} />,
      onPress: () => {},
    },
    { key: 'perfil', label: 'Perfil', icon: ({ color, active }) => <User size={22} color={color} strokeWidth={active ? 2.25 : 1.75} />, onPress: () => {} },
  ];

  return (
    <AppShell scroll footer={<BottomTabBar items={tabs} activeKey="inicio" testID="driver-tab-bar" />}>
      <View style={styles.content}>
        <DriverHeader notificationCount={3} />
        {sessionMode === 'mock' ? (
          <MockBadge label="acesso simulado, sem autenticação real" testID="simulated-access-badge" />
        ) : null}
        <RegistrationNotice context="home" testID="home-registration-notice" />
        <DriverProfileRow driverName="Carlos Santos" approved={registrationApproved} avatarSource={driverDemoAvatarSource} />
        <OnlineToggle online={online} approved={registrationApproved} onToggle={setOnline} />
        <DriverMapPreview cityLabel="São Paulo - SP" />
        <HighDemandBanner />

        <DailySummarySection earningsLabel="R$ 247,90" ridesLabel="12" ratingLabel="4,95" acceptanceLabel="92%" />

        <NewRideOfferCard
          passengerName="Ana Oliveira"
          pickupDistanceLabel="2,3 km até o embarque"
          pickupAddress="Rua Haddock Lobo, 347 – Cerqueira César"
          destinationLabel="Itaim Bibi – SP"
          priceLabel="R$ 32,40"
          surgeLabel="Dinâmica +20%"
          secondsRemaining={secondsRemaining}
          onAccept={() => {}}
          onDecline={() => {}}
        />

        <QuickActionsRow items={QUICK_ACTIONS} />

        {/* ANDAIME: o "Sair" ainda não tem lugar na referência da M05 (a aba Perfil não navega). Vira item da tela de
            perfil/menu do motorista (M13) quando ela existir; o logout em si já é o real. */}
        <SecondaryButton
          label="Sair da conta"
          onPress={() => void handleSignOut()}
          loading={signingOut}
          accessibilityLabel="Sair da conta"
          testID="driver-sign-out-button"
        />
      </View>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  content: { gap: theme.spacing['5'] },
});
