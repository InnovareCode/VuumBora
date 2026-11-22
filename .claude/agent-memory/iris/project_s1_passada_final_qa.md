---
name: project-s1-passada-final-qa
description: Passada final de QA do S1 no commit ff7af13 (21/11/2026) — APROVADO com 1 achado Firefox; pegadinhas de motor e do próprio harness que geram falso FAIL
metadata:
  type: project
---

Veredito completo: `docs/veredito-iris-s1-final.md`. Complementa [[project-s1-validacao-independente]] e [[project-s1-ambiente-de-teste-e-ferramentas]].

**Resultado:** API 255/255 duas vezes (Node 22, PG 18.1 novo, 20 migrações), `check` ok, CI verde no mesmo SHA, tela E-mail 441/442 em Chromium+WebKit+Firefox (desktop e celular).

**Bug pego (F1, baixa, só Firefox):** `-mt-1` no botão "Remover a senha salva" (`EmailSettingsForm.tsx` ~352) faz o Firefox NÃO rolar até ele no Tab (27 px de 44 abaixo da dobra a 1280x800). Isolado em página mínima: só a variante com margem superior negativa reproduz. **Área frágil:** margem negativa em alvo de foco; conferir Firefox ao mexer em espaçamento de botões na borda da dobra.

**Falsos FAIL que NÃO são do app (calibrar antes de reprovar):**
- WebKit e Firefox deixam campo já meio visível parcialmente abaixo da dobra no `focus()` (16-19 px, medido em página mínima); Chromium rola até a borda. WebKit rola o foco de forma assíncrona (medir só depois de assentar, ~60 ms em laço até a posição estabilizar).
- WebKit (Playwright 26.5) não põe `<a href>` no Tab; botões e campos sim. Navegar até link por Tab não é provável lá.
- WebKit ignora `box-shadow` em `<select>`; o foco da Porta só mostra a borda âmbar.
- Teste de e-mail do painel: 5/h por admin, a 6ª dá 429 — um dono por motor.
- `npm run check` em checkout cru falha por `expo-env.d.ts` no .gitignore (o CI gera); não é regressão.
- API só sobe com papel restrito (`vuumbora_api`) com `MIGRATION_DATABASE_URL` no boot.

**Erros do meu harness (aprendi):** (1) mapeei códigos de ativação pela ordem do glob (chromium, firefox, webkit) e não pela ordem que escrevi — webkit/firefox usaram o código trocado; (2) regex `\s` escrita dentro de template literal num `node -` via heredoc virou `s` (rótulos "Motori ta") — usar `split(/\s+/)` ou `Edit`; (3) `getByText('Configuração salva.')` casa também a frase "configuração salva" de outro parágrafo — usar `getByRole('status')`. **How to apply:** sempre incluir canário (injetar o defeito e ver o detector acusar) e olhar o log de um motor antes de generalizar um FAIL.

**Ambiente:** scripts em `scratchpad/iris/final/e2e` (efêmeros). Subi tudo em portas próprias (PG 5437, API 3102, admin 4310, SMTP 2525/2599) e derrubei; o Postgres da 5432 (pid de serviço do Windows) não é meu.
