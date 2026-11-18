import { useCallback, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  AppShell,
  BrandLogo,
  DangerButton,
  EmptyState,
  ErrorState,
  InfoCard,
  LoadingSkeleton,
  MetricCard,
  PasswordInput,
  PhoneInput,
  PrimaryButton,
  ScreenHeader,
  SearchInput,
  SecondaryButton,
  StatusBadge,
  TextInput,
  textStyle,
  theme,
} from '@vuumbora/ui';
import { CatalogRow } from '../src/components/catalog/CatalogRow';
import { CatalogSection } from '../src/components/catalog/CatalogSection';
import { FocusedFieldPreview } from '../src/components/catalog/FocusedFieldPreview';
import { PressedButtonPreview } from '../src/components/catalog/PressedButtonPreview';

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

  return (
    <AppShell scroll>
      <ScreenHeader title="Catálogo de componentes" subtitle="Design system VuumBora — @vuumbora/ui" />
      <View style={styles.spacer} />

      <CatalogSection title="Marca" description="BrandLogo — selo + nome, só com tokens (sem bitmap).">
        <CatalogRow label="Pequeno/médio">
          <BrandLogo size="sm" />
          <BrandLogo size="md" />
        </CatalogRow>
        {/* Tamanho grande numa linha só dele — a palavra "VuumBora" não tem onde
            quebrar, então não pode competir por espaço com outro item na mesma
            linha (achado real do Atlas, não detectável só pela caixa). */}
        <CatalogRow label="Grande" stacked>
          <BrandLogo size="lg" />
        </CatalogRow>
        <CatalogRow label="Sem nome">
          <BrandLogo withWordmark={false} size="lg" />
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
      </CatalogSection>

      <CatalogSection title="DangerButton" description="Ação destrutiva — fundo dangerFill (nunca danger), texto branco.">
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
});
