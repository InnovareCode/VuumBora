# Cronograma vivo do VuumBora

Atlas, 27/11/2026. Responde a pergunta do dono "quais etapas já foram concluídas, quais restam e em que ordem". **Não reabre
o plano:** os marcos, os critérios de aceite e o processo continuam em `docs/plano-mestre.md` (§2 a §7) e as fases S0 a S9 em
`docs/plano-sistema.md` §8. Este arquivo é só o retrato de hoje e a ordem do que falta. Atualizar a cada marco fechado.

**Sobre as datas.** O dono não fixou prazo (D-02). As semanas abaixo são **estimativa** pelo ritmo medido de 18 a 27/11 (M1, o
S1 publicado e as ondas de tela 0 a 5 em nove dias), não compromisso. Dois fatores mudam o ritmo: o **limite semanal de uso**
(parou a equipe de 23 a 27/11) e o tempo de resposta das decisões e contas que só o dono faz.

---

## 1. O que já foi concluído

| Marco ou trilha | Situação | Prova |
|---|---|---|
| **M1** Backend e apps em modo de teste | Fechado | `docs/veredito-iris-s1-passada-5.md` |
| **F01 a F03, F07, F08, F08b, F10, F11** | Na main | `PROGRESSO.md`, vereditos da Íris |
| **Publicação do S1** (API com migrações 0010 a 0023, painel admin, admin do dono com 2FA, `REQUIRE_SECRETS`, HTTPS do Easypanel) | No ar desde 22-23/11 | `tools/producao/verificar-pos-deploy.mjs`: 11 OK, 0 falhas em 27/11 |
| **Ondas 0, 1, 2, 3 e 5 do padrão premium** (fundação, entrada, casa, pedido, contas e histórico) | Na main, Íris APROVADO | `docs/veredito-iris-portao-onda*.md`; onda 5 em `a280d81` |
| **Onda 4** (a corrida nos dois apps) e **PIN de embarque** (D-12) | Na main em `048b4dd`, CI verde; **revalidação da Íris em andamento** | Reprovada em `1a4d4f1` (M08 sem PIN), corrigida |
| **Scripts do papel restrito**, **expo-dev-client**, **simulador de tarifa**, **comparação de gateways** | Na main; esperam o dono usar | `apps/api/scripts/ativar-papel-api.mjs`, `tools/simulador-tarifa/`, `docs/decisao-gateway-pagamento.md` |
| **Teste de 100 endereços de Natal** (F10) | Feito: **86%**, abaixo dos 90% pedidos. PostGIS **não** está na imagem do banco | `docs/area-de-servico-natal.md` |

---

## 2. O que falta, em ordem

Cada etapa só fecha com veredito da Íris sobre um SHA na main (e revisão do Órion quando há segurança). "Dono" marca o que só
ele pode fazer.

### Etapa 1 — Fechar a onda 4 (agora, horas)
- Íris revalida `048b4dd`; Vulcano conserta o portão (estado sem rede, prancha ausente, links com `router.replace`).
- **Fecha quando:** Íris APROVADO e as 4 missões da onda 4 baixadas no painel.

### Etapa 2 — Fechar o M2, publicação fechada (semana 1, depende quase só do dono)
| Item | Quem | Tempo do dono |
|---|---|---|
| Trocar os 3 segredos gerados na conversa **e** ativar o papel restrito, num deploy só | **Dono**, guiado pelo Atlas | ~20 min no computador |
| SMTP do domínio e um cadastro de teste com e-mail real (SPF, DKIM, DMARC) | **Dono** (dados do provedor de e-mail) + Vulcano confere | ~30 min |
| Provar o `TRUST_PROXY` (IP real no log) | Vulcano | — |
| Backup externo e **uma restauração de verdade** depois da publicação | Vulcano roteiro, **dono** executa | ~30 min |
| Conta Expo e o primeiro build Android (F06, B5 no aparelho) | **Dono** cria a conta; Vulcano e Íris fazem o resto | ~15 min + o celular |
| Desligar o Web Analytics da Cloudflare no `admin.` | **Dono** | 1 min |
| **Fecha quando:** os 8 itens do M2 (`docs/plano-mestre.md` §2) provados | | |

### Etapa 3 — Em paralelo, sem esperar o dono (semanas 1 a 4)
| Frente | O quê | Quem | Esforço |
|---|---|---|---|
| **Onda 6** | Painel admin (A01 a A07) pelo portão em desktop, tablet e celular | Lyra + Íris | P |
| **Dívidas de tela** | `useNetworkStatus` do DS no web, `aria-selected` nas abas, tamanhos de `Avatar`, `expo-clipboard` e `expo-location` (PP-8), e-mail no `me()` | Lyra (DS) + Vega | P |
| **M3, documentos do motorista** (S2) | Decisões 9 e D-13 já tomadas. Upload com link que expira em 5 min, armazenamento no Brasil cifrado, fila do "Revisor de documentos", motivos de recusa em lista fechada, documento vencido impede ficar online, vínculo candidatura → conta do motorista, telas M03 e M04 | Nova (desenho) → Cronos → Vega → Lyra → Íris → Órion | G |
| **M4, geografia e cotação** (S3) | Plano alternativo aos 86% (pino no mapa e pontos próprios), PostGIS na imagem, área de Natal, cotação versionada no servidor com **tarifa de teste marcada** até a decisão 7 | Vega + Vulcano → Íris | M |

### Etapa 4 — M5, o núcleo da corrida (S4) (semanas 4 a 10, o maior bloco)
- Despacho sem atribuição dupla, ofertas, tempo real, posição do motorista, PIN no servidor, cancelamento, 190; os apps trocam o
  mock por `http`; Mapbox nativo no build Android.
- Teste de campo **só Android**: 10 corridas reais em Natal, dois aparelhos.
- **Depende de:** M3 (motorista aprovado de verdade), M4 (cotação real), F06 (build Android).

### Etapa 5 — M6, pagamentos e repasse (S5) (semanas 10 a 13)
- Split por transação, conciliação ao centavo, webhook idempotente, nada de cartão no servidor.
- **Depende de:** decisão do **gateway** (D-03) com o contador, e da **tarifa** (decisão 7).

### Etapa 6 — M7, operação no painel (S6) (semanas 11 a 14, em parte junto com o M6)
- Toda ação com linha no `audit_log`; roteiro de operação feito por alguém que não construiu o painel.

### Etapa 7 — M8, segurança, LGPD e prontidão legal (S7) (semanas 14 a 17)
- Órion sem crítico nem alto; retenção e exclusão provadas; checklist legal assinado pelo advogado; build aceito no teste
  interno do Google Play.
- **Depende de:** **seguro APP** (D-11, advogado e corretor), **conta Google Play**, textos legais publicados.

### Etapa 8 — M9, beta fechado em Natal, Android (semanas 17 a 20)
- 300 corridas pagas, conciliação diária, 99% das sessões sem travar.

### Etapa 8i — Bloco iOS (a partir do fim do M5, em paralelo)
- Conta Apple, build iOS, localização em segundo plano no iPhone, push, TestFlight. **Depende da conta Apple** (decidido: ao fim).

### Etapa 9 — M10, lançamento
- Aprovado nas duas lojas; restauração com RPO de 15 min provada.

**Estimativa total até o beta Android: ~20 semanas a partir de hoje, ou seja, por volta de abril de 2027**, se as decisões
abaixo chegarem antes do ponto em que travam. É a soma dos esforços do plano mestre com o paralelismo acima, não um prazo.

---

## 3. Decisões e ações do dono, na ordem em que travam

| Quando trava | Decisão ou ação | Situação |
|---|---|---|
| **Já** (M2) | Troca dos segredos + papel restrito; SMTP; backup; conta Expo | Adiadas pelo dono em 23/11 |
| **Já** (abrir o cadastro) | Textos legais revisados pelo advogado | Rascunho em `docs/juridico/` |
| **Início do M3** | Lista de documentos da **STTU** de Natal | Ação do dono; a estrutura nasce configurável sem ela |
| **Início do M3** | Provedor de armazenamento no Brasil (custo) | A Nova recomenda na abertura do M3 |
| **Antes de publicar a M04** | Prazo de análise dos documentos (48 h corridas na 0024; o plano propunha "2 dias úteis", que não é o mesmo no fim de semana), os 11 motivos de recusa propostos e a idade máxima do veículo (10 anos, provisório) | Propostos pela Nova e pelo Cronos em 27/11 |
| **Antes de publicar a M04** | Teto de validade por documento: CNH 10 anos, CRLV 2 anos, certidão de antecedentes 1 ano (proposta da equipe, ajustável sem deploy) | Cronos, migração 0025 |
| **Antes do beta** | Motorista excluído que se recadastra pode reaproveitar a candidatura? Guardar uma lista mínima de impedidos (motorista suspenso que exclui a conta e volta com o mesmo CPF) e por quanto tempo (decisão 16, com o advogado) | Levantados pelo Cronos e pelo Órion em 27/11 |
| **Antes das rotas de cadastro do motorista (D2)** | Concluir a F05c (papel restrito) e pedir no Easypanel `log_error_verbosity = terse` no Postgres; `BACKUP_PASSPHRASE` obrigatória | Órion, revisão M3-D1 (relatório privado) |
| **Fim do M4** | **Tarifa** e faixas da taxa (decisão 7) | Simulador pronto em `tools/simulador-tarifa/` |
| **Início do M6** | **Gateway** (D-03) e saque (decisão 6), com o contador | Comparação pronta em `docs/decisao-gateway-pagamento.md` |
| **M8** | **Seguro APP** (D-11); **conta Google Play**; checklist do advogado | Abertas |
| **Etapa 8i** | Conta Apple | Decidido: ao fim |
| Quando houver parecer | Motorista mulher, Pet, Entrega (D-08, D-09) | Ocultas até o parecer jurídico |
| Nunca trava | Prazo (D-02) e orçamento (D-01) | Abertas; seguem os padrões do plano mestre |
