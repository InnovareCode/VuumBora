import { memo } from 'react';
import { Briefcase, Home as HomeIcon, MapPin, Star } from 'lucide-react-native';
import type { Place } from '@vuumbora/domain';
import { ListRow, theme } from '@vuumbora/ui';

export interface PlaceRowProps {
  readonly place: Place;
  readonly onPress: (place: Place) => void;
  readonly testID?: string;
}

/**
 * Ícone por rótulo conhecido (Casa/Trabalho/Favoritos) — o resto cai no pino genérico.
 * Sempre `textSecondary`: amarelo aqui seria "ícone de linha de lista amarelo", proibido
 * pela regra de economia de amarelo (`docs/padrao-premium-telas.md` §2) — diferente do MESMO
 * ícone no atalho da Home (`QuickAccessGrid`), que é um sinal permitido ("ícone de atalho
 * principal"). Achado nesta fatia: a versão anterior (via `InfoCard`) já pintava estes ícones
 * de amarelo; a troca para `ListRow` foi a oportunidade de corrigir.
 */
function iconFor(label: string) {
  const normalized = label.toLowerCase();
  if (normalized === 'casa') return <HomeIcon size={20} color={theme.role.textSecondary} strokeWidth={1.75} />;
  if (normalized === 'trabalho') return <Briefcase size={20} color={theme.role.textSecondary} strokeWidth={1.75} />;
  if (normalized.includes('favorit')) return <Star size={20} color={theme.role.textSecondary} strokeWidth={1.75} />;
  return <MapPin size={20} color={theme.role.textSecondary} strokeWidth={1.75} />;
}

/**
 * Linha de endereço reutilizada por "lugares salvos", "recentes" e resultados de busca (P04).
 * `ListRow` (C-08, `docs/padrao-premium-telas.md` §15/§18.1 item 2) — era `InfoCard` antes
 * desta fatia; a ficha P04 §4/§12 pede explicitamente o componente transversal de linha.
 */
export const PlaceRow = memo(function PlaceRow({ place, onPress, testID }: PlaceRowProps) {
  return (
    <ListRow
      icon={iconFor(place.label)}
      label={place.label}
      value={place.address}
      valueLines={2}
      onPress={() => onPress(place)}
      accessibilityLabel={`${place.label}, ${place.address}`}
      {...(testID !== undefined ? { testID } : {})}
    />
  );
});
