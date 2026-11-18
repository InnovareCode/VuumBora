import { memo } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { theme } from '@vuumbora/tokens';
import { textStyleForSize } from './typography';

export type AvatarSize = 'sm' | 'md' | 'lg';

const SIZE: Record<AvatarSize, number> = { sm: 32, md: 44, lg: 64 };

export interface AvatarProps {
  /** Nome usado para gerar as iniciais quando não há `imageUri`. */
  readonly name: string;
  readonly imageUri?: string;
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
export const Avatar = memo(function Avatar({ name, imageUri, size = 'md', testID }: AvatarProps) {
  const dimension = SIZE[size];
  const style = [styles.circle, { width: dimension, height: dimension, borderRadius: dimension / 2 }];

  if (imageUri) {
    return (
      <Image
        source={{ uri: imageUri }}
        style={style}
        accessibilityIgnoresInvertColors
        accessibilityLabel={`Foto de perfil de ${name}`}
        testID={testID}
      />
    );
  }

  return (
    <View style={[style, styles.fallback]} accessibilityRole="image" accessibilityLabel={`Foto de perfil de ${name}`} testID={testID}>
      <Text style={[styles.initials, textStyleForSize('bold', Math.round(dimension * 0.38))]}>{initialsOf(name)}</Text>
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
