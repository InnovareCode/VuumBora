import { memo } from 'react';
import { Briefcase, Home as HomeIcon, MapPin, Star } from 'lucide-react-native';
import type { Place } from '@vuumbora/domain';
import { InfoCard, theme } from '@vuumbora/ui';

export interface PlaceRowProps {
  readonly place: Place;
  readonly onPress: (place: Place) => void;
  readonly testID?: string;
}

/** Ícone por rótulo conhecido (Casa/Trabalho/Favoritos) — o resto cai no pino genérico. */
function iconFor(label: string) {
  const normalized = label.toLowerCase();
  if (normalized === 'casa') return <HomeIcon size={20} color={theme.role.ctaBackground} strokeWidth={1.75} />;
  if (normalized === 'trabalho') return <Briefcase size={20} color={theme.role.ctaBackground} strokeWidth={1.75} />;
  if (normalized.includes('favorit')) return <Star size={20} color={theme.role.ctaBackground} strokeWidth={1.75} />;
  return <MapPin size={20} color={theme.role.textSecondary} strokeWidth={1.75} />;
}

/** Linha de endereço reutilizada por "lugares salvos" e pelos resultados de autocomplete (P04). */
export const PlaceRow = memo(function PlaceRow({ place, onPress, testID }: PlaceRowProps) {
  return (
    <InfoCard
      title={place.label}
      description={place.address}
      leading={iconFor(place.label)}
      onPress={() => onPress(place)}
      accessibilityLabel={`${place.label}, ${place.address}`}
      {...(testID !== undefined ? { testID } : {})}
    />
  );
});
