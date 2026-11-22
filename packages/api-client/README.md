# @vuumbora/api-client

Portas (interfaces) que as telas consomem + adaptadores `mock` e `http` **distintos**.

- `@vuumbora/api-client`: `ClientConfig` (modo obrigatório, sem default), `ApiError` (`kind` estável + `code`,
  `attemptsLeft`, `retryAfterSeconds` opcionais do servidor), `Result<T>`. O `AuthPort` antigo foi removido.
- `@vuumbora/api-client/identity`: **identidade dos apps** (passageiro e motorista), contrato em
  `docs/contrato-identidade-apps.md`. Ver abaixo.
- `@vuumbora/api-client/passenger`: `PassengerRidePort`, `PlacesPort` — só `apps/passenger`.
- `@vuumbora/api-client/driver`: `DriverJourneyPort`, `DriverOfferPort` — só `apps/driver`.
- `@vuumbora/api-client/waitlist`: `WaitlistPort` + `createWaitlistHttpAdapter` — só `apps/site`. Primeiro
  adaptador `http` real do monorepo (backend em `apps/api`); contrato completo em
  `docs/lista-de-espera.md`.

Toda resposta traz `origin: 'mock' | 'real'` para a UI sinalizar dados de demonstração.
Ações críticas (solicitar, aceitar, cancelar) exigem `idempotencyKey`; a inscrição na lista de
espera não precisa — o e-mail já é a chave natural de deduplicação, garantida no banco.
Adaptadores mock entram na Fase 1 (passageiro/motorista), http na Etapa E — a lista de espera já
tem o seu. SDKs de mapa/pagamento/push também entram atrás de portas aqui, nunca chamados direto
da tela.

## Identidade (`/identity`)

```ts
import { createIdentityClient } from '@vuumbora/api-client/identity';

const identity = createIdentityClient({
  mode: 'http',                    // 'mock' | 'http' — sem padrão
  baseUrl: process.env.EXPO_PUBLIC_API_URL,
  accountType: 'passenger',        // fixo por app: 'passenger' | 'driver'
  platform: Platform.OS,           // 'android' | 'ios' | 'web' (obrigatório fora do navegador)
  appVersion: '1.0.0',             // vai em X-App-Version; sem ela sai "unknown"
  storage,                         // SessionStoragePort; padrão = memória (A3 passa o SecureStore)
  randomId,                        // só se não houver `crypto` global (ex.: expo-crypto)
});
```

- **Telas usam `IdentityClient`**: `register`, `verifyEmail`, `resendVerification`, `forgotPassword`, `resetPassword`,
  `login` (grava a sessão e devolve **só a conta**; os tokens nunca saem), `logout`, `logoutAll`, `me`.
  `accountType` entra sozinho em todo corpo; campos que o contrato não pede (ex.: `confirmPassword`) não são enviados.
- **Estado de sessão**: `identity.session.getState()` / `subscribe()` / `restore()` →
  `unknown` (lendo o cofre) | `signed_in` | `signed_out` com `reason` `none | user | session_expired`. O objeto é estável
  enquanto nada muda (serve a `useSyncExternalStore`); rotação de token não notifica.
- **Chamadas autenticadas de qualquer porta de dados**: `identity.session.run((accessToken) => porta.chamada(accessToken))`.
  Em `401` renova e repete **uma** vez. Para o WebSocket: `identity.session.getValidAccessToken()`. Ao voltar ao primeiro
  plano: `identity.session.refreshIfExpiring()`.
- **Renovação serializada** (`docs/plano-apps-execucao.md` §4; a API revoga a família inteira se o mesmo refresh for usado
  duas vezes): um único `POST /refresh` por vez, quem recebe 401 espera e repete; um 401 tardio não renova de novo; o novo
  refresh é gravado antes de liberar quem esperava; login/logout no meio de uma chamada nunca faz o pedido de uma conta
  ser repetido com o token de outra.
  - Recusa **definitiva** do refresh (`401`, `400`, `403`) = **um** logout local; todas as pendentes recebem `unauthorized`
    (`code: 'invalid_refresh_token'`) e o estado vira `signed_out/session_expired`.
  - Falha **transitória** (sem rede, 5xx, 429) **não desloga**: a sessão fica e o mesmo refresh descansa 5 s (até 60 s se o
    servidor mandar `retryAfterSeconds`) antes de nova tentativa — repetir logo depois de uma falha ambígua seria reuso.
  - Limite conhecido (plano §4.5): resposta de refresh perdida *depois* de o servidor rotacionar → próxima renovação
    é reuso → logout forçado. O cliente não resolve sozinho.
- **Erros**: ramifique em `error.kind`; escolha texto por `error.code` (`invalid_code`, `email_not_verified`,
  `too_many_attempts`, `underage`...). Validação (`400`) traz `fields` por campo: `email`, `password`, `phone`,
  `birthDate`, `consent`, `code`, ou `form` (sem campo específico). `409` → `conflict` com `reason = code`.
  `429` → `rate_limited` com `retryAfterSeconds` (corpo, ou cabeçalho `Retry-After` como reserva).
  `403 email_not_verified` leva à tela do código (`resendVerification`); **não** é falha de senha.
- **`SessionStoragePort`** (`getItem/setItem/removeItem`, texto): chaves `vuumbora.<accountType>.session` e
  `vuumbora.<accountType>.installation_id`. Se o cofre rejeitar, a sessão em memória segue valendo e `onStorageError`
  recebe o erro (nunca o conteúdo). `installationId` é gerado uma vez, sobrevive a logout e vai no `device` do login.
- **Mock**: `mode: 'mock'` reproduz as regras e os códigos de erro do contrato (código de e-mail `123456`, espera
  progressiva do login, `attemptsLeft`, `reset_locked`, reuso de refresh, 15 min de access token). Opções em `mock`
  (`verificationCode`, `latencyMs`, `clock`). Não reproduz limites por IP/e-mail do servidor nem `503`.

### Testes

```bash
npm test -w @vuumbora/api-client      # node --test + tsx, como a API (sem banco)
npm run typecheck -w @vuumbora/api-client   # src + test
```

Cobrem: renovação em voo único (20 chamadas concorrentes com 401 = 1 `POST /refresh`), falha do refresh (1 logout local),
adaptador `http` contra um servidor HTTP falso em processo (cabeçalhos, corpo, mapeamento de erro, timeout, fluxo
completo) e o mock contra o contrato. A prova contra a API real (Postgres + Fastify) não é automática aqui: roda-se à
mão (ver o handoff da A2).
