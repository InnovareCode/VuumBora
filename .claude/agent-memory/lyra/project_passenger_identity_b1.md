---
name: project_passenger_identity_b1
description: Fatia B1 (22/11/2026) — identidade do passageiro sobre o createIdentityClient em modo mock; onde ficam os pontos únicos (cliente, erros, legal, fluxo), o que foi para packages/ui, o que foi provado no web e o que só se prova em aparelho.
metadata:
  type: project
---

**Pontos únicos (mexeu na fatia seguinte → mexe só ali):**
- `apps/passenger/src/identity/identityClient.ts` — o ÚNICO `createIdentityClient` (mock + `createMemorySessionStorage()` explícito).
  A3 (FEITO em 22/11: `createDeviceSessionStorage` do ui, ver [[project_a3_secure_storage_and_verified_text]]) trocou o `storage`; B4 troca `IDENTITY_MODE`/`baseUrl`. Expõe `globalThis.__vuumboraIdentity` só em `__DEV__`+web (gancho de
  prova; provado ausente no export web e no `.hbc` Android de produção). A declaração `const IDENTITY_MODE = '...'` é lida POR
  TEXTO pela guarda do `metro.config.js` (production com mock aborta): mantenha uma só, literal — ver
  [[feedback_telas_de_dev_fora_do_build_por_metro_blocklist]].
- `src/identity/authErrors.ts` — `describeAuthError(contexto, ApiError)`: texto nosso por `error.code` (cai na `kind`), nunca a
  `message` do servidor, nunca "bloqueada". 19 códigos × 5 contextos provados por unidade (`node --import tsx`).
- `src/legal/legalDocuments.ts` — onde a B3 injeta versões dos Termos/Política (`useLegalDocuments`, `consentPayload`, `LEGAL_ROUTE`).
  Hoje texto PROVISÓRIO marcado com `MockBadge`; nenhuma versão inventada.
- `src/identity/authFlowStore.ts` (zustand, memória) — e-mail do fluxo + `nextResendAt` (INSTANTE, não "60": sobrevive a sair da
  tela). A senha NUNCA entra; o contrato manda pedir a senha de novo na tela do código.
- `src/identity/safeCall.ts` — toda chamada de identidade passa por ele (exceção vira `unknown`, botão não fica carregando).
- `src/session/SessionProvider.tsx` agora espelha `identity.session` (`useSyncExternalStore`); `status` ganhou `loading` e o
  `RootGate` (`app/_layout.tsx`) segura a splash até fonte E sessão resolverem. `useSession()` expõe `signedOutNotice`.

**Decisões de produto/UX:** login = e-mail OU ID público (sem celular); data DD/MM/AAAA digitada (sem seletor nativo), a regra de
18 anos é do servidor (`underage`); dois aceites nunca nascem marcados e cada um tem link para o texto; `email_not_verified` NAVEGA
para `/codigo` (não fica no login); verificar → login automático com a mesma senha; se falhar vai ao login com aviso + e-mail
preenchido (`router.dismissTo('/login')`, funciona com e sem login na pilha). `reset_locked`: sem contagem de 24 h.
Contagem de espera fica FORA da região `role=alert` (leitor não narra 8,7,6) — `InlineAlert` põe o role só no texto.

**Foi para packages/ui (B2 só consome):** `CodeInput`, `DateInput` (+`brazilianDateToIso`), `ConsentCheckbox`, `LinkButton`,
`InlineAlert`, `useSecondsUntil`/`formatWait`; `InputCore` ganhou `inputRef`, `returnKeyType`, `onSubmitEditing`,
`textContentType`, `autoCorrect`; `AppShell` ganhou `keyboardShouldPersistTaps="handled"` + `automaticallyAdjustKeyboardInsets`
(sem o primeiro, no celular o 1º toque no botão só fecha o teclado). Mudanças em ui afetam o motorista.

**api-client no app:** o código-fonte dele referencia `window`/`document`/`Crypto` e o tsconfig do passageiro é `lib: ES2022` sem
DOM → `src/types/api-client-globals.d.ts` (desvio local; o certo é o pacote declarar; o motorista vai bater no mesmo). Hermes não
tem `crypto` global → `randomId: () => uuid.v4()` de `'expo'` (reexporta expo-modules-core; sem dependência nova).

**Provado (web, Playwright contra `expo start --web`, 9 roteiros, ~300 verificações):** ver handoff. **NÃO provado:** nenhum
aparelho (teclado cobrindo campo, área segura, anúncio do VoiceOver/TalkBack, `uuid.v4()` nativo, autofill/colar código, Back do
Android, SecureStore). Relacionado: [[bug_rnweb_checkbox_aria_checked_e_espaco]], [[bug_inputcore_textinput_37pt_e_anel_duplo]],
[[feedback_provar_expo_web_armadilhas_b1]], [[bug_stack_protected_sem_redirectto_vira_unmatched_route]].

**Correções da passada 3 da Íris (22/11/2026, F3/F5/F6/F7/F8/F12):** `InputCore` ganhou `minWidth:0` e `blurOnSubmit:false` só no web
([[bug_input_flex_minwidth_firefox_webkit]], [[bug_foco_vai_para_body_apos_envio_com_erro]]); `InlineAlert.focusRef` e
`ConsentCheckbox.checkboxRef` (packages/ui); `apps/passenger/src/lib/focusAfterRender.ts` (`useFocusAfterRender`, `useFocusOnArrival`) é o ponto
único do foco por código, e as 5 telas passam `inputRef={field.ref}` + `setFocus(...)` no lugar dos `useRef` manuais; `authFlowStore.prefillLogin`
(só pré-preenche, sem aviso) serve ao "Entrar na minha conta" do `email_taken`; `app/+not-found.tsx` + `sitemap:false`
([[feedback_expo_router_notfound_sitemap_e_cache_do_manifesto]]). `esqueci-senha` agora trata `invalid_email` como erro de CAMPO (como o cadastro).
