# Admin — procedimento de emergência (break-glass)

Para quando o painel trava a pessoa certa. **Quem executa:** o responsável técnico, com acesso ao terminal do serviço
`vuumbora-backend` no Easypanel (ou `psql` com a credencial **dona** do banco — a credencial restrita `vuumbora_api` não alcança tudo
isto). Toda ação abaixo deve ser feita só depois de confirmar **fora do painel** (voz, presencialmente) que quem pede é a pessoa certa.

Contexto: M-4 da revisão S1 (`docs/revisao-seguranca-s1.md`). Os bloqueios existem para barrar adivinhação, e têm o custo inverso.
**Senha (decisão do dono, 21/11/2026, I-6):** não há mais bloqueio da conta por senha errada — só uma **espera progressiva por par
(e-mail + IP)**: 1 s, 2 s, 4 s… até 15 min. Quem erra de outro IP **não** impede o dono de entrar; por isso, destravar a senha raramente
é preciso (ver §2). **Código do 2FA:** o bloqueio de 15 min **por admin** continua como estava (aceito pelo dono, M-4): quem sabe o e-mail e a
senha de um admin ainda consegue travar o código dele. Todo travamento fica na trilha: `admin.2fa.locked` (código de 2FA),
`admin.login_locked` (par chegou à espera máxima de 15 min), e cada erro em `admin.2fa.verify_failed` / `admin.login_failed`.

## Qual é o bloqueio? (diagnóstico em 1 minuto)

| Sintoma na tela | Código da resposta | O que é | Passa sozinho em |
|---|---|---|---|
| "Muitas tentativas com código errado" | `two_factor_locked` | 5 códigos de 2FA errados seguidos (por admin) | 15 min |
| "Muitas tentativas com senha incorreta" | `account_locked` | espera progressiva do **par (e-mail + IP)** depois de senha errada: 1 s, 2 s, 4 s… 15 min (outros IPs não são afetados) | de 1 s a 15 min |
| "Aguarde" | `rate_limited` | limite por IP (5 logins / 15 min), em memória | 15 min, ou reiniciar a API |

Ver quem está travado:

```sql
-- 2FA (código errado): quem e até quando
SELECT u.email, t.locked_until FROM admin_totp t JOIN admin_users u ON u.id = t.admin_id WHERE t.locked_until > now();
-- Senha: pares (e-mail + IP) em espera longa — 11+ falhas em 24 h = espera de 15 min (o hash é sha256('admin-login-v1:' || e-mail);
-- ip_address guarda o IPv4 ou o /64 do IPv6)
SELECT email_hash, ip_address, count(*), max(created_at) AS ultima FROM admin_login_failures
 WHERE created_at > now() - interval '24 hours' GROUP BY email_hash, ip_address HAVING count(*) >= 11;
```

## 1. Destravar o 2FA (código errado demais)

```sql
UPDATE admin_totp SET failed_attempts = 0, locked_until = NULL, updated_at = now()
 WHERE admin_id = (SELECT id FROM admin_users WHERE email = 'pessoa@vuumbora.com.br');
```

## 2. Zerar a espera de senha (par em `account_locked`)

O dono legítimo, vindo de um IP que não errou, **entra sem esperar**. Se for o PRÓPRIO IP dele que acumulou erros (digitou errado muitas
vezes) e não puder esperar até 15 min, zere os pares da conta (todos os IPs):

```sql
DELETE FROM admin_login_failures
 WHERE email_hash = encode(sha256(convert_to('admin-login-v1:' || lower('pessoa@vuumbora.com.br'), 'UTF8')), 'hex');
```

Credencial **dona** (`MIGRATION_DATABASE_URL`): o papel `vuumbora_api` ainda apaga esta tabela, mas este procedimento é de operador.

Se o limite por IP for o que está segurando e não puder esperar: reiniciar o serviço da API zera a memória do limite (afeta todo mundo, por
15 min de novo só se voltarem a errar).

## 3. Perdeu o celular E os códigos de recuperação (dono/financeiro)

Só o responsável técnico resolve; não existe caminho pelo painel, de propósito.

```bash
# Num terminal/tarefa do serviço vuumbora-backend (Easypanel) COM a MIGRATION_DATABASE_URL (credencial dona; o papel restrito da API não
# emite token de ativação — migração 0017). Não deixe essa variável no ambiente permanente da API (docs/publicar-o-backend.md):
npm run reissue-2fa-enrollment -w @vuumbora/api -- --email=pessoa@vuumbora.com.br --reset-2fa
```

O script apaga o 2FA anterior **e todas as sessões** da pessoa, grava `admin.2fa.reset_by_operator` na trilha e imprime um código de
ativação novo (uso único, 48 h; os anteriores morrem). Entregue **só à pessoa**, por canal seguro; ela entra com e-mail e senha, informa o
código de ativação e escaneia o QR de novo. Recusa quem ainda tem 2FA ativo se faltar `--reset-2fa`, e recusa papel que não obriga 2FA.

Papéis opcionais (operação, revisor, suporte) que perderam o 2FA: o próprio dono não consegue pelo painel; no banco, como no item 1 mas
apagando o 2FA: `DELETE FROM admin_recovery_codes WHERE admin_id = ...; DELETE FROM admin_totp WHERE admin_id = ...;`
(e `DELETE FROM admin_sessions WHERE admin_id = ...;` para derrubar quem estiver logado).

## 4. Código de ativação perdido ou vencido (primeiro enrolamento)

```bash
npm run reissue-2fa-enrollment -w @vuumbora/api -- --email=pessoa@vuumbora.com.br
```

Sem `--reset-2fa`. Emite outro código e invalida o anterior.

## 5. Perdeu a senha

Hoje não há "esqueci a senha" no painel. Gerar um hash novo e gravar no banco (a pessoa deve trocar depois — ainda não existe tela para isso):

```bash
node -e "require('bcryptjs').hash(process.argv[1],12).then(console.log)" 'NovaSenha-Forte-123'   # na pasta apps/api
```
```sql
UPDATE admin_users SET password_hash = '<hash gerado>' WHERE email = 'pessoa@vuumbora.com.br';
DELETE FROM admin_sessions WHERE admin_id = (SELECT id FROM admin_users WHERE email = 'pessoa@vuumbora.com.br');
```

Não deixe a senha no histórico do shell compartilhado (use um terminal só seu e limpe o histórico).

## 6. Perdeu a chave `ADMIN_TOTP_ENCRYPTION_KEY`

Todos os segredos TOTP deixam de decifrar (login de dono/financeiro dá erro). Guarde um backup da chave **fora do banco** (gerenciador de
senhas do dono). Sem backup: restaurar a variável é impossível; o caminho é gerar chave nova e fazer o item 3 para cada pessoa com 2FA.

## O que NÃO fazer

- Não zerar `admin_audit_log`: o banco recusa (trigger append-only), e isso é proposital.
- Não desativar o 2FA de dono/financeiro "só para entrar": a regra existe para o caso em que a senha vaza.
- Não passar o código de ativação por e-mail/WhatsApp de grupo; ele equivale a uma segunda senha de uso único.
- Registrar o que foi feito (quem pediu, como foi confirmado, quem executou) — as ações por script já entram em `admin_audit_log`; as de SQL manual,
  não, então anote à parte.
