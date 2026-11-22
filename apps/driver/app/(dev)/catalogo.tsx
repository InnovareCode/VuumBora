import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  AppShell,
  ConfirmDialog,
  DangerButton,
  EstimateLabel,
  FooterActions,
  LinkButton,
  ListRow,
  MoneyText,
  NetworkBanner,
  PressableScale,
  PrimaryButton,
  ScreenHeader,
  SecondaryButton,
  SectionHeader,
  SegmentedControl,
  Toast,
  focusRingStyle,
  textStyle,
  theme,
  useKeyboardFocusRing,
} from '@vuumbora/ui';
import { Bell, Star } from 'lucide-react-native';
import { CatalogRow } from '../../src/components/catalog/CatalogRow';
import { CatalogSection } from '../../src/components/catalog/CatalogSection';

const LONG_BUTTON_LABEL = 'Confirmar chegada ao ponto de embarque do passageiro';

/**
 * Catálogo de componentes — tela de revisão visual (print), não é tela de produto.
 * Diferente do catálogo do passageiro (que cobre a biblioteca inteira), este cobre só os
 * componentes novos da onda 0(d) do F09 que ainda não têm nenhuma tela de produto nos dois
 * apps — é a "equivalente do motorista" pedida pelo Atlas (22/11/2026), com rótulos do
 * perfil motorista em vez de repetir o catálogo do passageiro.
 */
export default function CatalogScreen() {
  const [toastVisible, setToastVisible] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [notifyToggle, setNotifyToggle] = useState(true);
  const [periodFilter, setPeriodFilter] = useState('today');

  const handleConfirm = useCallback(() => {
    setConfirmLoading(true);
    setTimeout(() => {
      setConfirmLoading(false);
      setConfirmVisible(false);
    }, 900);
  }, []);

  return (
    <AppShell scroll>
      <ScreenHeader title="Catálogo (motorista)" subtitle="Componentes novos da onda 0 — @vuumbora/ui" />
      <View style={styles.spacer} />

      <CatalogSection
        title="ScreenHeader"
        description="C-17: align='center' (padrão) e align='left' (legado); com onBack a seta usa ChevronLeft do lucide."
      >
        <CatalogRow label="Centralizado, sem onBack" stacked>
          <View style={styles.sample}>
            <ScreenHeader title="Nova corrida" />
          </View>
        </CatalogRow>
        <CatalogRow label="Centralizado, com onBack" stacked>
          <View style={styles.sample}>
            <ScreenHeader title="Documentos" onBack={() => undefined} />
          </View>
        </CatalogRow>
        <CatalogRow label={'align="left" (legado), com onBack'} stacked>
          <View style={styles.sample}>
            <ScreenHeader title="Editar veículo" align="left" onBack={() => undefined} />
          </View>
        </CatalogRow>
      </CatalogSection>

      <CatalogSection title="ButtonCore — variações" description="size=&quot;prominent&quot; (mesma altura do CTA, M6: Recusar/Aceitar) e rótulo longo (quebra em 2 linhas).">
        <CatalogRow label="Recusar / Aceitar, mesma altura">
          <SecondaryButton label="Recusar" size="prominent" onPress={() => undefined} />
          <PrimaryButton label="Aceitar" size="prominent" onPress={() => undefined} />
        </CatalogRow>
        <CatalogRow label="Rótulo longo (quebra em 2 linhas)" stacked>
          <View style={styles.narrowBox}>
            <PrimaryButton label={LONG_BUTTON_LABEL} onPress={() => undefined} />
          </View>
        </CatalogRow>
      </CatalogSection>

      <CatalogSection
        title="NetworkBanner"
        description="C-01: faixa de 'sem rede'. Sem rede de verdade agora — medir desligando a rede do navegador (Playwright context.setOffline)."
      >
        <CatalogRow label="Montado (só aparece offline)" stacked>
          <NetworkBanner testID="catalog-network-banner" />
        </CatalogRow>
      </CatalogSection>

      <CatalogSection title="SectionHeader" description="C-07: título + ação opcional + MockBadge embaixo.">
        <CatalogRow label="Só título" stacked>
          <SectionHeader title="Corridas de hoje" />
        </CatalogRow>
        <CatalogRow label="Com ação" stacked>
          <SectionHeader title="Histórico" action={<LinkButton label="Ver tudo" onPress={() => undefined} />} />
        </CatalogRow>
        <CatalogRow label="Com selo de mock" stacked>
          <SectionHeader title="Ganhos" mock mockLabel="demonstração" />
        </CatalogRow>
      </CatalogSection>

      <CatalogSection title="ListRow + ToggleSwitch" description="C-08: linha de lista — promovidos do passageiro, compartilhados pelos dois perfis.">
        <CatalogRow label="Com valor e chevron" stacked>
          <ListRow icon={<Star size={20} color={theme.role.textSecondary} strokeWidth={1.75} />} label="Avaliação" value="4,9" onPress={() => undefined} />
        </CatalogRow>
        <CatalogRow label="Interruptor (linha inteira é o alvo)" stacked>
          <ListRow
            icon={<Bell size={20} color={theme.role.textSecondary} strokeWidth={1.75} />}
            label="Alertar sobre corridas de alta demanda"
            toggle={{ value: notifyToggle, onValueChange: setNotifyToggle }}
            testID="catalog-listrow-toggle"
          />
        </CatalogRow>
      </CatalogSection>

      <CatalogSection title="SegmentedControl" description="C-16: pílulas de filtro/período (Histórico e Ganhos usam o mesmo controle).">
        <CatalogRow label="Período" stacked>
          <SegmentedControl
            options={[
              { value: 'today', label: 'Hoje' },
              { value: 'week', label: 'Esta semana' },
              { value: 'all', label: 'Anteriores' },
            ]}
            value={periodFilter}
            onChange={setPeriodFilter}
            accessibilityLabel="Filtrar por período"
            testID="catalog-segmented"
          />
        </CatalogRow>
      </CatalogSection>

      <CatalogSection title="MoneyText + EstimateLabel" description="C-10: Intl.NumberFormat pt-BR + tabularNums; `estimated:true` exige `label` em tempo de compilação.">
        <CatalogRow label="Total do dia" stacked>
          <MoneyText value={236.7} size="heading" label="Total hoje" />
        </CatalogRow>
        <CatalogRow label="Valor estimado (rótulo obrigatório)" stacked>
          <MoneyText value={18.9} size="heading" estimated label="Valor estimado" />
        </CatalogRow>
        <CatalogRow label="EstimateLabel isolado" stacked>
          <EstimateLabel>Passageiro a 320 m</EstimateLabel>
        </CatalogRow>
      </CatalogSection>

      <CatalogSection title="Toast" description="C-05: confirmação curta, auto-dismiss (theme.motion.duration.toast).">
        <CatalogRow label="Disparar" stacked>
          <PrimaryButton label="Mostrar toast" onPress={() => setToastVisible(true)} testID="catalog-toast-trigger" />
          <View style={styles.toastSlot}>
            <Toast message="Avaliação enviada" visible={toastVisible} onDismiss={() => setToastVisible(false)} testID="catalog-toast" />
          </View>
        </CatalogRow>
      </CatalogSection>

      <CatalogSection
        title="ConfirmDialog"
        description="C-03: foco preso dentro do diálogo no web, foco inicial no botão Cancelar, foco volta a este botão ao fechar."
      >
        <CatalogRow label="Destrutivo" stacked>
          <SecondaryButton label="Sair da conta…" onPress={() => setConfirmVisible(true)} testID="catalog-confirm-trigger" />
          <ConfirmDialog
            visible={confirmVisible}
            title="Sair da conta?"
            description="Você vai precisar entrar de novo para ficar online."
            confirmLabel="Sair"
            cancelLabel="Continuar logado"
            destructive
            loading={confirmLoading}
            onConfirm={handleConfirm}
            onCancel={() => setConfirmVisible(false)}
            testID="catalog-confirm-dialog"
          />
        </CatalogRow>
      </CatalogSection>

      <CatalogSection title="FooterActions" description="C-04: CTA fixo no rodapé — aqui mostrado inline, o uso real é como `footer` do AppShell.">
        <CatalogRow label="Padrão" stacked>
          <View style={styles.footerActionsSample}>
            <FooterActions elevated={false}>
              <PrimaryButton label="Ficar online" onPress={() => undefined} />
            </FooterActions>
          </View>
        </CatalogRow>
      </CatalogSection>

      <CatalogSection
        title="PressableScale"
        description="C-13: resposta de toque (0,97 em 120ms) — já embutido no ButtonCore acima; aqui como primitivo isolado, com o próprio anel de foco."
      >
        <CatalogRow label="Alvo com escala" stacked>
          <PressableScaleDemo />
        </CatalogRow>
      </CatalogSection>

      <CatalogSection title="DangerButton" description="Ação destrutiva.">
        <CatalogRow label="Padrão">
          <DangerButton label="Cancelar corrida" onPress={() => undefined} />
        </CatalogRow>
      </CatalogSection>

      <Text style={styles.footer}>Fim do catálogo (motorista) — {new Date().getFullYear()} VuumBora</Text>
    </AppShell>
  );
}

function PressableScaleDemo() {
  const { focusVisible, focusProps } = useKeyboardFocusRing();
  return (
    <PressableScale
      {...focusProps}
      onPress={() => undefined}
      accessibilityRole="button"
      accessibilityLabel="Alvo de demonstração do PressableScale"
      style={focusVisible ? pressableScaleFocusRing : undefined}
      testID="catalog-pressablescale"
    >
      <View style={styles.pressableScaleBox}>
        <Text style={styles.pressableScaleLabel}>Pressione e segure</Text>
      </View>
    </PressableScale>
  );
}

const pressableScaleFocusRing = focusRingStyle('outside', theme.radius.md);

const styles = StyleSheet.create({
  spacer: { height: theme.spacing['5'] },
  footer: {
    color: theme.role.textMuted,
    ...textStyle('regular', 'caption'),
    textAlign: 'center',
    marginTop: theme.spacing['4'],
    marginBottom: theme.spacing['8'],
  },
  sample: {
    width: '100%',
    maxWidth: 420,
    borderWidth: 1,
    borderColor: theme.role.border,
    borderRadius: theme.radius.md,
    padding: theme.spacing['2'],
  },
  narrowBox: { width: 220 },
  toastSlot: { alignItems: 'center', minHeight: 40, justifyContent: 'center' },
  // SEM `overflow:'hidden'` de propósito — cortaria o anel de foco (achado Q1 do Atlas).
  footerActionsSample: {
    width: '100%',
    maxWidth: 420,
    borderWidth: 1,
    borderColor: theme.role.border,
    borderRadius: theme.radius.md,
    padding: theme.spacing['1'],
  },
  pressableScaleBox: {
    minHeight: theme.layout.buttonHeight,
    minWidth: theme.layout.touchTarget,
    borderRadius: theme.radius.md,
    backgroundColor: theme.role.surfaceElevated,
    borderWidth: 1.5,
    borderColor: theme.role.borderControl,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing['4'],
  },
  pressableScaleLabel: { color: theme.role.textPrimary, ...textStyle('semibold', 'body') },
});
