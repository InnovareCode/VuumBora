---
name: project-s1-rodada3-recadastro-aceite
description: Auditoria S1 rodada 3 (2026-11-21, HEAD ff7af13) — função reclaim 0020, aceite/idade 0019, I-8/S-3/I-6 residual; 0 críticos, 1 alto (CPU bcrypt), 5 médios; padrões novos
metadata:
  type: project
---

Relatório: `docs/revisao-seguranca-s1-rodada3.md` (escala usada: crítico/alto/médio/baixo, a pedido do Atlas; alto = IMPORTANTE). Resultado: 0/1/5/7.

**Resolvido e reconferido no código:** I-4 (recadastro substitui conta pendente; verificar exige a senha do cadastro, `account-recovery-service.ts:142-147`), I-8 parcial (CSP e demais cabeçalhos no `apps/admin/nginx.conf`), I-2 (step-up em save/remove do SMTP), CORS separado para `/v1/admin/*` (a pendência de CSRF da memória do Admin v0 está RESOLVIDA), I-6 como desenho (atraso progressivo por par), 0020 e 0019 sólidas (sem tomada de conta, sem enumeração pela função, laço limitado a 6).

**Abertos ao fim da rodada 3:** A-1 bcryptjs sem teto global/concorrência (medido: 429 ms por compare, fila serial, ~70 IPs a 30 req/15 min saturam; `verify-email` e `reset-password` só têm limite por IP); M-1 botnet (105 tentativas/dia/par; sem lista de senhas comuns); M-2 terceiro apaga cadastro pendente e queima o código de verificação (5 tentativas por código, sem prova de quem chama); M-3 aceite grava versão do servidor (env), não a que o usuário viu, sem hash do texto; M-4 HSTS ausente no admin e no site e fora dos guias; M-5 teto global de 100 e-mails/h é interruptor (4 IPs); S-3 usuário SMTP em claro na auditoria (`admin-email-settings-service.ts:156,160`); `ip_hash` do aceite nunca é zerado (retenção não tem o passo).

**Why:** padrões novos deste projeto: (1) correção de um achado troca o risco de "ocupação para sempre" por "apagamento por terceiro" (sempre perguntar: quem é o último a escrever vence? quem consegue repetir isso de graça?); (2) limite por IP é a única defesa em rotas que gastam CPU (bcrypt) antes de qualquer chave; limite por IPv6 /64 não resiste a /48; (3) trilha "append-only" afirmada com prazo de minimização prometido em comentário e não implementado em nenhuma rotina; (4) "versão do documento" vinda de variável de ambiente prova o rótulo, não o que o usuário viu; (5) funções SQL com ordem de trava diferente (conta→código vs código→conta) são deadlock latente.

**How to apply:** ao revisar fluxo de cadastro/verificação, listar os três atores (titular, atacante que sabe o e-mail, botnet) e ver o que cada um consegue destruir; medir custo do hash antes de afirmar capacidade (`node -e` com o módulo real); checar se cada promessa de retenção/minimização tem rotina; em SQL novo, comparar a ordem de trava com `issue_email_code`/`consume_email_code`.
