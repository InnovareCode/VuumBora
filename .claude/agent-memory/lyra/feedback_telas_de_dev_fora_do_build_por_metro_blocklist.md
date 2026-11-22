---
name: feedback_telas_de_dev_fora_do_build_por_metro_blocklist
description: Perfil de build do Metro nos apps mobile (passageiro/motorista) — derivado de NODE_ENV (seguro por omissão), telas de dev por convenção app/(dev)/, guarda "production com identidade mock aborta" e seu escape temporário; o que foi provado, como provar (harness vm + export real) e o que NÃO é a causa dos bundles grandes. Use ao mexer em metro.config.js, eas.json, IDENTITY_MODE ou ao criar tela de desenvolvimento.
metadata:
  type: feedback
---

**Estado desde 22/11/2026 (M-3 da revisão S1 rodada 3b).** `apps/passenger/metro.config.js` e `apps/driver/metro.config.js` são
IDÊNTICOS (`diff` sem saída; mexeu num, copie no outro).

**Perfil (ordem de decisão):** `VUUMBORA_BUILD_PROFILE` preenchida vale (inválida aborta; `development`+`NODE_ENV=production` aborta;
`development|preview`+`EAS_BUILD_PROFILE=production` aborta). Sem ela: `EAS_BUILD_PROFILE=production` ou `NODE_ENV=production` →
production; `NODE_ENV=development|test` → development; sem NODE_ENV → development só se TTY e sem `CI`, senão ABORTA. Vazia = ausente.
`preview` não esconde tela de dev nem exige identidade real (decisão minha, NÃO do dono: a revisão item 5 pedia decidir).

**NODE_ENV medido na carga do metro.config.js (probe `node --require` em `Module._load`):** `expo export` e `expo export:embed`
(caminho do Gradle/Xcode release) → `production`; `expo start` → `development`. O Expo CLI define antes de carregar o arquivo, então
"build de loja sem variável" cai em production. NÃO provado: o Gradle/EAS real chamando `export:embed` (sem Android SDK/EAS aqui).
Armadilha: `NODE_OPTIONS=--require` quebra o `npx` ("Could not determine Node.js install directory") — chame
`node node_modules/expo/bin/cli ...` direto com `--require`.

**Telas de dev = pasta `app/(dev)/`** (grupo do Expo Router, não entra na URL: `/catalogo` e `/mapbox-check` continuam). O regex do
`resolver.blockList` casa `app/**/(dev)/` em qualquer nível, com separador `[\\/]` por segmento. Tela de dev nova nasce lá, sem editar
lista. Por que blockList e não `__DEV__`: o Metro usa `blockList` como `ignorePattern` do mapa de arquivos e o Expo Router monta as
rotas a partir dele — a rota some de verdade ("Unmatched Route"), o código e o `mapbox-gl` saem do bundle.

**Guarda de identidade:** em production, o config lê POR TEXTO a única `const IDENTITY_MODE = '...'` literal de
`src/identity/identityClient.ts`; só `'http'` passa. Arquivo ausente (ATÉ a B2, 22/11: o motorista não tinha cliente de identidade; agora tem `identityClient.ts` e o production sem escape aborta com
"IDENTITY_MODE vale 'mock'"; provado também que trocar para `'http'` deixa o export production verde sem escape e sem aviso),
declaração duplicada ou não-literal ⇒ "desconhecido" ⇒ trata como mock (falha fechada). **Escape temporário:**
`VUUMBORA_ALLOW_MOCK_IDENTITY_IN_PRODUCTION=1` (só o valor `1`; `true/0/vazio` não valem; cada uso imprime ATENÇÃO). Existe para o
export de produção da A1 seguir verde; REMOVER quando passageiro e motorista tiverem `'http'`. O `eas.json` de production NÃO pode
ter o escape. Se a B4 trocar a forma da declaração, a build aborta até a guarda ser atualizada junto.

**Como provar (receita que funcionou):**
1. Harness em scratch: `new Function('require','module','__dirname','process','console', <texto REAL do metro.config.js>)` com
   `process`/`expo` falsos e raízes-fixture (`identityClient.ts` com http/mock/duplicado/ternário/comentado) — 59 verificações,
   incl. controles positivos e negativos. Prove o harness por MUTAÇÃO (5 mutantes do config → cada um derruba linhas da tabela).
2. Export real: `expo export --platform web|android --output-dir <scratch>`: sem escape aborta (exit 1, pasta não criada); com
   escape verde; `VUUMBORA_BUILD_PROFILE=preview` é o controle positivo (telas de dev presentes). Contar chunks `catalogo-*`/
   `mapbox-check-*` no web e `grep -ac 'mapbox-check-status'` no `.hbc` Android. Passageiro: 3223 módulos production × 3287 preview.
3. Controle positivo da guarda no Expo CLI real: trocar `IDENTITY_MODE` para `'http'` TEMPORARIAMENTE (backup + `cmp` depois) →
   export production verde sem escape e sem aviso.
4. Chromium: dev server em development abre `/catalogo` e `/mapbox-check`; dev server com `VUUMBORA_BUILD_PROFILE=production` +
   escape dá "Unmatched Route" nas duas e mantém `/boas-vindas` viva.

**Cache do Metro** não trouxe as telas de volta ao trocar de perfil sem `--clear` (testado em 21/11).

**ARMADILHA DE DIAGNÓSTICO (21/11):** o `index` de 2,3 MB do motorista NÃO era `mapbox-gl` — era o `lucide-react-native` inteiro (ver
[[bug_lucide_barrel_infla_bundle]]). Contar o que há dentro do chunk antes de acusar uma lib.

Relacionado: [[bug_stack_protected_sem_redirectto_vira_unmatched_route]], [[project_passenger_identity_b1]].
