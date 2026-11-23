import { router } from 'expo-router';
import { ClipboardList, Home as HomeIcon, User } from 'lucide-react-native';
import type { BottomTabBarItem } from '@vuumbora/ui';

export type DriverTabKey = 'inicio' | 'historico' | 'perfil';

const ICON_STROKE = { active: 2.25, inactive: 1.75 } as const;

const ROUTE: Record<DriverTabKey, '/' | '/historico' | '/perfil'> = {
  inicio: '/',
  historico: '/historico',
  perfil: '/perfil',
};

/**
 * As 3 abas de verdade do app do motorista (onda 5). A aba "Ganhos" foi decidida fora pelo Atlas
 * em 22/11/2026 (`docs/fichas-de-tela/README.md`, "Pendências que as fichas não resolvem"): a M11
 * não existe, e destino sem conteúdo real não aparece (mesmo princípio da PP-15) — um total "do
 * dia" sem a tarifa decidida (decisão 7) seria número inventado na tela do motorista.
 *
 * Cada tela de aba chama `buildDriverTabs(suaChave)` e usa o resultado como `footer` do `AppShell`
 * — a MESMA lista de itens em qualquer tela, só o `activeKey` varia (nunca a barra diverge de uma
 * tela pra outra). `router.replace` (nunca `push`): trocar de aba não empilha tela, mesmo padrão já
 * usado por M05/M13 antes desta rodada. Tocar na aba já ativa não navega (evita um `replace` para a
 * própria rota).
 *
 * Não é um grupo `Tabs` do expo-router: o `AppShell.footer` já resolve o slot fixo sem rolar, e usar
 * `Tabs` exigiria o `AppShell` aceitar um `edges`/`semRodape` (mudança em `packages/ui`, fora da
 * zona desta fatia) para não somar a inset de baixo duas vezes (uma vez pelo navegador de abas,
 * outra pela própria `SafeAreaView` do `AppShell`). Pendência registrada para quem migrar de vez —
 * ver PARA O PRÓXIMO do handoff.
 */
export function buildDriverTabs(activeKey: DriverTabKey): readonly BottomTabBarItem[] {
  function go(key: DriverTabKey) {
    if (key === activeKey) return;
    router.replace(ROUTE[key]);
  }

  return [
    {
      key: 'inicio',
      label: 'Início',
      icon: ({ color, active }) => <HomeIcon size={22} color={color} strokeWidth={active ? ICON_STROKE.active : ICON_STROKE.inactive} />,
      onPress: () => go('inicio'),
    },
    {
      key: 'historico',
      label: 'Histórico',
      icon: ({ color, active }) => (
        <ClipboardList size={22} color={color} strokeWidth={active ? ICON_STROKE.active : ICON_STROKE.inactive} />
      ),
      onPress: () => go('historico'),
    },
    {
      key: 'perfil',
      label: 'Perfil',
      icon: ({ color, active }) => <User size={22} color={color} strokeWidth={active ? ICON_STROKE.active : ICON_STROKE.inactive} />,
      onPress: () => go('perfil'),
    },
  ];
}
