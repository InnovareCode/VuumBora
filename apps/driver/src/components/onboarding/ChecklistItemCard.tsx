import { memo } from 'react';
import { Car, FileText, IdCard } from 'lucide-react-native';
import { theme, type StatusBadgeVariant } from '@vuumbora/ui';
import { itemStateLabel, type ChecklistItem } from '../../onboarding/verificationModel';
import { DocumentStatusCard } from './DocumentStatusCard';

const BADGE: Record<ChecklistItem['state'], StatusBadgeVariant> = {
  done: 'success',
  approved: 'success',
  submitted: 'info',
  todo: 'neutral',
  rejected: 'warning',
  expired: 'danger',
};

function captionOf(item: ChecklistItem): string {
  if (item.kind === 'profile') return 'CPF, CNH e endereço';
  if (item.kind === 'vehicle') return 'Placa, modelo, ano e cor';
  return item.required ? 'Obrigatório' : 'Opcional';
}

function verbOf(item: ChecklistItem): string {
  if (item.state === 'todo') return item.kind === 'document' ? 'enviar' : 'preencher';
  if (item.state === 'rejected' || item.state === 'expired') return 'enviar de novo';
  return 'ver';
}

export interface ChecklistItemCardProps {
  readonly item: ChecklistItem;
  readonly onPress: (item: ChecklistItem) => void;
}

/**
 * Um item da lista do cadastro (M03) no `DocumentStatusCard`. Ícone genérico de documento para TODO documento: a
 * lista é dado (N1) e o app não pode ter uma tabela fixa "código → ícone" (`DocumentRequirement.typeCode`).
 */
export const ChecklistItemCard = memo(function ChecklistItemCard({ item, onPress }: ChecklistItemCardProps) {
  const Icon = item.kind === 'profile' ? IdCard : item.kind === 'vehicle' ? Car : FileText;
  const caption = captionOf(item);
  const stateLabel = itemStateLabel(item);
  return (
    <DocumentStatusCard
      icon={<Icon size={20} color={theme.role.textSecondary} strokeWidth={1.75} />}
      title={item.label}
      caption={caption}
      badgeVariant={BADGE[item.state]}
      badgeLabel={stateLabel}
      onPress={() => onPress(item)}
      accessibilityLabel={`${item.label}, ${caption.toLowerCase()}, ${stateLabel.toLowerCase()}. Toque para ${verbOf(item)}`}
      testID={`cadastro-item-${item.key}`}
    />
  );
});
