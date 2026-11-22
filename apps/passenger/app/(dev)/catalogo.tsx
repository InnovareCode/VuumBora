import { useCallback, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  AppShell,
  BrandLogo,
  ConfirmDialog,
  DangerButton,
  EmptyState,
  ErrorState,
  EstimateLabel,
  FooterActions,
  InfoCard,
  LinkButton,
  ListRow,
  LoadingSkeleton,
  MetricCard,
  MoneyText,
  NetworkBanner,
  PasswordInput,
  PhoneInput,
  PressableScale,
  PrimaryButton,
  ScreenHeader,
  SearchInput,
  SecondaryButton,
  SectionHeader,
  SegmentedControl,
  StatusBadge,
  TextInput,
  Toast,
  focusRingStyle,
  textStyle,
  theme,
  useKeyboardFocusRing,
} from '@vuumbora/ui';
import { Bell, CreditCard, Shield } from 'lucide-react-native';
import { CatalogRow } from '../../src/components/catalog/CatalogRow';
import { CatalogSection } from '../../src/components/catalog/CatalogSection';
import { FocusedFieldPreview } from '../../src/components/catalog/FocusedFieldPreview';
import { PressedButtonPreview } from '../../src/components/catalog/PressedButtonPreview';

const LONG_BUTTON_LABEL = 'Confirmar corrida com motorista verificado';

/**
 * Catálogo de componentes — tela de revisão visual (print), não é tela de produto.
 * Mostra todo componente transversal implementado em @vuumbora/ui e seus estados
 * padrão/pressionado-ou-focado/desabilitado/carregando/erro, agrupados e rotulados.
 * "Pressionado"/"focado" são amostras estáticas (ver PressedButtonPreview/FocusedFieldPreview) —
 * são estados de interação real, não dá pra deixar "ligados" numa tela parada.
 */
export default function CatalogScreen() {
  const [textValue, setTextValue] = useState('Rua das Flores, 123');
  const [textErrorValue, setTextErrorValue] = useState('email@invalido');
  const [passwordValue, setPasswordValue] = useState('senha-super-secreta');
  const [passwordErrorValue, setPasswordErrorValue] = useState('123');
  const [phoneValue, setPhoneValue] = useState('');
  const [phoneErrorValue, setPhoneErrorValue] = useState('(11) 9');
  const [searchValue, setSearchValue] = useState('Aeroporto');
  const [searchErrorValue, setSearchErrorValue] = useState('');

  const [demoLoading, setDemoLoading] = useState(false);
  const [demoDone, setDemoDone] = useState(false);
  const demoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runDemo = useCallback(() => {
    setDemoDone(false);
    setDemoLoading(true);
    demoTimer.current = setTimeout(() => {
      setDemoLoading(false);
      setDemoDone(true);
    }, 1200);
  }, []);

  // Onda 0 (d) — componentes novos sem tela de produto ainda: amostras interativas de
  // verdade (não só estática), para a sonda de anel de foco e a medição da Íris alcançarem.
  const [toastVisible, setToastVisible] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [notifyToggle, setNotifyToggle] = useState(true);
  const [periodFilter, setPeriodFilter] = useState('month');

  const handleConfirm = useCallback(() => {
    setConfirmLoading(true);
    setTimeout(() => {
      setConfirmLoading(false);
      setConfirmVisible(false);
    }, 900);
  }, []);

  return (
    <AppShell scroll>
      <ScreenHeader title="Catálogo de componentes" subtitle="Design system VuumBora — @vuumbora/ui" />
      <View style={styles.spacer} />

      <CatalogSection
        title="ScreenHeader"
        description="C-17: align='center' (padrão, caixa da direita espelha a esquerda) e align='left' (legado); com onBack a seta usa ChevronLeft do lucide."
      >
        <CatalogRow label="Centralizado (padrão), sem onBack" stacked>
          <View style={styles.screenHeaderSample}>
            <ScreenHeader title="Para onde vamos?" />
          </View>
        </CatalogRow>
        <CatalogRow label="Centralizado, com onBack" stacked>
          <View style={styles.screenHeaderSample}>
            <ScreenHeader title="Confirmar corrida" onBack={() => undefined} />
          </View>
        </CatalogRow>
        <CatalogRow label="Centralizado, onBack + rightSlot" stacked>
          <View style={styles.screenHeaderSample}>
            <ScreenHeader
              title="Perfil"
              onBack={() => undefined}
              rightSlot={<Bell size={22} color={theme.role.textSecondary} strokeWidth={1.75} />}
            />
          </View>
        </CatalogRow>
        <CatalogRow label={'align="left" (legado), com onBack'} stacked>
          <View style={styles.screenHeaderSample}>
            <ScreenHeader title="Editar endereço" align="left" onBack={() => undefined} />
          </View>
        </CatalogRow>
      </CatalogSection>

      <CatalogSection title="Marca" description="BrandLogo — recortes reais do Apolo (packages/ui/assets/brand), só funcionam sobre fundo escuro.">
        <CatalogRow label="Horizontal (cabeçalho) — sm/md">
          <BrandLogo variant="horizontal" size="sm" />
          <BrandLogo variant="horizontal" size="md" />
        </CatalogRow>
        {/* Tamanho grande numa linha só dele — a palavra "VuumBora" não tem onde
            quebrar, então não pode competir por espaço com outro item na mesma
            linha (achado real do Atlas, não detectável só pela caixa). */}
        <CatalogRow label="Horizontal — lg" stacked>
          <BrandLogo variant="horizontal" size="lg" />
        </CatalogRow>
        <CatalogRow label="Lockup (login)" stacked>
          <BrandLogo variant="lockup" size="md" />
        </CatalogRow>
        <CatalogRow label="Selo (só ícone)">
          <BrandLogo variant="selo" size="sm" />
          <BrandLogo variant="selo" size="md" />
          <BrandLogo variant="selo" size="lg" />
        </CatalogRow>
      </CatalogSection>

      <CatalogSection title="PrimaryButton" description="CTA principal. Tokens: ctaBackground, ctaBackgroundPressed, ctaText.">
        <CatalogRow label="Padrão">
          <PrimaryButton label="Solicitar corrida" onPress={() => undefined} />
        </CatalogRow>
        <CatalogRow label="Pressionado">
          <PressedButtonPreview variant="primary" label="Solicitar corrida" />
        </CatalogRow>
        <CatalogRow label="Desabilitado">
          <PrimaryButton label="Solicitar corrida" disabled onPress={() => undefined} />
        </CatalogRow>
        <CatalogRow label="Carregando">
          <PrimaryButton label="Solicitar corrida" loading onPress={() => undefined} />
        </CatalogRow>
        <CatalogRow label="Erro">
          <PrimaryButton
            label="Solicitar corrida"
            error
            errorMessage="Falha ao enviar. Tente de novo."
            onPress={() => undefined}
          />
        </CatalogRow>
        <CatalogRow label="Rótulo longo (quebra em 2 linhas)" stacked>
          <View style={styles.narrowBox}>
            <PrimaryButton label={LONG_BUTTON_LABEL} onPress={() => undefined} />
          </View>
        </CatalogRow>
      </CatalogSection>

      <CatalogSection title="SecondaryButton" description="Ação de apoio. Tokens: surfaceElevated, surface. Borda: borderControl.">
        <CatalogRow label="Padrão">
          <SecondaryButton label="Ver detalhes" onPress={() => undefined} />
        </CatalogRow>
        <CatalogRow label="Pressionado">
          <PressedButtonPreview variant="secondary" label="Ver detalhes" />
        </CatalogRow>
        <CatalogRow label="Desabilitado">
          <SecondaryButton label="Ver detalhes" disabled onPress={() => undefined} />
        </CatalogRow>
        <CatalogRow label="Carregando">
          <SecondaryButton label="Ver detalhes" loading onPress={() => undefined} />
        </CatalogRow>
        <CatalogRow label="Erro">
          <SecondaryButton label="Ver detalhes" error errorMessage="Não foi possível carregar." onPress={() => undefined} />
        </CatalogRow>
        <CatalogRow label="size=&quot;prominent&quot; (mesma altura do CTA, M6: Recusar/Aceitar)">
          <SecondaryButton label="Recusar" size="prominent" onPress={() => undefined} />
          <DangerButton label="Cancelar corrida" size="prominent" onPress={() => undefined} />
        </CatalogRow>
      </CatalogSection>

      <CatalogSection title="DangerButton" description="Ação destrutiva — contorno dangerFill + fundo levemente tingido, texto danger (§3.1).">
        <CatalogRow label="Padrão">
          <DangerButton label="Cancelar corrida" onPress={() => undefined} />
        </CatalogRow>
        <CatalogRow label="Pressionado">
          <PressedButtonPreview variant="danger" label="Cancelar corrida" />
        </CatalogRow>
        <CatalogRow label="Desabilitado">
          <DangerButton label="Cancelar corrida" disabled onPress={() => undefined} />
        </CatalogRow>
        <CatalogRow label="Carregando">
          <DangerButton label="Cancelar corrida" loading onPress={() => undefined} />
        </CatalogRow>
        <CatalogRow label="Erro">
          <DangerButton label="Cancelar corrida" error errorMessage="Cancelamento recusado." onPress={() => undefined} />
        </CatalogRow>
      </CatalogSection>

      <CatalogSection title="TextInput" description="Campo genérico. Borda de controle = borderControl; foco e erro mudam a borda.">
        <CatalogRow label="Padrão" stacked>
          <TextInput label="Endereço" value={textValue} onChangeText={setTextValue} placeholder="Digite o endereço" />
        </CatalogRow>
        <CatalogRow label="Focado" stacked>
          <FocusedFieldPreview label="Endereço" value={textValue} />
        </CatalogRow>
        <CatalogRow label="Desabilitado" stacked>
          <TextInput label="Endereço" value="Rua bloqueada, 45" onChangeText={() => undefined} disabled />
        </CatalogRow>
        <CatalogRow label="Carregando" stacked>
          <TextInput label="Endereço" value="Buscando endereço..." onChangeText={() => undefined} loading />
        </CatalogRow>
        <CatalogRow label="Erro" stacked>
          <TextInput
            label="Endereço"
            value={textErrorValue}
            onChangeText={setTextErrorValue}
            error
            errorMessage="Endereço não encontrado."
          />
        </CatalogRow>
      </CatalogSection>

      <CatalogSection title="PasswordInput" description="TextInput com alternância Mostrar ou Ocultar (estado local do componente).">
        <CatalogRow label="Padrão" stacked>
          <PasswordInput label="Senha" value={passwordValue} onChangeText={setPasswordValue} />
        </CatalogRow>
        <CatalogRow label="Focado" stacked>
          <FocusedFieldPreview label="Senha" value="••••••••••••••••••" />
        </CatalogRow>
        <CatalogRow label="Desabilitado" stacked>
          <PasswordInput label="Senha" value="bloqueada" onChangeText={() => undefined} disabled />
        </CatalogRow>
        <CatalogRow label="Carregando" stacked>
          <PasswordInput label="Senha" value="validando" onChangeText={() => undefined} loading />
        </CatalogRow>
        <CatalogRow label="Erro" stacked>
          <PasswordInput
            label="Senha"
            value={passwordErrorValue}
            onChangeText={setPasswordErrorValue}
            error
            errorMessage="Mínimo de 8 caracteres."
          />
        </CatalogRow>
      </CatalogSection>

      <CatalogSection title="PhoneInput" description="Máscara (xx) xxxxx-xxxx aplicada na digitação — só formatação, sem regra de negócio.">
        <CatalogRow label="Padrão" stacked>
          <PhoneInput label="Telefone" value={phoneValue} onChangeText={setPhoneValue} />
        </CatalogRow>
        <CatalogRow label="Focado" stacked>
          <FocusedFieldPreview label="Telefone" value="(11) 98765-4321" />
        </CatalogRow>
        <CatalogRow label="Desabilitado" stacked>
          <PhoneInput label="Telefone" value="(11) 90000-0000" onChangeText={() => undefined} disabled />
        </CatalogRow>
        <CatalogRow label="Carregando" stacked>
          <PhoneInput label="Telefone" value="(11) 98765-4321" onChangeText={() => undefined} loading />
        </CatalogRow>
        <CatalogRow label="Erro" stacked>
          <PhoneInput
            label="Telefone"
            value={phoneErrorValue}
            onChangeText={setPhoneErrorValue}
            error
            errorMessage="Número incompleto."
          />
        </CatalogRow>
      </CatalogSection>

      <CatalogSection title="SearchInput" description="Lupa desenhada com Views (sem ícone externo) + botão limpar quando há texto.">
        <CatalogRow label="Padrão" stacked>
          <SearchInput label="Buscar destino" value={searchValue} onChangeText={setSearchValue} />
        </CatalogRow>
        <CatalogRow label="Focado" stacked>
          <FocusedFieldPreview label="Buscar destino" value={searchValue} />
        </CatalogRow>
        <CatalogRow label="Desabilitado" stacked>
          <SearchInput label="Buscar destino" value="" onChangeText={() => undefined} disabled />
        </CatalogRow>
        <CatalogRow label="Carregando" stacked>
          <SearchInput label="Buscar destino" value="Shopping" onChangeText={() => undefined} loading />
        </CatalogRow>
        <CatalogRow label="Erro" stacked>
          <SearchInput
            label="Buscar destino"
            value={searchErrorValue}
            onChangeText={setSearchErrorValue}
            error
            errorMessage="Nenhum destino encontrado."
          />
        </CatalogRow>
      </CatalogSection>

      <CatalogSection title="InfoCard" description="Cartão de informação — interativo só quando recebe onPress.">
        <CatalogRow label="Estático" stacked>
          <InfoCard title="Casa" description="Rua das Acácias, 200 — Ponta Negra" />
        </CatalogRow>
        <CatalogRow label="Interativo" stacked>
          <InfoCard
            title="Trabalho"
            description="Av. Djalma Batista, 1661"
            trailing={<StatusBadge variant="success" label="Salvo" />}
            onPress={() => undefined}
          />
        </CatalogRow>
      </CatalogSection>

      <CatalogSection title="MetricCard" description="Métrica com tendência (sempre glifo + palavra, nunca só a cor).">
        <CatalogRow label="Padrão">
          <MetricCard label="Ganhos hoje" value="R$ 184,50" trend="up" helperText="12 corridas" />
        </CatalogRow>
        <CatalogRow label="Queda">
          <MetricCard label="Avaliação média" value="4,6" trend="down" helperText="últimos 7 dias" />
        </CatalogRow>
        <CatalogRow label="Carregando">
          <MetricCard label="Ganhos hoje" value="" loading />
        </CatalogRow>
      </CatalogSection>

      <CatalogSection title="StatusBadge" description="Todo estado tem glifo além da cor; danger usa dangerFill (nunca danger) com texto branco.">
        <CatalogRow label="Variantes">
          <StatusBadge variant="success" label="Aprovado" />
          <StatusBadge variant="warning" label="Pendente" />
          <StatusBadge variant="info" label="Em análise" />
          <StatusBadge variant="danger" label="Recusado" />
          <StatusBadge variant="neutral" label="Rascunho" />
        </CatalogRow>
      </CatalogSection>

      <CatalogSection title="LoadingSkeleton" description="Pulso de opacidade; respeita 'reduzir movimento' do sistema.">
        <CatalogRow label="Linha" stacked>
          <LoadingSkeleton variant="line" lines={3} />
        </CatalogRow>
        <CatalogRow label="Bloco" stacked>
          <LoadingSkeleton variant="block" height={80} />
        </CatalogRow>
        <CatalogRow label="Círculo">
          <LoadingSkeleton variant="circle" height={48} />
        </CatalogRow>
      </CatalogSection>

      <CatalogSection title="EmptyState" description="Vazio neutro (sem resultado ou histórico) — distinto de ErrorState.">
        <EmptyState
          title="Nenhum destino salvo"
          description="Seus lugares favoritos aparecem aqui."
          action={<PrimaryButton label="Adicionar destino" onPress={() => undefined} />}
        />
      </CatalogSection>

      <CatalogSection title="ErrorState" description="Falha de API ou rede — usa accessibilityRole alert para leitores de tela.">
        <ErrorState
          description="Não foi possível carregar seus dados. Verifique a conexão."
          onRetry={() => undefined}
        />
      </CatalogSection>

      <CatalogSection
        title="NetworkBanner"
        description="C-01: faixa de 'sem rede', role.warning tingido. Sem rede de verdade agora — some sozinha quando a conexão volta. Medir desligando a rede do navegador (Playwright context.setOffline), não um prop de demonstração."
      >
        <CatalogRow label="Montado (só aparece offline)" stacked>
          <NetworkBanner testID="catalog-network-banner" />
        </CatalogRow>
      </CatalogSection>

      <CatalogSection title="SectionHeader" description="C-07: título + ação opcional + MockBadge embaixo (nunca na mesma linha do título).">
        <CatalogRow label="Só título" stacked>
          <SectionHeader title="Destinos salvos" />
        </CatalogRow>
        <CatalogRow label="Com ação" stacked>
          <SectionHeader title="Histórico" action={<LinkButton label="Ver tudo" onPress={() => undefined} />} />
        </CatalogRow>
        <CatalogRow label="Com selo de mock" stacked>
          <SectionHeader title="Formas de pagamento" mock mockLabel="demonstração" />
        </CatalogRow>
      </CatalogSection>

      <CatalogSection title="ListRow + ToggleSwitch" description="C-08: linha de lista (ícone + rótulo/valor + interruptor ou chevron) — promovidos do passageiro.">
        <CatalogRow label="Com valor e chevron" stacked>
          <ListRow icon={<CreditCard size={20} color={theme.role.textSecondary} strokeWidth={1.75} />} label="Forma de pagamento" value="Pix" onPress={() => undefined} />
        </CatalogRow>
        <CatalogRow label="Interruptor (linha inteira é o alvo)" stacked>
          <ListRow
            icon={<Bell size={20} color={theme.role.textSecondary} strokeWidth={1.75} />}
            label="Receber notificações"
            toggle={{ value: notifyToggle, onValueChange: setNotifyToggle }}
            testID="catalog-listrow-toggle"
          />
        </CatalogRow>
        <CatalogRow label="Sem ação (estático)" stacked>
          <ListRow icon={<Shield size={20} color={theme.role.textSecondary} strokeWidth={1.75} />} label="Conta verificada" value="Desde 03/2025" />
        </CatalogRow>
      </CatalogSection>

      <CatalogSection title="SegmentedControl" description="C-16: pílulas de filtro/período — a ativa em amarelo cheio com texto navy (único bloco amarelo além do CTA).">
        <CatalogRow label="Período" stacked>
          <SegmentedControl
            options={[
              { value: 'week', label: 'Esta semana' },
              { value: 'month', label: 'Mês atual' },
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
        <CatalogRow label="Valor final" stacked>
          <MoneyText value={18.9} size="heading" />
        </CatalogRow>
        <CatalogRow label="Valor estimado (rótulo obrigatório)" stacked>
          <MoneyText value={23.5} size="heading" estimated label="Preço estimado" />
        </CatalogRow>
        <CatalogRow label="EstimateLabel isolado (não é dinheiro)" stacked>
          <EstimateLabel>Chega em cerca de 5 min</EstimateLabel>
        </CatalogRow>
      </CatalogSection>

      <CatalogSection title="Toast" description="C-05: confirmação curta, auto-dismiss (theme.motion.duration.toast). Controlado — este botão liga `visible`.">
        <CatalogRow label="Disparar" stacked>
          <PrimaryButton label="Mostrar toast" onPress={() => setToastVisible(true)} testID="catalog-toast-trigger" />
          <View style={styles.toastSlot}>
            <Toast message="Endereço salvo" visible={toastVisible} onDismiss={() => setToastVisible(false)} testID="catalog-toast" />
          </View>
        </CatalogRow>
      </CatalogSection>

      <CatalogSection
        title="ConfirmDialog"
        description="C-03: confirmação com consequência. Foco preso dentro do diálogo no web (Tab não escapa), foco inicial no botão Cancelar, e o foco volta a este botão ao fechar."
      >
        <CatalogRow label="Destrutivo (DangerButton de confirmação)" stacked>
          <SecondaryButton label="Cancelar corrida…" onPress={() => setConfirmVisible(true)} testID="catalog-confirm-trigger" />
          <ConfirmDialog
            visible={confirmVisible}
            title="Cancelar esta corrida?"
            description="O motorista já está a caminho. Cancelamentos frequentes podem afetar sua conta."
            confirmLabel="Cancelar corrida"
            cancelLabel="Manter corrida"
            destructive
            loading={confirmLoading}
            onConfirm={handleConfirm}
            onCancel={() => setConfirmVisible(false)}
            testID="catalog-confirm-dialog"
          />
        </CatalogRow>
      </CatalogSection>

      <CatalogSection title="FooterActions" description="C-04: CTA fixo no rodapé — aqui mostrado inline (dentro do fluxo), o uso real é como `footer` do AppShell.">
        <CatalogRow label="Padrão" stacked>
          <View style={styles.footerActionsSample}>
            <FooterActions elevated={false}>
              <PrimaryButton label="Confirmar corrida" onPress={() => undefined} />
            </FooterActions>
          </View>
        </CatalogRow>
      </CatalogSection>

      <CatalogSection
        title="PressableScale"
        description="C-13: resposta de toque (encolhe para 0,97 em 120ms) — já embutido no ButtonCore acima; aqui como primitivo isolado, com o próprio anel de foco (não vem de graça, ver nota do componente)."
      >
        <CatalogRow label="Alvo com escala" stacked>
          <PressableScaleDemo />
        </CatalogRow>
      </CatalogSection>

      <CatalogSection
        title="Demonstração ao vivo"
        description="Sem chamada de API real — só prova que carregamento e sucesso funcionam de fato (não é estático)."
      >
        <View style={styles.demoRow}>
          <PrimaryButton label="Testar carregamento" loading={demoLoading} onPress={runDemo} />
          {demoDone ? <StatusBadge variant="success" label="Concluído" /> : null}
        </View>
      </CatalogSection>

      <Text style={styles.footer}>Fim do catálogo — {new Date().getFullYear()} VuumBora</Text>
    </AppShell>
  );
}

/**
 * `PressableScale` NÃO inclui o anel de foco de teclado (documentado no próprio componente) —
 * quem o usa direto precisa acrescentar, igual ao `ButtonCore`. Componente à parte para o hook
 * não renderizar o catálogo inteiro a cada Tab (mesma razão de `ScreenHeader.BackButton`).
 */
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
  demoRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing['4'] },
  footer: {
    color: theme.role.textMuted,
    ...textStyle('regular', 'caption'),
    textAlign: 'center',
    marginTop: theme.spacing['4'],
    marginBottom: theme.spacing['8'],
  },
  screenHeaderSample: {
    width: '100%',
    maxWidth: 420,
    borderWidth: 1,
    borderColor: theme.role.border,
    borderRadius: theme.radius.md,
    padding: theme.spacing['2'],
  },
  narrowBox: { width: 220 },
  toastSlot: { alignItems: 'center', minHeight: 40, justifyContent: 'center' },
  // SEM `overflow:'hidden'` de propósito: o anel de foco do PrimaryButton (C-13/ButtonCore) é
  // desenhado POR FORA da caixa do botão — um contêiner com overflow cortaria o anel em algum
  // lado (achado Q1 do Atlas: nenhum contêiner novo pode cortar o anel compartilhado).
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
