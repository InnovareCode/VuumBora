import { useState } from 'react';
import { Linking } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { Headset, Mail, MessageCircle, Phone } from 'lucide-react-native';
import { AppShell, InlineAlert, ListRow, ScreenHeader, SurfaceRaised, theme, textStyle } from '@vuumbora/ui';
import { buildSupportMessage, openEmergencyCall, openWhatsAppSupport } from '../../src/support/openSupportChannel';

const PRIVACY_EMAIL = 'contato@vuumbora.com.br';

type ChannelFailure = 'whatsapp' | 'phone' | null;

/**
 * M14 — Suporte e segurança (motorista), sobre `docs/fichas-de-tela/M14-suporte-e-seguranca.md`.
 * Canal decidido pelo dono: WhatsApp com atendimento por pessoas de Natal (`docs/plano-apps-
 * execucao.md:253-254`). "Central de Ajuda"/"Reportar um problema"/"Solicitar reavaliação" da
 * prancha NÃO entram (D-26: pressupõem textos/processos que não existem ainda).
 *
 * Dois contextos de entrada, independentes:
 *  - `tripCode`/`tripRoute`/`tripDate` na URL — vem de "Relatar um problema" no detalhe do
 *    histórico (M12): mostra o cartão da corrida e leva o código público na mensagem (nunca dado
 *    do passageiro, PP-14).
 *  - `?devEmCorrida=1` (`__DEV__`, QA) — simula a entrada pelo "⋯" de uma corrida em andamento
 *    (M07 a M09, que ainda não existem): a seção "Segurança" sobe para o topo (ficha §2: "numa
 *    ocorrência, o 190 vem antes da conversa").
 */
export default function DriverSupportScreen() {
  const { tripCode, tripRoute, tripDate, devEmCorrida } = useLocalSearchParams<{
    tripCode?: string;
    tripRoute?: string;
    tripDate?: string;
    devEmCorrida?: string;
  }>();
  const hasTrip = Boolean(tripCode && tripRoute && tripDate);
  const emCorrida = __DEV__ && devEmCorrida === '1';
  const [failure, setFailure] = useState<ChannelFailure>(null);

  async function handleWhatsApp() {
    setFailure(null);
    const message = hasTrip && tripCode && tripDate ? buildSupportMessage({ code: tripCode, dateLabel: tripDate }) : buildSupportMessage();
    const result = await openWhatsAppSupport(message);
    if (!result.ok) setFailure('whatsapp');
  }

  async function handleEmergencyCall() {
    setFailure(null);
    const result = await openEmergencyCall();
    if (!result.ok) setFailure('phone');
  }

  const channelRows = (
    <View style={styles.rows}>
      <ListRow
        icon={<MessageCircle size={20} color={theme.role.textSecondary} strokeWidth={1.75} />}
        label="Falar no WhatsApp"
        value="Atendimento por pessoas de Natal"
        valueLines={2}
        onPress={() => void handleWhatsApp()}
        accessibilityLabel="Falar no WhatsApp, atendimento por pessoas de Natal"
        testID="suporte-row-whatsapp"
      />
      <ListRow
        icon={<Mail size={20} color={theme.role.textSecondary} strokeWidth={1.75} />}
        label="Seus dados pessoais"
        value="Pedidos sobre os seus dados (LGPD)"
        valueLines={2}
        onPress={() => void Linking.openURL(`mailto:${PRIVACY_EMAIL}`)}
        testID="suporte-row-dados-pessoais"
      />
      {failure === 'whatsapp' ? (
        <InlineAlert tone="warning" message="Não encontramos o WhatsApp instalado neste aparelho." testID="suporte-sem-whatsapp" />
      ) : null}
    </View>
  );

  const safetySection = (
    <View style={styles.section}>
      <Text style={styles.sectionTitle} accessibilityRole="header">
        Segurança
      </Text>
      <ListRow
        icon={<Phone size={20} color={theme.role.danger} strokeWidth={1.75} />}
        label="Ligar 190"
        value="Polícia Militar, em emergência."
        valueLines={2}
        onPress={() => void handleEmergencyCall()}
        testID="suporte-row-190"
      />
      {failure === 'phone' ? (
        <InlineAlert tone="warning" message="Não foi possível iniciar a ligação neste aparelho." testID="suporte-sem-ligacao" />
      ) : null}
    </View>
  );

  return (
    <AppShell scroll glow testID="suporte-screen">
      <View style={styles.content}>
        <ScreenHeader title="Suporte" onBack={() => router.back()} testID="suporte-header" />

        <View style={styles.heroBlock}>
          <View style={styles.heroIcon}>
            <Headset size={32} color={theme.role.textSecondary} strokeWidth={1.75} />
          </View>
          <Text style={styles.heroTitle} accessibilityRole="header">
            Como podemos ajudar?
          </Text>
        </View>

        {hasTrip ? (
          <SurfaceRaised style={styles.tripCard} testID="suporte-trip-card">
            <Text style={styles.tripLabel}>Corrida em questão</Text>
            <Text style={styles.tripRoute} numberOfLines={1}>
              {tripRoute} · {tripDate}
            </Text>
          </SurfaceRaised>
        ) : null}

        {emCorrida ? (
          <>
            {safetySection}
            {channelRows}
          </>
        ) : (
          <>
            {channelRows}
            {safetySection}
          </>
        )}
      </View>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  content: { gap: theme.spacing['4'] },
  heroBlock: { alignItems: 'center', gap: theme.spacing['2'] },
  heroIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.role.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: { color: theme.role.textPrimary, ...textStyle('bold', 'title'), textAlign: 'center' },
  tripCard: {
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderTopColor: theme.role.edgeTop,
    borderColor: theme.role.edgeBottom,
    padding: theme.spacing['3'],
    gap: 2,
  },
  tripLabel: { color: theme.role.textSecondary, ...textStyle('medium', 'caption') },
  tripRoute: { color: theme.role.textPrimary, ...textStyle('semibold', 'small') },
  rows: { gap: theme.spacing['2'] },
  section: { gap: theme.spacing['2'] },
  sectionTitle: { color: theme.role.textPrimary, ...textStyle('bold', 'body') },
});
