---
name: project_passenger_consent_b3
description: Fatia B3 do passageiro (22/11/2026) — aceite com versão exibida (cadastro), 409 consent_outdated, reaceite por me().consent.pending; onde está cada peça, decisões não óbvias, o que foi provado no web e o que só se prova em aparelho.
metadata:
  type: project
---

**Pontos únicos (B3 mexeu só aqui):**
- `src/legal/legalModel.ts` — PURO (sem RN; provável com `node --import tsx`): `toLegalDocuments`, `consentPayload(documents)`, `reacceptPayload`,
  `replaceWithCurrent`, `openableUrl`. `consentPayload` só aceita `LegalDocumentView` já vindo de resposta da API → impossível enviar versão constante.
- `src/legal/legalDocuments.ts` — store zustand `useLegalStore` (idle|loading|error|ready) + `useLegalDocuments({refreshIfStale})` +
  `refreshLegalAfterOutdated(error)`. **(A3, 22/11: `openLegalDocument`/`openableUrl` REMOVIDOS — o texto real agora é baixado, conferido por SHA-256 e exibido dentro do app por `VerifiedTextView` do ui; ver [[project_a3_secure_storage_and_verified_text]].)**
  UMA cópia compartilhada: `/termos`, `/privacidade` e cadastro mostram a MESMA versão; só o cadastro (`refreshIfStale`, TTL 60 s = max-age da API) busca de novo.
- `src/legal/useConsentGate.ts` + `app/(app)/_layout.tsx` — o portão do reaceite fica no LAYOUT de `(app)`: renderiza `ConsentChecking` | `ConsentReacceptScreen` |
  `<Stack>`. Não é rota nova (as rotas de `(auth)` não existem com sessão), então não há buraco de deep link nem flash da Home.
- `src/components/legal/` — `LegalConsentFields` (3 estados no cadastro), `LegalDocumentBody` (provisório marcado | botão "Abrir o texto completo"),
  `ConsentReacceptScreen` (texto abre em subtela LOCAL, não em rota), `ConsentChecking`.
- `authErrors.ts` ganhou `consent_outdated` (warning, sem `field`), contexto `'consent'` e ação `'retry'`.
- `packages/ui` `ConsentCheckbox` ganhou `linkCaption` opcional ("Versão X" ao lado do link, quebra para baixo no 320). Afeta o motorista só se ele passar a prop.
- `identityClient.ts`: `mockLegal` mutável SÓ em `__DEV__` + gancho `__vuumboraMockLegal` (web). Única versão literal do app (`mock-1`, catálogo do mock).

**Decisões não óbvias (por que):**
- Desmarcar os aceites em QUALQUER troca da cópia de textos (efeito comparando a REFERÊNCIA de `documents`), não só no handler do 409:
  cobre `error.current` igual ao exibido (servidor inconsistente) e qualquer refresh futuro. Um mecanismo só.
- Carregando/erro NÃO renderizam caixa: marcar aceite sobre texto que não está na tela não prova leitura (M-2). Botão Criar conta desligado nos dois.
- `provisional` decidido pelo MODO (`identity.mode === 'mock'`), não por adivinhar `.invalid` na URL.
- Gate `me()`: falha → entra (cortesia; quem barra é a API com 409 nas rotas de compromisso novo); `consent:null` → entra; olha UMA vez por montagem
  (contrato: ninguém é jogado para fora no meio de corrida). Pendência: quando existirem viagens reais, o 409 `error.pending` de "pedir corrida" deve abrir o reaceite.
- Versão que chega com view de erro de carga: `loadErrorView` monta o aviso SEM `retryAfterSeconds` — `AuthErrorAlert` com esse campo e sem `waitSeconds`
  mostra "Pronto, você já pode tentar de novo" na hora (armadilha).

**Provado (web, Playwright, 320, mock; 136 verificações: 52 cadastro + 34 documentos + 40 reaceite + 10 unidade):** loading/erro(rede, 503, 429)/pronto;
409 com `current` e sem `current`; sem reenvio sozinho; versões enviadas = renderizadas; cópia fresca não rebusca, velha rebusca sem mostrar a antiga;
reaceite 1/2 documentos, 409 no reaceite, sair da conta, consent null, me() falhando; ramo `http` do botão (mode trocado pelo gancho, `window.open`
interceptado). Controle negativo: mutar o efeito de desmarcar e a versão constante derrubou o roteiro. Export de produção: sem `__vuumboraMockLegal`.
**NÃO provado (só aparelho):** BackHandler do Android na subtela, `Linking.openURL` nativo abrindo o navegador, anúncio do leitor de tela nos avisos e na
troca de textos, teclado/área segura na tela de reaceite, deep link com sessão (o web perde a sessão no reload). **API real nunca foi tocada.**
Relacionado: [[project_passenger_identity_b1]], [[feedback_provar_expo_web_armadilhas_b1]], [[bug_rnweb_backhandler_console_error]].
