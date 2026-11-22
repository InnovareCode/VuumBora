import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Check, KeyRound, Trash2 } from 'lucide-react';
import { useApi } from '../../context/ApiContext';
import { errorMessage, type ApiError, type EmailSettings, type EmailSettingsInput } from '../../api';
import { AuthAlert } from '../auth/AuthAlert';
import { StepUpDialog } from '../security/StepUpDialog';
import { SettingField, controlClass } from './SettingField';

/** Portas aceitas pela API (`ALLOWED_PANEL_PORTS`) — pareado por comentário; o servidor é quem valida de verdade. */
const PORT_OPTIONS: readonly { readonly value: number; readonly label: string }[] = [
  { value: 587, label: '587 — STARTTLS' },
  { value: 465, label: '465 — TLS direto' },
  { value: 2525, label: '2525 — STARTTLS (alternativa)' },
  { value: 25, label: '25 — STARTTLS' },
];

const FIELD_ERROR: Record<string, string> = {
  host: 'Informe só o endereço do servidor, sem http://, porta ou barra (ex.: smtp.seudominio.com.br).',
  port: 'Escolha uma das portas: 25, 465, 587 ou 2525.',
  user: 'O usuário não pode ter quebra de linha nem caracteres de controle.',
  from: 'Use o formato Nome <email@dominio> ou email@dominio.',
  password: 'A senha informada não é aceita (tamanho ou caracteres inválidos).',
};

type FieldName = 'host' | 'port' | 'user' | 'password' | 'from';

/** Ordem do documento = ordem do Tab: servidor, porta, usuário, senha, remetente. */
const FIELD_ORDER: readonly FieldName[] = ['host', 'port', 'user', 'password', 'from'];

interface FormState {
  readonly host: string;
  readonly port: string;
  readonly user: string;
  readonly from: string;
  readonly password: string;
}

const isBlank = (value: string): boolean => value.trim() === '';
const blankToNull = (value: string): string | null => (isBlank(value) ? null : value.trim());

/**
 * Servidor, porta, usuário e senha são UMA unidade de origem (revisão S1 rodada 2, I-1): sem servidor no painel,
 * porta/usuário/senha vêm todos do ambiente e o que sobrou gravado no painel é ignorado pelo servidor — então a
 * tela os mostra em branco, não como se valessem.
 */
function normalize(form: FormState): FormState {
  return isBlank(form.host) ? { ...form, host: '', port: '', user: '', password: '' } : form;
}

function initialState(panel: EmailSettings['panel']): FormState {
  return normalize({
    host: panel.host ?? '',
    port: panel.port != null ? String(panel.port) : '',
    user: panel.user ?? '',
    from: panel.from ?? '',
    password: '',
  });
}

/** Sem servidor: porta, usuário e senha vão em branco (o servidor recusa a mistura com 400). Com servidor: só a senha tem "ausente = mantém". */
function buildInput(form: FormState): EmailSettingsInput {
  const host = blankToNull(form.host);
  if (host == null) return { host: null, port: null, user: null, from: blankToNull(form.from) };
  return {
    host,
    port: form.port === '' ? null : Number(form.port),
    user: blankToNull(form.user),
    from: blankToNull(form.from),
    ...(form.password !== '' ? { password: form.password } : {}),
  };
}

/**
 * Formulário SMTP. O servidor decide a origem de porta, usuário e senha: em branco,
 * os quatro vêm do ambiente; preenchido, vêm todos daqui (a porta é obrigatória e as
 * variáveis `SMTP_PORT`/`SMTP_USER`/`SMTP_PASS` NUNCA são usadas com um servidor do
 * painel — a credencial da infraestrutura não pode ir a um endereço digitado no painel).
 * Só o remetente é independente. Senha em branco = "mantém a salva".
 *
 * Salvar pede a reautenticação do dono (senha atual + TOTP) num diálogo; nada disto vai
 * a storage ou log: a senha do SMTP digitada vive só neste estado, é apagada assim que o
 * salvamento dá certo e NUNCA volta do servidor (só `saved`).
 *
 * `onDirtyChange` avisa o bloco de teste: o teste usa a configuração SALVA,
 * então testar com alteração pendente mediria outra coisa.
 */
export function EmailSettingsForm({
  settings,
  onChanged,
  onDirtyChange,
}: {
  readonly settings: EmailSettings;
  readonly onChanged: (next: EmailSettings) => void;
  readonly onDirtyChange: (dirty: boolean) => void;
}) {
  const api = useApi();
  const baseId = useId();
  const id = (name: string) => `${baseId}-${name}`;
  const refs = useRef<Partial<Record<FieldName, HTMLInputElement | HTMLSelectElement | null>>>({});
  const [form, setForm] = useState<FormState>(() => initialState(settings.panel));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  /** Estado do formulário congelado quando o diálogo de reautenticação abre (ele é modal: nada muda enquanto isso). */
  const [pendingInput, setPendingInput] = useState<EmailSettingsInput | null>(null);
  const [removeOpen, setRemoveOpen] = useState(false);
  /** Campo que recebe o foco quando o diálogo fechar (senão o foco volta ao botão que o abriu). */
  const [focusNext, setFocusNext] = useState<FieldName | null>(null);

  const hostBlank = isBlank(form.host);
  const baseline = initialState(settings.panel);
  // `form` guarda o que a pessoa digitou (voltar a preencher o servidor traz os valores de volta); a TELA e o envio usam
  // `shown`: sem servidor, porta, usuário e senha aparecem e vão em branco.
  const shown = normalize(form);
  const dirty = (Object.keys(baseline) as (keyof FormState)[]).some((key) => shown[key].trim() !== baseline[key].trim());
  // Trocar o servidor com uma senha salva e o campo em branco: a senha salva segue valendo e vai ao NOVO servidor.
  const hostChangedKeepingPassword =
    !hostBlank && settings.panel.passwordSaved && settings.panel.host != null && form.host.trim() !== settings.panel.host.trim() && form.password === '';
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  // O diálogo (salvar / remover) devolve o foco ao botão que o abriu; quando o destino certo é outro campo (erro de
  // campo, senha removida), este efeito roda DEPOIS do desmonte do diálogo e leva o foco para lá.
  useEffect(() => {
    if (focusNext && pendingInput === null && !removeOpen) {
      refs.current[focusNext]?.focus();
      setFocusNext(null);
    }
  }, [focusNext, pendingInput, removeOpen]);

  function update<K extends keyof FormState>(key: K, value: string) {
    setForm((previous) => ({ ...previous, [key]: value }));
    setSaved(false);
    // Mudar o servidor muda a regra da porta (obrigatória ou não): o erro de porta de antes não vale mais.
    setFieldErrors((errors) => {
      const next = { ...errors };
      delete next[key];
      if (key === 'host') delete next['port'];
      return next;
    });
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!dirty || pendingInput) return;
    setSaved(false);
    setFormError(null);
    setFieldErrors({});
    // Com servidor, a porta é obrigatória (contrato). Conferir aqui evita gastar o código do app numa tentativa que o servidor recusaria.
    if (!hostBlank && form.port === '') {
      setFieldErrors({ port: 'Escolha a porta: ela é obrigatória quando o servidor é definido aqui.' });
      refs.current.port?.focus();
      return;
    }
    setPendingInput(buildInput(form));
  }

  /** Erros que pertencem ao FORMULÁRIO (não à reautenticação): fecham o diálogo e aparecem no campo certo. Devolve `true` se tratou. */
  function handleRejected(error: ApiError): boolean {
    if (error.kind === 'validation') {
      // `stepUp` ausente/malformado não acontece (os dois campos são obrigatórios na tela); os demais nomes são campos do formulário.
      const names = Object.keys(error.fields).filter((name) => name !== 'stepUp');
      if (names.length === 0) return false;
      const next: Record<string, string> = {};
      for (const name of names) next[name] = FIELD_ERROR[name] ?? 'Valor inválido.';
      setFieldErrors(next);
      setFocusNext(FIELD_ORDER.find((name) => next[name]) ?? null);
      setPendingInput(null);
      return true;
    }
    if (error.kind === 'smtp_host_blocked') {
      setFieldErrors({ host: errorMessage(error) });
      setFocusNext('host');
      setPendingInput(null);
      return true;
    }
    if (error.kind === 'encryption_unavailable') {
      setFormError(errorMessage(error));
      setPendingInput(null);
      return true;
    }
    return false;
  }

  const returningToEnvironment = pendingInput !== null && pendingInput.host === null && settings.panel.host != null;

  const passwordNote = !settings.canStorePassword
    ? 'Este servidor não tem a chave de cifra configurada, então o painel não consegue guardar a senha com segurança. Defina a senha pela variável de ambiente SMTP_PASS.'
    : hostChangedKeepingPassword
      ? 'Você mudou o servidor: a senha salva será enviada ao novo servidor. Se for outra, digite-a aqui.'
      : settings.panel.passwordSaved
        ? 'Em branco mantém a senha salva; digite para trocar. O valor salvo nunca é mostrado.'
        : 'A senha é guardada cifrada e nunca volta a ser exibida.';

  return (
    // Os diálogos ficam FORA do <form>: cada um tem o próprio <form> e formulário dentro de formulário é HTML inválido
    // (o envio de um dispararia o do outro). Eles são `position: fixed`, então a posição no DOM não muda o visual.
    <>
    <form onSubmit={handleSubmit} noValidate className="space-y-5" aria-labelledby={id('title')}>
      <div>
        <h2 id={id('title')} className="text-subtitle font-bold text-text">
          Servidor de envio (SMTP)
        </h2>
        <p className="mt-1 text-small text-text-secondary">
          O selo ao lado de cada campo mostra de onde vem o valor em uso. <strong className="font-bold text-text">Servidor, porta, usuário e senha formam um conjunto:</strong> ou
          todos vêm daqui, ou todos vêm das variáveis de ambiente. Com um servidor definido aqui, as variáveis de ambiente de porta, usuário e senha nunca são
          usadas — a credencial da infraestrutura não é enviada a um endereço escolhido no painel. Só o remetente é independente.
        </p>
      </div>

      {formError && <AuthAlert kind="error">{formError}</AuthAlert>}

      <div className="grid gap-5 sm:grid-cols-2">
        <SettingField
          id={id('host')}
          label="Servidor (host)"
          source={settings.fields.host.source}
          error={fieldErrors['host']}
          effective={settings.fields.host.source === 'env' ? <>Em uso: <strong className="font-bold text-text">{settings.fields.host.value}</strong></> : undefined}
          hint="Só o endereço, sem http:// nem porta. Em branco: servidor, porta, usuário e senha vêm das variáveis de ambiente (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS)."
        >
          {(control) => (
            <input
              {...control}
              ref={(el) => {
                refs.current.host = el;
              }}
              type="text"
              inputMode="url"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="smtp.seudominio.com.br"
              value={form.host}
              onChange={(e) => update('host', e.target.value)}
              className={controlClass}
            />
          )}
        </SettingField>

        <SettingField
          id={id('port')}
          label="Porta"
          source={settings.fields.port.source}
          error={fieldErrors['port']}
          effective={settings.fields.port.source === 'env' ? <>Em uso: <strong className="font-bold text-text">{settings.fields.port.value}</strong></> : undefined}
          hint={
            hostBlank
              ? 'Vem do ambiente (SMTP_PORT) junto com o servidor. Defina um servidor acima para escolher a porta aqui.'
              : 'Obrigatória com servidor definido aqui; a variável SMTP_PORT não é usada. 465 usa TLS direto; as demais exigem STARTTLS.'
          }
        >
          {(control) => (
            <select
              {...control}
              ref={(el) => {
                refs.current.port = el;
              }}
              aria-required={hostBlank ? undefined : true}
              disabled={hostBlank}
              value={shown.port}
              onChange={(e) => update('port', e.target.value)}
              className={controlClass}
            >
              <option value="">{hostBlank ? 'Vem do ambiente' : 'Escolha a porta'}</option>
              {PORT_OPTIONS.map((option) => (
                <option key={option.value} value={String(option.value)}>
                  {option.label}
                </option>
              ))}
            </select>
          )}
        </SettingField>

        <SettingField
          id={id('user')}
          label="Usuário"
          source={settings.fields.user.source}
          error={fieldErrors['user']}
          effective={settings.fields.user.source === 'env' ? <>Em uso: <strong className="font-bold text-text">{settings.fields.user.value}</strong></> : undefined}
          hint={
            hostBlank
              ? 'Vem do ambiente (SMTP_USER) junto com o servidor.'
              : 'Deixe em branco se o servidor não exige login. A variável SMTP_USER não é usada com servidor definido aqui.'
          }
        >
          {(control) => (
            <input
              {...control}
              ref={(el) => {
                refs.current.user = el;
              }}
              type="text"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              disabled={hostBlank}
              placeholder={hostBlank ? '' : 'envio@seudominio.com.br'}
              value={shown.user}
              onChange={(e) => update('user', e.target.value)}
              className={controlClass}
            />
          )}
        </SettingField>

        <SettingField
          id={id('password')}
          label="Senha"
          source={settings.fields.password.source}
          error={fieldErrors['password']}
          effective={
            settings.fields.password.source === 'env' ? (
              <>Em uso: senha da variável de ambiente <code className="font-mono">SMTP_PASS</code> (valor não exibido).</>
            ) : settings.fields.password.saved ? (
              <span className="inline-flex items-center gap-1.5 font-bold text-success">
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
                Senha salva
              </span>
            ) : undefined
          }
          hint={hostBlank ? 'Vem do ambiente (SMTP_PASS) junto com o servidor.' : passwordNote}
        >
          {(control) => (
            <input
              {...control}
              ref={(el) => {
                refs.current.password = el;
              }}
              type="password"
              // `new-password`: impede o navegador de preencher com a senha do PRÓPRIO painel (que não é a do SMTP).
              autoComplete="new-password"
              autoCapitalize="none"
              spellCheck={false}
              disabled={hostBlank || !settings.canStorePassword}
              placeholder={!hostBlank && settings.panel.passwordSaved ? '•••••••• (salva — digite só para trocar)' : ''}
              value={shown.password}
              onChange={(e) => update('password', e.target.value)}
              className={controlClass}
            />
          )}
        </SettingField>

        {settings.panel.passwordSaved && settings.canStorePassword && (
          <div className="sm:col-span-2">
            {hostBlank && settings.panel.host == null && (
              <p className="mb-1 text-caption text-text-muted">
                Há uma senha antiga guardada no painel que não está em uso (o servidor vem do ambiente). Remova-a para não ficar senha esquecida.
              </p>
            )}
            <button
              type="button"
              onClick={() => setRemoveOpen(true)}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-small font-bold text-danger outline-none transition-colors hover:bg-danger-fill hover:text-white focus-visible:ring-2 focus-visible:ring-info"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              Remover a senha salva
            </button>
          </div>
        )}

        <SettingField
          id={id('from')}
          label="Remetente"
          source={settings.fields.from.source}
          error={fieldErrors['from']}
          effective={settings.fields.from.source === 'env' ? <>Em uso: <strong className="font-bold text-text">{settings.fields.from.value}</strong></> : undefined}
          hint="Quem aparece como autor do e-mail: Nome <email@dominio>. Em branco: variável EMAIL_FROM. Este campo é independente do servidor."
          className="sm:col-span-2"
        >
          {(control) => (
            <input
              {...control}
              ref={(el) => {
                refs.current.from = el;
              }}
              type="text"
              autoComplete="off"
              spellCheck={false}
              placeholder="VuumBora <ola@seudominio.com.br>"
              value={form.from}
              onChange={(e) => update('from', e.target.value)}
              className={controlClass}
            />
          )}
        </SettingField>
      </div>

      <div className="space-y-2 border-t border-border pt-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <button
            type="submit"
            // `aria-disabled` (não `disabled`): desabilitar o botão que tem o foco o joga no <body>.
            aria-disabled={!dirty}
            onClick={(e) => {
              if (!dirty) e.preventDefault();
            }}
            className="flex h-12 items-center justify-center rounded-xl bg-cta px-6 text-body font-bold text-on-cta outline-none transition-colors hover:bg-cta-pressed focus-visible:ring-2 focus-visible:ring-info aria-disabled:cursor-not-allowed aria-disabled:opacity-60 aria-disabled:hover:bg-cta"
          >
            Salvar
          </button>
          <p role="status" className="text-small font-medium text-text-secondary">
            {saved ? 'Configuração salva.' : dirty ? 'Há alterações não salvas.' : ''}
          </p>
        </div>
        <p className="text-caption text-text-muted">
          Para salvar, pedimos a sua senha de acesso ao painel e o código do app autenticador: este servidor envia os códigos de verificação e de recuperação de
          senha dos apps.
        </p>
      </div>
    </form>

      {pendingInput && (
        <StepUpDialog
          title="Confirmar alteração do e-mail"
          intro={
            <>
              Confirme que é você: quem controla o servidor de e-mail recebe os códigos de verificação e de recuperação de senha dos apps.
              {returningToEnvironment && (
                <>
                  {' '}
                  O servidor volta a vir das variáveis de ambiente{settings.panel.passwordSaved ? ' e a senha salva no painel será apagada' : ''}.
                </>
              )}
            </>
          }
          submitLabel="Confirmar e salvar"
          pendingLabel="Salvando…"
          onClose={() => setPendingInput(null)}
          run={(stepUp) => api.emailSettings.save(pendingInput, stepUp)}
          onRejected={handleRejected}
          onDone={(next) => {
            setPendingInput(null);
            setForm(initialState(next.panel));
            setSaved(true);
            onChanged(next);
          }}
        />
      )}

      {removeOpen && (
        <StepUpDialog
          danger
          title="Remover a senha salva?"
          intro={
            <>
              <KeyRound className="mr-1.5 inline h-4 w-4 align-text-bottom" aria-hidden="true" />A senha guardada no painel será apagada. Se o servidor de e-mail
              exige login, o envio deixa de funcionar até você salvar uma senha de novo. Confirme com a sua senha de acesso e o código do app autenticador.
            </>
          }
          submitLabel="Remover a senha salva"
          pendingLabel="Removendo…"
          onClose={() => setRemoveOpen(false)}
          run={(stepUp) => api.emailSettings.removeSavedPassword(stepUp)}
          onDone={(next) => {
            setRemoveOpen(false);
            // Depois de remover, o botão some: o foco vai ao campo da senha (ou ao servidor, se a senha está desabilitada).
            setFocusNext(hostBlank ? 'host' : 'password');
            onChanged(next);
          }}
        />
      )}
    </>
  );
}
