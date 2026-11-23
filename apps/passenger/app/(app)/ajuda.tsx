import { useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Headset, Mail, MessageCircle, Phone } from 'lucide-react-native';
import { AppShell, InlineAlert, LinkButton, ListRow, ScreenHeader, SectionHeader, SurfaceRaised, theme, textStyle } from '@vuumbora/ui';
import {
  EMERGENCY_PHONE,
  WHATSAPP_DISPLAY,
  buildHelpMessage,
  openEmergencyDialer,
  openSupportEmail,
  openWhatsApp,
} from '../../src/support/supportChannels';

type ChannelFailure = 'whatsapp' | 'phone' | null;

/**
 * P14 — Ajuda e segurança (`docs/fichas-de-tela/P14-ajuda-e-seguranca.md`), onda 5 do padrão
 * premium. Tela nova — não existia. Canal decidido pelo dono nesta missão: WhatsApp
 * (84) 3113-2584 (o mesmo do site). "Ligar 190" sem dar a entender que a VuumBora é avisada
 * (ficha §2, PP-11): o texto diz só "Polícia Militar, em emergência", nunca algo como "avisamos
 * a VuumBora".
 *
 * Mesma regra da P13 (PP-15): entra só linha com destino real. "Central de Ajuda" (dúvidas
 * frequentes) e "Reportar um problema" como item próprio NÃO entram (ficha §2: central vazia é
 * botão de mentira; reportar é a mesma conversa do WhatsApp, com a corrida no texto).
 */
export default function HelpScreen() {
  const { tripDestino, tripData } = useLocalSearchParams<{ tripDestino?: string; tripData?: string }>();
  const [failure, setFailure] = useState<ChannelFailure>(null);

  async function handleWhatsApp() {
    setFailure(null);
    const ok = await openWhatsApp(buildHelpMessage(tripData));
    if (!ok) setFailure('whatsapp');
  }

  async function handleEmergencyCall() {
    setFailure(null);
    const ok = await openEmergencyDialer();
    if (!ok) setFailure('phone');
  }

  async function handleCopyWhatsAppNumber() {
    // Sem lib DOM neste tsconfig (`apps/passenger/tsconfig.json`, `lib: ["ES2022"]`) e sem
    // `expo-clipboard` instalado (pendência): no web usa a Clipboard API direto pelo
    // `globalThis`, mesmo padrão de `packages/api-client/src/identity/client.ts:116-117`.
    const browserNavigator = (globalThis as { readonly navigator?: { readonly clipboard?: { writeText(text: string): Promise<void> } } })
      .navigator;
    await browserNavigator?.clipboard?.writeText(WHATSAPP_DISPLAY);
  }

  return (
    <AppShell scroll glow testID="help-screen">
      <View style={styles.content}>
        <ScreenHeader title="Ajuda" onBack={() => router.back()} testID="help-header" />

        <View style={styles.iconBlock}>
          <View style={styles.iconCircle}>
            <Headset size={32} color={theme.role.textSecondary} strokeWidth={1.75} />
          </View>
          <Text style={styles.question} accessibilityRole="header">
            Como podemos ajudar?
          </Text>
        </View>

        {tripDestino ? (
          <SurfaceRaised style={styles.tripCard} testID="help-trip-card">
            <View style={styles.tripText}>
              <Text style={styles.tripLabel}>Corrida em questão</Text>
              <Text style={styles.tripValue} numberOfLines={2}>
                {tripDestino}
                {tripData ? ` · ${tripData}` : ''}
              </Text>
            </View>
            <LinkButton label="Trocar" onPress={() => router.push('/historico')} testID="help-trip-change" />
          </SurfaceRaised>
        ) : null}

        <View style={styles.menu}>
          <ListRow
            icon={<MessageCircle size={20} color={theme.role.textSecondary} strokeWidth={1.75} />}
            label="Falar no WhatsApp"
            value="Atendimento por pessoas de Natal"
            valueLines={2}
            onPress={() => void handleWhatsApp()}
            accessibilityLabel="Falar no WhatsApp, abre o WhatsApp"
            testID="help-whatsapp-row"
          />
          <ListRow
            icon={<Mail size={20} color={theme.role.textSecondary} strokeWidth={1.75} />}
            label="Seus dados pessoais"
            value="Pedidos sobre os seus dados (LGPD)"
            valueLines={2}
            onPress={() => void openSupportEmail()}
            accessibilityLabel="Seus dados pessoais, abre o e-mail"
            testID="help-privacy-request-row"
          />
        </View>

        {failure === 'whatsapp' ? (
          <InlineAlert tone="warning" title="Não foi possível abrir o WhatsApp" message={`Nosso número é ${WHATSAPP_DISPLAY}.`} testID="help-whatsapp-failure">
            {Platform.OS === 'web' ? (
              <LinkButton role="button" label="Copiar número" onPress={() => void handleCopyWhatsAppNumber()} testID="help-whatsapp-copy" />
            ) : null}
          </InlineAlert>
        ) : null}

        <SectionHeader title="Segurança" testID="help-security-section" />
        <ListRow
          icon={<Phone size={20} color={theme.role.textSecondary} strokeWidth={1.75} />}
          label={`Ligar ${EMERGENCY_PHONE}`}
          value="Polícia Militar, em emergência."
          valueLines={2}
          onPress={() => void handleEmergencyCall()}
          accessibilityLabel={`Ligar ${EMERGENCY_PHONE}, abre o discador`}
          testID="help-emergency-row"
        />
        {failure === 'phone' ? (
          <InlineAlert tone="warning" message="Este aparelho não faz ligações." testID="help-phone-failure" />
        ) : null}
      </View>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  content: { gap: theme.spacing['4'] },
  iconBlock: { alignItems: 'center', gap: theme.spacing['3'] },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 999,
    backgroundColor: theme.role.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  question: { color: theme.role.textPrimary, ...textStyle('bold', 'title'), textAlign: 'center' },
  tripCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing['3'],
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderTopColor: theme.role.edgeTop,
    borderColor: theme.role.edgeBottom,
    padding: theme.spacing['4'],
  },
  tripText: { flex: 1, gap: 2 },
  tripLabel: { color: theme.role.textMuted, ...textStyle('semibold', 'caption') },
  tripValue: { color: theme.role.textPrimary, ...textStyle('medium', 'small') },
  menu: { gap: theme.spacing['2'] },
});
