/**
 * Web: a API de localização do navegador. `permissions.query` diz o estado sem perguntar (nem todo navegador o tem:
 * sem ele, tratamos como `prompt`, e a pré-permissão da P03 explica antes de o navegador perguntar).
 *
 * Tipos do navegador declarados à mão (mínimos): o app compila sem a `lib` DOM, e puxá-la para um arquivo a puxa para o
 * programa inteiro (mesma lição do `documentPicker.web.ts` do motorista).
 */
import type { LocationFix, LocationPermission, LocationPort } from './locationPort.types';

/** Prazo da leitura: além disso, a P03 mostra "Não achamos sua localização" com "Tentar de novo". */
const POSITION_TIMEOUT_MS = 10_000;
/** Aceita uma posição de até 1 min: abrir a P04 logo depois da P03 não pergunta de novo. */
const POSITION_MAX_AGE_MS = 60_000;

/** `GeolocationPositionError.code`: 1 = negada, 2 = indisponível, 3 = prazo. */
const PERMISSION_DENIED = 1;
const TIMEOUT = 3;

interface BrowserPosition {
  readonly coords: { readonly latitude: number; readonly longitude: number; readonly accuracy: number };
}

interface BrowserGeolocation {
  getCurrentPosition(
    success: (position: BrowserPosition) => void,
    failure: (error: { readonly code: number }) => void,
    options: { readonly enableHighAccuracy: boolean; readonly timeout: number; readonly maximumAge: number },
  ): void;
}

interface BrowserNavigator {
  readonly geolocation?: BrowserGeolocation;
  readonly permissions?: { query(descriptor: { readonly name: 'geolocation' }): Promise<{ readonly state: string }> };
}

function browserNavigator(): BrowserNavigator | undefined {
  return (globalThis as { navigator?: BrowserNavigator }).navigator;
}

async function permission(): Promise<LocationPermission> {
  const nav = browserNavigator();
  if (!nav?.geolocation) return 'unavailable';
  if (!nav.permissions) return 'prompt';
  try {
    const status = await nav.permissions.query({ name: 'geolocation' });
    if (status.state === 'granted') return 'granted';
    if (status.state === 'denied') return 'denied';
    return 'prompt';
  } catch {
    return 'prompt';
  }
}

function currentPosition(): Promise<LocationFix> {
  const api = browserNavigator()?.geolocation;
  if (!api) return Promise.resolve({ ok: false, reason: 'unavailable' });
  return new Promise((resolve) => {
    api.getCurrentPosition(
      (position) =>
        resolve({
          ok: true,
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          ...(Number.isFinite(position.coords.accuracy) ? { accuracyM: Math.round(position.coords.accuracy) } : {}),
        }),
      (error) => {
        if (error.code === PERMISSION_DENIED) resolve({ ok: false, reason: 'denied' });
        else if (error.code === TIMEOUT) resolve({ ok: false, reason: 'timeout' });
        else resolve({ ok: false, reason: 'position_unavailable' });
      },
      { enableHighAccuracy: true, timeout: POSITION_TIMEOUT_MS, maximumAge: POSITION_MAX_AGE_MS },
    );
  });
}

export const locationPort: LocationPort = { permission, currentPosition };
