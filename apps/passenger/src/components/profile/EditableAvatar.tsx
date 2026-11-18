import { memo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Pencil } from 'lucide-react-native';
import { Avatar, theme } from '@vuumbora/ui';
import { UnavailableNoticeBanner } from '../auth/UnavailableNoticeBanner';

export interface EditableAvatarProps {
  readonly name: string;
  readonly imageUri?: string;
  readonly testID?: string;
}

const EDIT_NOTICE = 'Edição de foto ainda não está disponível — não há upload real nesta versão.';

/**
 * Avatar grande (P13) + botão de editar. O círculo visível do lápis é pequeno (28pt,
 * fiel à referência), mas a `Pressable` em si mede 44×44 — `hitSlop` sozinho não
 * garante o alvo de toque mínimo em RN Web (ver bug_touch_target_hitslop_insuficiente
 * na memória da Lyra), por isso o alvo real é maior que o círculo desenhado, não só
 * uma folga de hitSlop em cima de um elemento pequeno.
 */
export const EditableAvatar = memo(function EditableAvatar({ name, imageUri, testID }: EditableAvatarProps) {
  const [noticeVisible, setNoticeVisible] = useState(false);

  // `exactOptionalPropertyTypes` (ligado neste projeto) rejeita repassar `testID?: string`
  // cujo valor pode ser `undefined` por variável — ver feedback_medir_expo_web_playwright
  // na memória da Lyra. Correção: só incluir a chave quando o valor existir.
  const avatarTestIDProps = testID !== undefined ? { testID } : {};
  const editNoticeTestIDProps = testID !== undefined ? { testID: `${testID}-notice` } : {};

  return (
    <View style={styles.wrapper}>
      <View style={styles.avatarBox}>
        {imageUri ? (
          <Avatar name={name} imageUri={imageUri} size="lg" {...avatarTestIDProps} />
        ) : (
          <Avatar name={name} size="lg" {...avatarTestIDProps} />
        )}
        <Pressable
          onPress={() => setNoticeVisible(true)}
          accessibilityRole="button"
          accessibilityLabel="Editar foto de perfil, recurso de demonstração"
          style={styles.editTarget}
          {...(testID !== undefined ? { testID: `${testID}-edit` } : {})}
        >
          <View style={styles.editCircle}>
            <Pencil size={13} color={theme.role.ctaText} strokeWidth={2.25} />
          </View>
        </Pressable>
      </View>
      {noticeVisible ? <UnavailableNoticeBanner message={EDIT_NOTICE} {...editNoticeTestIDProps} /> : null}
    </View>
  );
});

const AVATAR_SIZE = 64;
const EDIT_TARGET = 44;
const EDIT_CIRCLE = 28;

const styles = StyleSheet.create({
  wrapper: { alignItems: 'center', gap: theme.spacing['2'] },
  avatarBox: { width: AVATAR_SIZE, height: AVATAR_SIZE },
  editTarget: {
    position: 'absolute',
    bottom: -(EDIT_TARGET - EDIT_CIRCLE) / 2,
    right: -(EDIT_TARGET - EDIT_CIRCLE) / 2,
    width: EDIT_TARGET,
    height: EDIT_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editCircle: {
    width: EDIT_CIRCLE,
    height: EDIT_CIRCLE,
    borderRadius: EDIT_CIRCLE / 2,
    backgroundColor: theme.role.ctaBackground,
    borderWidth: 2,
    borderColor: theme.role.screen,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
