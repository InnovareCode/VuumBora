# Veredito da Íris — portão da onda 4 (a corrida)

**APROVADO sobre `73bcffc`** (27/11/2026), em cópia limpa, depois de duas reprovações:

| Rodada | SHA | Veredito | Motivo |
|---|---|---|---|
| 1 | `1a4d4f1` | REPROVADO | M08: a corrida começava sem o PIN de embarque (o campo só existia num modo de teste) |
| 2 | `048b4dd` | REPROVADO | Regressões da correção: M06 sem saída quando a oferta é revogada; o rodapé fixo cobria o PIN na P08 "chegou" a 320-390 |
| 3 | `73bcffc` | **APROVADO** | Os dois bloqueios corrigidos e provados ao vivo |

**Escopo:** passageiro P07, P08 e P09 em `/corrida` (PP-10) e P10; motorista M06 (`/oferta`), M07, M08 e M09 em `/corrida`
e M10; contrato do PIN de embarque (D-12) em `packages/api-client` e `packages/domain`.

**Provas da rodada 3**
- Suítes: domain 48/48, api-client 334/334 (com o teste do mutante M4, que a suíte agora pega).
- Portão com a ferramenta de `07580fa` (sem-rede real): 14 entradas de 320 a 430, 92 capturas e 92 sondas. Banner sem conexão
  visível nas 36 combinações que o têm, `navigator.onLine` falso em todas. Zero em fora da viewport, alvos pequenos,
  sobreposições, contraste, anel de mouse, falha de link e `controleInvalido`. Único texto truncado: o endereço da M07 a 320,
  com reticências de propósito. G-07b: 7 montadas, 7 sem prancha.
- Roteiros de clique: `m06-saida` 11/11 (volta ao painel em 1,8-2,0 s nos três motivos), `motorista-vivo2` 36/36 (PIN real,
  código errado com foco, bloqueio na 6ª tentativa, chave de idempotência nova por tentativa, sem rede desabilita as ações),
  `segunda-corrida` ok, `p08-rolar` (cartão do código inteiro acima do rodapé nas 4 larguras), `passageiro-vivo2` 36/36
  (190 e Cancelar visíveis, Cancelar desabilitado sem rede, P09 "HH:MM · em N min", PIN só em "chegou").

**Ressalvas (não bloqueiam):**
- P09 a 320 sem rede: o banner empurra o "Ligar 190" para baixo da dobra. Caminho: o mesmo rodapé fixo da P08.
- Contêineres de rolagem focáveis sem anel de foco (P07, P07c, P08, M06): vem do `AppShell` em `packages/ui`.

**Não verificado:** bundle de produção, WebKit e Firefox, aparelho real (discador, Waze, Google Maps).
