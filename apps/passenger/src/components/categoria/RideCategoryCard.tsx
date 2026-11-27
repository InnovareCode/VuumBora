import { memo } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Check, type LucideIcon } from 'lucide-react-native';
import { SurfaceRaised, VehicleIllustration, focusRingStyle, theme, textStyle, tabularNums, useKeyboardFocusRing, type VehicleIllustrationVariant } from '@vuumbora/ui';

// Direção de arte §4/§9 item 4: halo do card selecionado. `boxShadow` com cor é a
// única forma de um glow colorido no RN (elevation/shadow* nativo não aceita cor no
// Android) — ver nota de validação em ButtonCore.tsx (mesma pendência de prova em Android).
const SELECTED_GLOW = theme.glow.selected;
/** Anel de foco de teclado (G-22): sem ele o Chromium pintava o `outline: auto` escuro, invisível no fundo escuro. */
const CARD_FOCUS_RING = focusRingStyle('outside', theme.radius.lg);

// São cinco categorias (decisão do dono, 20/11/2026): cinco cards lado a lado não cabem em
// largura nenhuma de celular com o nome legível ("Motorista mulher"), então o card é SEMPRE uma
// linha — ilustração/símbolo à esquerda, nome e tempo ao centro, preço e selo à direita. A
// ilustração do veículo só aparece a partir de 360pt (abaixo disso não cabe com legibilidade,
// docs/direcao-de-arte.md §6) e só nas categorias que são o próprio carro (`vehicleVariant`);
// as demais mostram `icon` numa caixa de 48pt. O espaço à esquerda tem largura fixa por
// breakpoint, para os nomes alinharem em todas as linhas mesmo misturando carro e símbolo.
const VEHICLE_ART_BREAKPOINT = 360;
const VEHICLE_ART_WIDTH = 88;
const ICON_BOX_SIZE = theme.spacing['9'];

export interface RideCategoryCardProps {
  readonly name: string;
  /** Símbolo da categoria: caixa de 48pt abaixo de 360pt, ou quando não há `vehicleVariant`. */
  readonly icon: LucideIcon;
  /** Ilustração do veículo — só categorias que são o próprio carro (VuumBora, Conforto). */
  readonly vehicleVariant?: VehicleIllustrationVariant;
  /**
   * Legenda curta da categoria (ex.: "Carro para o dia a dia."), do servidor (`GET /v1/categories`). Ausente enquanto
   * as categorias não chegaram. Fatia G6: o "chega em N min" saiu — o contrato do M4 não tem tempo até o embarque
   * (isso é do despacho, M5), e o app não inventa número.
   */
  readonly detail?: string | undefined;
  /** Preço FECHADO da cotação (ex.: "R$ 15,37", D-06). */
  readonly priceLabel: string;
  /** Rótulo lido junto do preço: "preço de teste" quando a tarifa é de teste. */
  readonly priceDescription: string;
  readonly selected: boolean;
  readonly onPress: () => void;
  readonly testID?: string;
}

/** Categoria de corrida (VuumBora, Conforto, Motorista mulher, Entrega, Pet). Específico do passageiro — não é transversal. */
export const RideCategoryCard = memo(function RideCategoryCard({
  name,
  icon: Icon,
  vehicleVariant,
  detail,
  priceLabel,
  priceDescription,
  selected,
  onPress,
  testID,
}: RideCategoryCardProps) {
  const { width } = useWindowDimensions();
  const showVehicleArt = width >= VEHICLE_ART_BREAKPOINT;

  const accessibilityLabel = `${name}${detail ? `, ${detail}` : ''}, ${priceDescription} ${priceLabel}${selected ? ', selecionado' : ''}`;
  const { focusVisible, focusProps } = useKeyboardFocusRing();

  return (
    <Pressable
      {...focusProps}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={accessibilityLabel}
      style={focusVisible ? CARD_FOCUS_RING : undefined}
      testID={testID}
    >
      <SurfaceRaised style={[styles.card, selected && styles.cardSelected, selected && { boxShadow: SELECTED_GLOW }]}>
        <View style={[styles.artSlot, { width: showVehicleArt ? VEHICLE_ART_WIDTH : ICON_BOX_SIZE }]}>
          {showVehicleArt && vehicleVariant ? (
            <VehicleIllustration variant={vehicleVariant} width={VEHICLE_ART_WIDTH} />
          ) : (
            <View style={styles.iconBox}>
              <Icon size={24} color={selected ? theme.role.ctaBackground : theme.role.textSecondary} strokeWidth={1.75} />
            </View>
          )}
        </View>
        <View style={styles.textBlock}>
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
          {detail ? (
            // Até 2 linhas, nunca cortada no meio (legenda do servidor pode ser longa).
            <Text style={styles.detail} numberOfLines={2}>
              {detail}
            </Text>
          ) : null}
        </View>
        <View style={styles.trailing}>
          <Text style={styles.price} numberOfLines={1}>
            {priceLabel}
          </Text>
          {selected ? (
            <View style={styles.checkBadge}>
              <Check size={13} color={theme.role.ctaText} strokeWidth={3} />
            </View>
          ) : null}
        </View>
      </SurfaceRaised>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: {
    minHeight: theme.layout.touchTarget,
    borderRadius: theme.radius.lg,
    borderWidth: 1.5,
    // Borda iluminada de cima (direção de arte §4/§9 item 2).
    borderTopColor: theme.role.edgeTop,
    borderColor: theme.role.edgeBottom,
    paddingVertical: theme.spacing['2'],
    paddingHorizontal: theme.spacing['3'],
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing['3'],
  },
  // Selecionado: borda 2pt amarela (item 4) + halo (`boxShadow`, aplicado inline).
  // Fundo continua `gradient.surface.raised` (SurfaceRaised é opaco; backgroundColor
  // aqui não apareceria por baixo do gradiente).
  cardSelected: {
    borderWidth: 2,
    borderTopColor: theme.role.ctaBackground,
    borderColor: theme.role.ctaBackground,
  },
  // Altura fixa = a da caixa de ícone: a ilustração (88×38) é mais baixa que ela, e sem isto as
  // linhas com carro ficavam ~10pt mais baixas que as com símbolo (medido, 21/11/2026).
  artSlot: { height: ICON_BOX_SIZE, alignItems: 'center', justifyContent: 'center' },
  // Caixa de ícone 48pt (direção de arte §6, "padrão P05"). Raio igual ao do card
  // (`radius.lg`, não `radius.md`) — pedido do dono: a caixa acompanha a curvatura do
  // card em vez de ter um raio menor e destoar dela por dentro.
  iconBox: {
    width: ICON_BOX_SIZE,
    height: ICON_BOX_SIZE,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.role.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textBlock: { flex: 1, gap: 2 },
  trailing: { alignItems: 'flex-end', gap: 2 },
  checkBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: theme.role.ctaBackground,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  name: { color: theme.role.textPrimary, ...textStyle('semibold', 'caption') },
  detail: { color: theme.role.textMuted, ...textStyle('regular', 'caption') },
  price: { color: theme.role.textPrimary, ...textStyle('bold', 'small'), ...tabularNums },
});
