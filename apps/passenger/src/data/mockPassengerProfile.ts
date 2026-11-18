/**
 * Identidade exibida na P13 (Perfil) — 100% FABRICADA, sem sessão real (pendência
 * "Controle de sessão", item 1.6 do PLANO). Mesmo padrão de `GreetingRow`/`MockBadge`
 * (ver [[feedback_marcar_dado_mock_visivelmente]] na memória da Lyra).
 */
export interface MockPassengerProfile {
  readonly name: string;
  readonly phoneLabel: string;
}

export const MOCK_PASSENGER_PROFILE: MockPassengerProfile = {
  name: 'Juarez Rocha',
  phoneLabel: '(84) 9 9972-7583',
};
