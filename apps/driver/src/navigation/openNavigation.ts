import { Linking, Platform } from 'react-native';
import type { GeoPoint } from '@vuumbora/domain';

export type OpenNavigationResult = { readonly ok: true } | { readonly ok: false };

function wazeUrl(point: GeoPoint): string {
  return `waze://?ll=${point.latitude},${point.longitude}&navigate=yes`;
}

function googleMapsUrl(point: GeoPoint): string {
  return Platform.OS === 'android'
    ? `google.navigation:q=${point.latitude},${point.longitude}`
    : `comgooglemaps://?daddr=${point.latitude},${point.longitude}&directionsmode=driving`;
}

function systemMapsUrl(point: GeoPoint, label: string): string {
  const query = encodeURIComponent(label);
  return Platform.OS === 'ios'
    ? `maps://?daddr=${point.latitude},${point.longitude}&q=${query}`
    : `geo:${point.latitude},${point.longitude}?q=${point.latitude},${point.longitude}(${query})`;
}

function webMapsUrl(point: GeoPoint): string {
  return `https://www.google.com/maps/search/?api=1&query=${point.latitude},${point.longitude}`;
}

async function tryOpen(url: string): Promise<boolean> {
  try {
    const supported = await Linking.canOpenURL(url);
    if (!supported) return false;
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Porta LOCAL de navegação externa (decisão 10, D-20/D-21 — `docs/fichas-de-tela/M07-a-caminho-do-
 * embarque.md`): Waze → Google Maps → mapa do sistema → mapa do navegador, nessa ordem, parando no
 * primeiro que abrir. Versão web SEMPRE tenta o mapa do navegador (regra do repositório: módulo
 * nativo precisa de alternativa no web). `point`/`label` vêm do `DriverTripSnapshot` (endereço
 * exato, só depois do aceite). NÃO testado em aparelho (nenhum dos esquemas `waze://`/`comgooglemaps://`).
 */
export async function openNavigation(point: GeoPoint, label: string): Promise<OpenNavigationResult> {
  if (Platform.OS === 'web') {
    return (await tryOpen(webMapsUrl(point))) ? { ok: true } : { ok: false };
  }
  const candidates = [wazeUrl(point), googleMapsUrl(point), systemMapsUrl(point, label), webMapsUrl(point)];
  for (const url of candidates) {
    if (await tryOpen(url)) return { ok: true };
  }
  return { ok: false };
}
