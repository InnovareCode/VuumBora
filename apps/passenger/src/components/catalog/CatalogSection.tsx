import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { theme } from '@vuumbora/ui';

export interface CatalogSectionProps {
  readonly title: string;
  readonly description?: string;
  readonly children: ReactNode;
}

/** Agrupador visual do catálogo — título + descrição + conteúdo, só para apps/passenger/app/catalogo.tsx. */
export function CatalogSection({ title, description, children }: CatalogSectionProps) {
  return (
    <View style={styles.section}>
      <Text style={styles.title}>{title}</Text>
      {description ? <Text style={styles.description}>{description}</Text> : null}
      <View style={styles.body}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: theme.spacing['7'],
    paddingBottom: theme.spacing['6'],
    borderBottomWidth: 1,
    borderBottomColor: theme.role.border,
  },
  title: {
    color: theme.role.textPrimary,
    fontSize: theme.typography.size.title,
    fontWeight: theme.typography.weight.bold,
    marginBottom: theme.spacing['1'],
  },
  description: {
    color: theme.role.textSecondary,
    fontSize: theme.typography.size.small,
    marginBottom: theme.spacing['4'],
  },
  body: { gap: theme.spacing['5'] },
});
