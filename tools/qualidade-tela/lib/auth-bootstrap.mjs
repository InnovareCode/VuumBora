// Telas atrás da guarda `Stack.Protected` do grupo `(app)` (P03, P04, M05...)
// redirecionam para a tela de entrada do app quando não há sessão — a captura/sonda
// cairia na tela de login/boas-vindas, não na tela pedida. Achado original: Lyra,
// `.claude/agent-memory/lyra/project_m05_onda2_painel_motorista.md`.
//
// Este módulo detecta esse redirecionamento, cria uma conta de prova pelo gancho
// `window.__vuumboraIdentity` (só existe em `__DEV__` web — nunca em produção), loga
// e navega pelo CLIENTE (expo-router) até a rota pedida. NUNCA `page.goto` depois do
// login: a sessão mock vive só em memória (`createDeviceSessionStorage` no web não usa
// localStorage) e qualquer navegação de DOCUMENTO a zera — ver
// `.claude/agent-memory/iris/project_s1_passada_2_qa.md` ("Mock vive na memória da
// página: page.goto no meio do roteiro zera contas/sessão").

/** Para onde a guarda manda quem NÃO tem sessão ao pedir uma rota de `(app)` — ver
 * `app/_layout.tsx` de cada app (`Stack.Protected guard={isSignedIn} redirectTo=...`). */
const ROTA_DE_ENTRADA = {
  passageiro: '/boas-vindas',
  motorista: '/entrar',
};

/** E-mail único por chamada: o mock rejeita (`email_taken`) uma conta já verificada
 * com o mesmo e-mail, e cada combinação tela×estado×tamanho abre um contexto novo
 * (sessão nova, sem conta nenhuma ainda). */
function contaDeProva(app) {
  const sufixo = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  return {
    fullName: 'Sonda Qualidade de Tela',
    email: `sonda.${app}.${sufixo}@vuumbora.test`,
    password: 'Sonda-qualidade-2026!',
    birthDate: '1990-01-01',
  };
}

async function aguardarConteudo(page, { timeout = 30000 } = {}) {
  await page.evaluate(() => (document.fonts ? document.fonts.ready : null));
  // ver o mesmo comentário em capture.mjs: sem isto, dá para medir uma página em branco.
  await page.waitForFunction(() => document.body.innerText.trim().length > 10, { timeout });
}

/**
 * Se `page` foi redirecionada para a tela de entrada do app porque `rotaDestino`
 * exige sessão, cria a conta de prova, loga e navega pelo cliente até `rotaDestino`.
 * Não faz nada (devolve `false`) quando a página já está na rota certa — telas
 * públicas (P01, P02a, P02b, M01, M02) nunca disparam o bootstrap.
 *
 * @returns {Promise<boolean>} true se bootstrapou (útil só para log/depuração).
 */
export async function garantirSessaoEDestino(page, { app, rotaDestino }) {
  const entrada = ROTA_DE_ENTRADA[app];
  if (!entrada) return false;

  const pathnameAtual = await page.evaluate(() => window.location.pathname);
  if (pathnameAtual !== entrada || rotaDestino === entrada) return false;

  const conta = contaDeProva(app);

  const resultado = await page.evaluate(async (c) => {
    const identity = window.__vuumboraIdentity;
    if (!identity) return { ok: false, etapa: 'gancho', erro: 'window.__vuumboraIdentity ausente (fora do modo dev/web?)' };

    const registro = await identity.register({
      fullName: c.fullName,
      email: c.email,
      password: c.password,
      birthDate: c.birthDate,
      termsAccepted: true,
      privacyAccepted: true,
      termsVersion: 'mock-1',
      privacyVersion: 'mock-1',
    });
    if (!registro.ok) return { ok: false, etapa: 'register', erro: registro.error };

    const verificacao = await identity.verifyEmail({ identifier: c.email, code: '123456', password: c.password });
    if (!verificacao.ok) return { ok: false, etapa: 'verifyEmail', erro: verificacao.error };

    const login = await identity.login({ identifier: c.email, password: c.password });
    if (!login.ok) return { ok: false, etapa: 'login', erro: login.error };

    return { ok: true };
  }, conta);

  if (!resultado.ok) {
    throw new Error(
      `[qualidade-tela] bootstrap de sessão mock falhou (${app}, rota ${rotaDestino}, etapa "${resultado.etapa}"): ${JSON.stringify(resultado.erro)}`,
    );
  }

  // A guarda de rota observa a sessão (`useSyncExternalStore` sobre `identity.session`,
  // no `SessionProvider`) e redireciona sozinha para fora do grupo `(auth)` — esperar
  // ela agir em vez de um tempo fixo às cegas.
  await page.waitForFunction((rotaEntrada) => window.location.pathname !== rotaEntrada, entrada, { timeout: 15000 });

  const pathnamePosLogin = await page.evaluate(() => window.location.pathname);
  if (pathnamePosLogin !== rotaDestino) {
    // Navegação interna sem recarregar o documento (sessão em memória) — o mesmo
    // mecanismo que o próprio expo-router usa para link/`router.push` no web.
    await page.evaluate((rota) => {
      window.history.pushState({}, '', rota);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }, rotaDestino);
  }

  // timeout generoso: a 1ª visita a uma rota lazy do Metro ao vivo pode passar de 30s
  // (achado da Íris, `.claude/agent-memory/iris/feedback_harness_passada_5.md`).
  await aguardarConteudo(page, { timeout: 90000 });
  await page.waitForTimeout(700);

  return true;
}
