import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Bell, FileText, Gift, Globe, LocateFixed, SunMoon, Trash2 } from 'lucide-react-native';
import { AppShell, MockBadge, ScreenHeader, theme, textStyle } from '@vuumbora/ui';
import { ListMenuRow } from '../../src/components/shared/ListMenuRow';

const PRIVACY_NOTICE =
  'Texto ainda não publicado. Termos de Uso e Política de Privacidade entram antes do lançamento.';
const THEME_NOTICE = 'Só o tema escuro está disponível nesta versão — não há motor de temas ainda.';
const LANGUAGE_NOTICE = 'Só Português (BR) está disponível nesta versão.';
const INITIAL_CACHE_LABEL = '12,4 MB';
const CLEARED_CACHE_LABEL = '0 MB';

/**
 * P13b — Configurações (VuumBora_Claude_Design_System/referencias/premium/passageiro/
 * P13b-configuracoes.webp). Alcançada pelo ícone de engrenagem em `/perfil` (a
 * referência não mostra esse link; decisão da Lyra para a tela ter uma entrada —
 * avaliar no inventário visual, item 1.7). Interruptores são estado local only (regra
 * do Atlas: "não finja que persiste no servidor").
 */
export default function SettingsScreen() {
  const [notifications, setNotifications] = useState(true);
  const [liveLocation, setLiveLocation] = useState(true);
  const [promotions, setPromotions] = useState(true);
  const [cacheLabel, setCacheLabel] = useState(INITIAL_CACHE_LABEL);
  const [cacheCleared, setCacheCleared] = useState(false);

  function handleClearCache() {
    setCacheLabel(CLEARED_CACHE_LABEL);
    setCacheCleared(true);
  }

  return (
    <AppShell scroll glow>
      <View style={styles.content}>
        <ScreenHeader title="Configurações" onBack={() => router.back()} testID="settings-header" />

        <View style={styles.menu}>
          <ListMenuRow
            icon={<Bell size={20} color={theme.role.ctaBackground} strokeWidth={1.75} />}
            label="Notificações"
            toggle={{ value: notifications, onValueChange: setNotifications }}
            testID="settings-notifications"
          />
          <ListMenuRow
            icon={<LocateFixed size={20} color={theme.role.ctaBackground} strokeWidth={1.75} />}
            label="Localização em tempo real"
            toggle={{ value: liveLocation, onValueChange: setLiveLocation }}
            testID="settings-live-location"
          />
          <ListMenuRow
            icon={<Gift size={20} color={theme.role.ctaBackground} strokeWidth={1.75} />}
            label="Receber promoções"
            toggle={{ value: promotions, onValueChange: setPromotions }}
            testID="settings-promotions"
          />
          <ListMenuRow
            icon={<SunMoon size={20} color={theme.role.ctaBackground} strokeWidth={1.75} />}
            label="Tema do aplicativo"
            value="Escuro"
            unavailableMessage={THEME_NOTICE}
            testID="settings-theme"
          />
          <ListMenuRow
            icon={<Globe size={20} color={theme.role.ctaBackground} strokeWidth={1.75} />}
            label="Idioma"
            value="Português (BR)"
            unavailableMessage={LANGUAGE_NOTICE}
            testID="settings-language"
          />
          <ListMenuRow
            icon={<FileText size={20} color={theme.role.ctaBackground} strokeWidth={1.75} />}
            label="Privacidade e termos"
            unavailableMessage={PRIVACY_NOTICE}
            testID="settings-privacy"
          />
          <ListMenuRow
            icon={<Trash2 size={20} color={theme.role.ctaBackground} strokeWidth={1.75} />}
            label="Limpar cache"
            value={cacheLabel}
            onPress={handleClearCache}
            accessibilityLabel={`Limpar cache, tamanho atual ${cacheLabel}`}
            testID="settings-clear-cache"
          />
          <View style={styles.cacheFootnote}>
            <MockBadge label="tamanho de cache simulado" testID="settings-cache-mock-badge" />
            {cacheCleared ? (
              <Text style={styles.cacheClearedText} accessibilityLiveRegion="polite" testID="settings-cache-cleared-text">
                Cache limpo (ação simulada, sem efeito real no dispositivo).
              </Text>
            ) : null}
          </View>
        </View>
      </View>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  content: { gap: theme.spacing['4'] },
  menu: { gap: theme.spacing['2'] },
  cacheFootnote: { gap: theme.spacing['1'] },
  cacheClearedText: { color: theme.role.textSecondary, ...textStyle('regular', 'small') },
});
