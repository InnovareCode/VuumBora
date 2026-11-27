import { memo } from 'react';
import { Image, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';
import { theme } from '@vuumbora/tokens';
import { avatarDiameter, avatarInitialsFontSize, type AvatarSize } from './avatarScale';
import { textStyleForSize } from './typography';

export type { AvatarDiameter, AvatarSize, AvatarSizeName } from './avatarScale';

export interface AvatarProps {
  /** Nome usado para gerar as iniciais quando não há `imageUri`/`imageSource`. */
  readonly name: string;
  /** Foto remota (backend real). */
  readonly imageUri?: string;
  /**
   * Foto já resolvida pelo bundler (`require`/import de asset local — ex.: foto de
   * DEMONSTRAÇÃO embutida no pacote). Tem prioridade sobre `imageUri` quando os dois
   * vierem definidos. Nunca usar `Image.resolveAssetSource` para converter isso numa
   * `string` de URI — essa API não existe no `react-native-web`.
   */
  readonly imageSource?: ImageSourcePropType;
  /** Diâmetro da escala das fichas (32, 40, 48, 56, 64, 88 — ver `avatarScale.ts`). Padrão: `'md'` (44, legado). */
  readonly size?: AvatarSize;
  readonly testID?: string;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? '' : '';
  return (first + last).toUpperCase() || '?';
}

/**
 * Avatar circular: foto quando houver `imageUri`, senão iniciais sobre fundo escuro com
 * anel amarelo (direção de arte §4/§9 item 1: disco cheio de amarelo era um foco de
 * amarelo competindo com o CTA; o anel mantém o destaque de marca sem virar fundo).
 */
export const Avatar = memo(function Avatar({ name, imageUri, imageSource, size = 'md', testID }: AvatarProps) {
  const dimension = avatarDiameter(size);
  const style = [styles.circle, { width: dimension, height: dimension, borderRadius: dimension / 2 }];
  const source = imageSource ?? (imageUri ? { uri: imageUri } : undefined);

  if (source) {
    return (
      <Image source={source} style={style} accessibilityIgnoresInvertColors accessibilityLabel={`Foto de perfil de ${name}`} testID={testID} />
    );
  }

  return (
    <View style={[style, styles.fallback]} accessibilityRole="image" accessibilityLabel={`Foto de perfil de ${name}`} testID={testID}>
      <Text style={[styles.initials, textStyleForSize('bold', avatarInitialsFontSize(dimension))]}>{initialsOf(name)}</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  circle: { overflow: 'hidden' },
  fallback: {
    backgroundColor: theme.role.surfaceElevated,
    borderWidth: 2,
    borderColor: theme.role.ctaBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: { color: theme.role.ctaBackground },
});
