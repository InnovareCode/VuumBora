---
name: project-s1-passada-5-qa
description: Passada 5 de QA no SHA 6a3ff24 (22/11/2026) — APROVADO; N1/N2 provados em 120 execuções; achados Q1 a Q6 (lacunas de teste do bcrypt fora do verify-email, N3 com 7 formas vivas, LinkButton sem teclado no web)
metadata:
  type: project
---

Veredito completo: `docs/veredito-iris-s1-passada-5.md`. Complementa [[project-s1-passada-4-qa]] e [[project-s1-ambiente-de-teste-e-ferramentas]]; receitas e armadilhas em [[feedback-harness-passada-5]].

**Resultado: APROVADO.** CI verde (run 45013394294, 4 jobs; passo da API 73 s no runner contra 212 s local). Suíte 384/384 em 5 de 5 (banco novo, mesmo banco, 3x presa a 2 CPUs). `bcrypt-ceiling` 120/120 (6 condições x 20). Cofre do A3: 84/84 e 8 de 8 mutantes mortos (inclusive "marcar antes de apagar"). 12 execuções de web sem token em nenhum armazenamento. B-6 por motor nos dois apps. F3, FX, anel de foco, guardas, reaceite, N4 e N6 verdes nos 3 motores nos dois apps, cada detector com canário.

**Achados (nenhum bloqueia):**
- **Q1 (média, lacuna de teste):** tirar o bcrypt do pool em login (M5), cadastro (M6) ou login do admin (M8) passa os 384 testes; só `verify-email` (M4) e reset (M7) morrem. A rajada só usa verify-email e as contas de teste têm hash de custo 4. **How to apply:** antes de qualquer mexida em `bcrypt-pool.ts`/serviços de identidade, cobrar teste estático ("bcryptjs só no worker") e rajada com login de custo 12.
- **Q2:** o limite de parada total de 1000 ms é um ORÇAMENTO (~2 comparações aqui): M3c (1 de 3 na principal) soma 864 ms e passa. M1b (sync na principal com vagas ocupadas, o único que o limite novo pega) soma 2743 ms a custo 12, 1306 ms a custo 11, 651 ms a custo 10 (aí só o teste 3 pega, por outro motivo). **Why:** a calibragem depende da velocidade; emular máquina mais rápida com `AUTH_BCRYPT_COST` 11/10 no teste.
- **Q3:** `consent-gate-coverage` ainda deixa passar 7 formas (auth com `schema` obrigatório = 400 antes do 401, auth própria 401 com outro code/403, portão de mentira com o nome certo, portão escondido em rota exempt). As 3 da passada 4 morrem.
- **Q4 (web, preview):** `LinkButton` (`<div role=link>`) não ativa por Enter/Espaço (RN Web 0.21.4 trata role=link como nativo e espera o clique). Todos os links de texto dos dois apps. Não é regressão.
- **Q5:** string morta "Cadastro em análise" no bundle do motorista (ramo `approved=false` inalcançável, `registrationApproved = true` fixo); Home mostra "ONLINE" ao lado do aviso "cadastro é outra etapa" (demonstração marcada).
- **Q6:** outliers do `/healthz` de 231 a 289 ms em 6 de 120 execuções (2 CPUs e carga 2x) continuam sem causa; o limite de 200 ms antigo teria reprovado 5%.

**O que ainda separa o S1 de produção fechada** (nada de QA): apps ainda em identidade mock (B4 e contas de loja), textos legais do dono, publicação coordenada das migrações 0010-0021 com API e painel, produção real sem prova (Docker, TRUST_PROXY, papel restrito, SMTP TLS), e não achei rodada do Órion sobre o delta pós-3b (A3, B-6, pool).

O HEAD NÃO andou desta vez (conferi no começo e no fim). Não subi API real nem SMTP falso (nenhum item pediu).
