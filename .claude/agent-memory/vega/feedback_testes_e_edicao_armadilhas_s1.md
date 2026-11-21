---
name: feedback-testes-e-edicao-armadilhas-s1
description: Armadilhas que custaram tempo na rodada 2 do S1 — arquivos CRLF, heredoc, banco/porta compartilhados, mutação redundante, cliente do pool monkeypatchado, contagem de linhas de tentativa
metadata:
  type: feedback
---

- **Arquivos com CRLF** (`identity-repository.ts`, `identity.test.ts`...) fazem `replace` de trecho MULTILINHA em script falhar ("não achei") sem aviso óbvio.
  Como evitar: normalizar `\r\n`→`\n` antes de casar e reconverter ao gravar, ou usar a ferramenta Edit. Conferir com `grep -c $'\r'`.
- **Heredoc `<<'EOF'` com crases/aspas no Bash** quebra de forma intermitente ("unexpected EOF"). Para script com template literal, gravar com a ferramenta Write e rodar `node arquivo.mjs`.
- **Outra frente roda no mesmo ambiente**: a Íris deixou um SMTP falso segurando as portas 2525 e 587 (e outras sessões usam o Postgres 5434). Não matar processo
  alheio; o teste do e-mail do painel agora escolhe a 1ª porta livre entre 2525/587/25. Se `EADDRINUSE`, ver `netstat -ano` antes de culpar o código.
- **Migração de outra frente pode quebrar o cadastro** (a 0019 exige `birth_date` por gatilho → 503 em todo register até o app enviar a data): se "tudo dá 503" após banco novo,
  ler as migrações novas (`ls migrations`) antes de depurar o app. Erro real aparece com um teste temporário chamando o serviço e imprimindo `err.code/err.message`.
- **Mutação em camada redundante sobrevive**: rate-limit tinha `keyGenerator` global E na rota; mutar um só não falhou. Mutar os dois juntos (runner com `also:[...]`).
  Sempre que uma defesa existe em dois lugares, o teste de mutação tem que remover os dois.
- **Teste que simula falha monkeypatchando o cliente do pg**: o pool REUSA o objeto; restaurar `query` no `release`, senão a falha vaza para os testes seguintes.
- **Contar linhas de `login_attempts`**: a tentativa reservada continua gravada como falha mesmo após o sucesso (o sucesso só "zera" por data). Comparar delta antes/depois, não valor absoluto.
- Teste de limite por tempo: não dormir; recuar `attempted_at`/`created_at` por UPDATE (e `expires_at` junto nos códigos, por causa do CHECK `aec_ttl_short`).
- `clock_timestamp()` (não `now()`) quando a ORDEM de duas transações importa para a espera progressiva (now() é o início da transação).
- **Deadlock do pool do pg**: segurar um client dentro de transação e pedir outro ao pool (`pool.query`) no pós-commit trava com N cadastros simultâneos = max do pool (5) → timeouts/503. Liberar o client ANTES do trabalho pós-commit.
- Trabalho pós-commit que referencia a conta (log de e-mail enviado) pode violar FK se outro cadastro substituiu a conta no meio: tolerar 23503 e testar com um MailPort que faz a substituição dentro de `send`.
- Teste de TOTP por relógio é intermitente na virada de 30 s: ler `last_used_step` do banco e gerar o código desse passo (+1).
