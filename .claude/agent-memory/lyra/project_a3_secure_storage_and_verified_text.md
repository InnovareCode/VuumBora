---
name: project_a3_secure_storage_and_verified_text
description: Fatia A3 (22/11/2026) — cofre da sessão no aparelho (expo-secure-store + limpeza da 1ª execução por causa do Keychain do iOS), B-6 (texto legal baixado e conferido por SHA-256 antes de exibir), N4 (useNativeDriver no web) e N6 (foco no login). Onde mora cada peça, decisões não óbvias, o que foi provado e o que só se prova em aparelho.
metadata:
  type: project
---

**Tudo compartilhado mora em `packages/ui/src/device/` (não é visual; README do ui explica).** Os dois apps só chamam
`createDeviceSessionStorage({ accountType })` em `src/identity/identityClient.ts` e usam `<VerifiedTextView>` em
`components/legal/LegalDocumentBody.tsx` (arquivo igual nos dois). Lógica pura → `node --import tsx`; 84 testes em
`packages/ui/test/` (`npm test -w @vuumbora/ui`; o `npm run check` NÃO os roda, só os tipa — sugerir ao CI).

**Cofre (`sessionVault.ts` puro + `nativeSessionStorage.ts` com SecureStore/Settings injetados + `deviceSessionStorage(.native).ts`):**
- Metro troca `.ts` (web = só memória, sem import nativo) por `.native.ts`; o TS só vê o `.ts` → as duas se declaram do tipo
  `CreateDeviceSessionStorage`. Prova: bundle web sem `getValueWithKeyAsync`/`ExpoSecureStore`/`localStorage`; `.hbc` Android com eles.
- **iOS: Keychain sobrevive à desinstalação.** Decisão: na 1ª operação após instalar (marcador ausente) apaga as 3 chaves do app
  (`vuumbora.<tipo>.session|installation_id|pending_revocations`) e SÓ DEPOIS grava o marcador; falha em apagar/ler/gravar o marcador
  = rejeita tudo (falha fechada) e tenta de novo; nenhuma leitura/escrita/remoção passa antes da verificação. Marcador = `Settings` do
  RN (NSUserDefaults; sem dependência nova; Android: `Settings` é stub, por isso lá `marker: null`). Custo: reinstalar descarta
  `pending_revocations` (a sessão antiga fica viva no servidor até expirar).
- `keychainAccessible = AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY` (decisão minha, a confirmar com a Órion): THIS_DEVICE_ONLY evita o refresh
  token migrar em backup; AFTER_FIRST_UNLOCK porque o motorista vai ler token com a tela bloqueada (localização em segundo plano).
- `sessionKeys.ts` REPETE `storageKeys` do api-client (não é exportado pelo index); `test/sessionKeys.test.ts` lê o de verdade.
- Plugin `['expo-secure-store', { faceIDPermission: false }]` nos dois `app.config.ts`: exclui o SecureStore do backup do Android
  (`fullBackupContent`/`dataExtractionRules` — visto no `expo config --type introspect`) e não declara NSFaceID (não usamos biometria).
- **Em `mode: 'mock'` a persistência NÃO se vê em aparelho**: o servidor simulado vive na memória do processo; reabrir restaura a
  sessão do cofre e a 1ª chamada autenticada (`me()` do portão) a derruba como `session_expired`. Documentado no cabeçalho do
  `identityClient.ts` e num teste (`sessionIntegration.test.ts`). Só em `http` (B4) "fechar à força e reabrir mantém a sessão".
- Evitei `Promise.allSettled` e `TextDecoder({fatal})` (suporte do Hermes não garantido): laço sequencial com try/catch; UTF-8 estrito escrito à mão.

**B-6 (`verifiedText.ts` puro, `useVerifiedText.ts`, `VerifiedTextView.tsx`, `verifyFailureCopy.ts`):** baixa os BYTES, hasheia com
`expo-crypto` (`digest`, nunca `digestStringAsync`: o servidor hasheia o arquivo, BOM/CRLF/UTF-8 inválido mudariam o hash), compara
com o `sha256` da MESMA resposta da API e só então decodifica e exibe DENTRO do app (nada de `Linking.openURL`: o navegador mostraria
o que o servidor entregar naquele instante). Só https (http com `allowHttp = __DEV__`); "origem a partir da url da resposta" =
URL final da resposta (`response.url`) tem de ter a mesma origem da `url` pedida (regex estrita: sem `\`, `@`, IPv6); teto 1 MiB, prazo
15 s, `credentials:'omit'`. Formato do arquivo assumido: TEXTO PURO UTF-8 (contrato diz "bytes UTF-8"; Markdown/HTML apareceria cru) —
decisão aberta com o dono/Vega. Memória dos já conferidos por (sha, url), 4 entradas. Mock (`provisional`) continua mostrando o
texto provisório marcado e nunca baixa. `openableUrl`/`openLegalDocument` foram REMOVIDOS dos dois apps. NÃO feito: enviar ao servidor
o hash que a pessoa viu (o contrato de `register/consents` não tem o campo; o servidor preenche do catálogo) — precisa de Vega + api-client.

**N4:** `useNativeDriver: Platform.OS !== 'web'` em `LoadingSkeleton` e também em `SearchingPulse` (passageiro, mesmo defeito).
**N6:** `useFocusWhenScreenFocused(focus, shouldFocus)` em `src/lib/focusAfterRender.ts` (`useFocusEffect` do expo-router): o login
(`login.tsx`/`entrar.tsx`) leva o foco ao PRIMEIRO campo (identificador) quando ganha foco COM `loginHint` preenchido (Entrar na minha
conta, e-mail confirmado, senha trocada). `useFocusOnArrival` (só montagem) não serve: o `entrar` do motorista já está montado embaixo.
Alternativa que NÃO fiz: com o e-mail preenchido o campo que falta é a senha.

**Provado:** 84 unitários + 37 mutantes mortos (runner em scratch, ver [[feedback_mutacao_sobreviventes_assert_objeto_inteiro]]); web dev nos
3 motores: nada em localStorage/sessionStorage/cookie/IndexedDB, reload desloga, B-6 (24 cenários: íntegro, adulterado, hash divergente,
sem servidor + retry, 404, redirecionamento cross-origin recusado/mesma origem aceito, UTF-8 inválido, sem cookie/Authorization), N4 e N6
com controle negativo (mutante reproduz o aviso e o foco no `<body>`), reaceite com texto real + teclado (Tab→"Tentar de novo"→Enter);
export de PRODUÇÃO do passageiro no 3 motores: fluxo cadastro→código→Home pela UI sem token no armazenamento; exports web+Android de
produção dos dois apps verdes (com o escape; sem ele abortam, `IDENTITY_MODE vale 'mock'`).
**NÃO provado (só aparelho):** `expo-secure-store` real (Keychain/Keystore), persistência ao fechar à força, comportamento REAL do Keychain
na reinstalação (só um modelo escrito a partir do código do módulo), `Settings`/NSUserDefaults sobrevivendo/sumindo na desinstalação,
`digest` nativo do expo-crypto, `fetch` nativo (`response.url`/`arrayBuffer`) do expo/fetch, anúncio do leitor de tela, foco do N6 no nativo.
Relacionado: [[project_passenger_consent_b3]], [[project_passenger_identity_b1]], [[feedback_telas_de_dev_fora_do_build_por_metro_blocklist]].
