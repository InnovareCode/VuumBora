import { memo } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Car, HelpCircle, Settings, User, X } from 'lucide-react-native';
import { ListRow, SurfaceRaised, theme, textStyle, withAlpha } from '@vuumbora/ui';

export interface HomeMenuSheetProps {
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly onPressTrips: () => void;
  readonly onPressProfile: () => void;
  readonly onPressSettings: () => void;
  readonly onPressHelp: () => void;
  readonly testID?: string;
}

/**
 * Menu do ☰ da Home (PP-9/D-06): troca a barra de 4 abas (uma delas, "Mensagens", sem ação —
 * `index.tsx:57-63` antes desta fatia) por um menu, como a prancha de 22/11 pede. Lista
 * recomendada na ficha P03 é "Viagens, Carteira (quando existir), Perfil, Configurações e
 * Ajuda" — Carteira (P12) ainda não tem tela nem conteúdo real, então NÃO entra aqui (G-19:
 * nunca um item que não navega para lugar nenhum). Ajuda (P14) passou a existir na onda 5 e
 * entrou.
 *
 * Sem "tocar fora fecha": mesmo motivo do `ConfirmDialog` (técnico — o scrim como `Pressable`
 * quebraria o `focusFirstDescendant` do `Modal` do react-native-web, ver
 * `packages/ui/src/ConfirmDialog.tsx`). Fecha pelo X, por Esc (`onRequestClose`, já embutido) ou
 * ao escolher um item.
 */
export const HomeMenuSheet = memo(function HomeMenuSheet({
  visible,
  onClose,
  onPressTrips,
  onPressProfile,
  onPressSettings,
  onPressHelp,
  testID,
}: HomeMenuSheetProps) {
  function handlePress(action: () => void) {
    onClose();
    action();
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent testID={testID}>
      <View style={styles.scrim}>
        <View accessibilityViewIsModal style={styles.sheetWrapper}>
          <SurfaceRaised style={styles.sheet}>
            <View style={styles.header}>
              <Text style={styles.title} accessibilityRole="header">
                Menu
              </Text>
              <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Fechar menu" hitSlop={8} style={styles.closeTarget}>
                <X size={22} color={theme.role.textPrimary} strokeWidth={1.75} />
              </Pressable>
            </View>
            <View style={styles.items}>
              <ListRow
                icon={<Car size={20} color={theme.role.textSecondary} strokeWidth={1.75} />}
                label="Viagens"
                onPress={() => handlePress(onPressTrips)}
                testID="home-menu-trips"
              />
              <ListRow
                icon={<User size={20} color={theme.role.textSecondary} strokeWidth={1.75} />}
                label="Perfil"
                onPress={() => handlePress(onPressProfile)}
                testID="home-menu-profile"
              />
              <ListRow
                icon={<Settings size={20} color={theme.role.textSecondary} strokeWidth={1.75} />}
                label="Configurações"
                onPress={() => handlePress(onPressSettings)}
                testID="home-menu-settings"
              />
              <ListRow
                icon={<HelpCircle size={20} color={theme.role.textSecondary} strokeWidth={1.75} />}
                label="Ajuda"
                onPress={() => handlePress(onPressHelp)}
                testID="home-menu-help"
              />
            </View>
          </SurfaceRaised>
        </View>
      </View>
    </Modal>
  );
});

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: withAlpha(theme.role.screen, theme.opacity.scrim),
    padding: theme.layout.screenPadding,
  },
  sheetWrapper: { width: '100%', maxWidth: theme.layout.contentMaxWidth - theme.layout.screenPadding * 2, alignSelf: 'center' },
  sheet: {
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderTopColor: theme.role.edgeTop,
    borderColor: theme.role.edgeBottom,
    padding: theme.spacing['4'],
    gap: theme.spacing['3'],
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: theme.role.textPrimary, ...textStyle('bold', 'subtitle') },
  closeTarget: {
    width: theme.layout.touchTarget,
    height: theme.layout.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -theme.spacing['2'],
  },
  items: { gap: theme.spacing['2'] },
});
