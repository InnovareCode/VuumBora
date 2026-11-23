import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { AppShell, BottomTabBar, MockBadge, theme } from '@vuumbora/ui';
import { buildDriverTabs } from '../../src/navigation/driverTabs';
import { RegistrationNotice } from '../../src/components/auth/RegistrationNotice';
import { DriverHeader } from '../../src/components/home/DriverHeader';
import { OnlineToggle } from '../../src/components/home/OnlineToggle';
import { DriverMapPreview } from '../../src/components/home/DriverMapPreview';
import { DailySummarySection } from '../../src/components/home/DailySummarySection';
import { useSession } from '../../src/session/SessionProvider';

/**
 * M05 — Painel do motorista (Home), reescrito na onda 2 ("casa") do padrão premium
 * sobre a ficha `docs/fichas-de-tela/M05-painel-do-motorista.md` e o alvo visual de
 * 22/11 (recorte "Dashboard Inicial"). Tela só de UI: nenhuma ação abaixo (ficar
 * online, abas) chama uma API real ainda — não existe contrato/endpoint definido
 * (pendência para Vega). A regra de domínio que o CÓDIGO respeita, não só a
 * aparência: `registrationApproved` bloqueia o toggle online (ver `OnlineToggle`),
 * e a troca de status só comita DEPOIS de uma confirmação simulada (sem
 * otimismo, `MOTORISTA.md`) — ver `handleToggleOnline`.
 *
 * O que saiu desta tela nesta rodada (ficha §11, lacunas 2/3/4/5/6/8 — layout da
 * prancha não tem nenhum destes blocos): banner "Alta demanda" (promoção
 * fabricada), oferta de corrida embutida (PP-4: vira tela cheia M06, que ainda não
 * existe — ver PENDÊNCIAS do handoff) e atalhos (Navegar/Histórico/Suporte). O
 * botão "Sair da conta" saiu DAQUI — mas o app continua com um caminho de sair:
 * a aba Perfil abre `perfil.tsx`, uma M13 PROVISÓRIA só com o essencial (decisão
 * do Atlas, 22/11/2026 — segurança de aparelho compartilhado/troca de conta).
 *

 * Quem chega aqui tem uma CONTA de motorista (identidade, B2), não um cadastro de
 * motorista aprovado: o `RegistrationNotice` diz isso e o resto da tela segue
 * marcado como exemplo.
 */
export default function DriverHomeScreen() {
  const { mode: sessionMode } = useSession();
  const { devAprovado } = useLocalSearchParams<{ devAprovado?: string }>();
  const [online, setOnline] = useState(false);
  const [togglingOnline, setTogglingOnline] = useState(false);

  // DEMO: cadastro/documentação aprovados viria de uma sessão real (M04) — a identidade de hoje
  // não carrega esse dado (`SessionProvider`: "ter sessão é ter CONTA, não cadastro aprovado").
  // Padrão `true`, pra navegar sem backend. Só em desenvolvimento (`__DEV__`, removido do bundle
  // de produção pelo Metro — nunca alcançável fora dele) dá para forçar o estado "sem aprovação"
  // com `?devAprovado=false` na URL, sem editar código: é o que permite a ferramenta de
  // qualidade-tela e a Íris fotografarem esse estado.
  const registrationApproved = __DEV__ && devAprovado === 'false' ? false : true;

  // Sem backend ainda: simula a confirmação do servidor antes de comitar o novo
  // estado — a chave e o CTA não mudam otimisticamente (MOTORISTA.md). Quando o
  // endpoint existir, troca por `await driverClient.setOnline(next)`.
  function handleToggleOnline(next: boolean) {
    if (togglingOnline) return;
    setTogglingOnline(true);
    setTimeout(() => {
      setOnline(next);
      setTogglingOnline(false);
    }, 600);
  }

  // Onda 5: barra de abas de verdade (`buildDriverTabs`, `src/navigation/driverTabs.tsx`) — as
  // mesmas 3 abas (Início/Histórico/Perfil) em toda tela, com navegação real por `router.replace`.
  // "Ganhos" saiu (decisão do Atlas, 22/11/2026, `docs/fichas-de-tela/README.md`): a M11 não
  // existe, e destino sem conteúdo real não aparece (mesmo princípio da PP-15).
  const tabs = buildDriverTabs('inicio');

  return (
    // `glow` só sem mapa (§4 do padrão: "nunca sobre mapa ou foto"); com o motorista online a
    // faixa de mapa some com o brilho.
    <AppShell scroll glow={!online} footer={<BottomTabBar items={tabs} activeKey="inicio" testID="driver-tab-bar" />}>
      <View style={styles.content}>
        <DriverHeader driverName="Carlos Santos" notificationCount={3} />
        {sessionMode === 'mock' ? (
          <MockBadge label="acesso simulado, sem autenticação real" testID="simulated-access-badge" />
        ) : null}
        <RegistrationNotice context="home" testID="home-registration-notice" />
        <OnlineToggle online={online} approved={registrationApproved} loading={togglingOnline} onToggle={handleToggleOnline} />
        {registrationApproved && online ? <DriverMapPreview cityLabel="São Paulo - SP" /> : null}

        <DailySummarySection
          earningsLabel="R$ 247,90"
          ridesLabel="12"
          ratingLabel="4,95"
          acceptanceLabel="92%"
          approved={registrationApproved}
        />
        {/* Selo ÚNICO para o bloco inteiro de métricas (ficha M05 §2/§13: "um só, embaixo da grade") —
            desvio deliberado da regra geral "um selo por bloco" (§5 do padrão), porque esta ficha pede
            explicitamente um selo por tela aqui. */}
        <MockBadge label="dados de exemplo" testID="daily-summary-mock-badge" />
      </View>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  content: { gap: theme.spacing['5'] },
});
