---
name: project-s1-passada-2-qa
description: Passada 2 de QA no commit 79f41d8 (22/11/2026) — APROVADO; 2 mutantes sobreviventes no api-client (época), CI vermelho no HEAD seguinte, e o como-fazer de cada bateria (painel x API real/falso, A1 export web, A2 fluxo real)
metadata:
  type: project
---

Veredito completo: `docs/veredito-iris-s1-passada-2.md`. Complementa [[project-s1-passada-final-qa]] e [[project-s1-ambiente-de-teste-e-ferramentas]].

**Resultado:** painel falha fechado 17/17 corpos reais + 22/22 no servidor falso (Chromium e Firefox); F1 corrigido (canário reproduz os 27 px do Firefox ao reinjetar `-mt-1`); A1 68/68 nos dois motores, android/ios compilam, prod sem `catalogo`/`mapbox-check`/`rnmapbox`; A2 114/114 + fluxo real 30/30; CI do 79f41d8 verde; API 255/255 e `npm run check` ok na cópia limpa.

**Área frágil registrada (teste, não código):** `packages/api-client/src/identity/session-manager.ts` — as guardas de **época** sobrevivem à suíte: (SF10) `clearLocal` sem `epoch += 1` deixa refresh tardio ressuscitar a sessão após `logout-all`/`endLocal`; (SF4) `run()` sem `if (epoch !== used.epoch)` repete a chamada da conta A com a sessão da conta B. Testes que matam os dois: `scratchpad/iris2/e2e/gap-tests.mts` (efêmero; recriar a partir do veredito). **Why:** a suíte só cobria logout via `signOut` (que espera o voo) e login durante o voo, não durante a GRAVAÇÃO. **How to apply:** em invariante de concorrência, mutar CADA guarda isolada e exigir que um teste a mate; entrelaçar com armazenamento lento (gate) e refresh adiado.

**O HEAD anda durante a passada.** Registrei `git rev-parse HEAD` na hora do `git archive` (79f41d8); minutos depois eram 16c147a (CI **vermelho** em "Testes do apps/api", log exige login) e d75b9b9. Sempre dizer no veredito "vale só para o SHA X" e checar o CI do HEAD novo.

**Como fazer (rápido):**
- CI sem login: `gh` não está autenticado; a API pública anônima funciona (`curl https://api.github.com/repos/InnovareCode/VuumBora/actions/runs?head_sha=<sha>` e `/runs/<id>/jobs`). NÃO usar `git credential fill` (o classificador nega). Log de job exige login; só o nome do passo.
- Painel contra API real: `VITE_API_MODE=http VITE_API_BASE_URL=http://127.0.0.1:<porta>` no `vite build`, `vite preview --outDir ... --host 127.0.0.1`; ADMIN_ALLOWED_ORIGINS com a origem exata (127.0.0.1, não localhost). Duas builds (API real / servidor falso) = dois `outDir`.
- Export web dos apps: `VUUMBORA_BUILD_PROFILE=production node node_modules/expo/bin/cli export --platform web|android|ios --output-dir <dir>` (~10 s web, ~35 s nativo); gerar `expo-env.d.ts` como o CI; controle com `development`. Servidor SPA próprio (`spa-server.mjs`, asset inexistente = 404).
- Navegação interna sem recarregar (sessão em memória): `history.pushState` + `popstate`.
- `tsx` com `.ts` extensionless de fora do pacote: rodar com `--import tsx` e cwd no pacote (o `--import file:///…/tsx/dist/esm` carrega só ESM e quebra `./client`).
- Script de e-mail: o assunto vem RFC 2047 e o corpo em quoted-printable; casar o código no corpo (`: 123456`).
- Config SMTP salva no painel (tabela `email_settings`) vence o ambiente e fica cifrada com `ADMIN_TOTP_ENCRYPTION_KEY` da API que salvou; com 2 APIs de chave aleatória diferente o e-mail da 2ª falhou (`EmailDeliveryError`, causa NÃO provada). Para voltar ao ambiente: `delete from email_settings` como dono.
- Fake que devolve `challengeExpiresAt` muito distante (2030) estoura `setTimeout` (> 2³¹ ms) e o painel volta ao login na hora.
- `/me` quebrado só aparece em ROTA PROTEGIDA; em `/login` a tela de login não depende do `/me` (status `unavailable` ainda mostra login).
- Limite global 100 req/min/IP: `reload` em laço dá 429 e a UI mostra sessão indisponível.
- Papel `suporte` recebe 403 em candidaturas por desenho; usar `operacao` se quiser um "authenticated" que enxerga dados.
