---
name: feedback-teste-mutacao-e-banco-compartilhado
description: Armadilhas de rodar suíte e prova por mutação com outros agentes mexendo na mesma árvore (migração nova no meio, trilha append-only suja, run em segundo plano sobreposto)
metadata:
  type: feedback
---

- Nunca lance `npm test` em segundo plano e outro em primeiro plano contra o MESMO banco: 17 falhas falsas num baseline que era 255/255 (a execução sobreposta bagunça o banco). Rode uma de cada vez e, ao ver falha inexplicável, reconfira num banco novo antes de culpar o código.
  **Why:** a suíte trunca tabelas compartilhadas; duas execuções se pisam.
  **How to apply:** uma suíte por vez por banco; `dropdb --force` + `createdb` (nome terminando em `_test`) para limpar.
- Outro agente (Cronos) pode largar uma migração nova (`0021`) na árvore NO MEIO da tarefa e o `prepararBanco` a aplica: 80 testes de identidade passaram a falhar (trigger exige versão publicada), sem relação com o meu código. Prova de que não era meu: baseline = `git archive HEAD apps/api` + a migração nova, suíte idêntica (mesmos 80 nomes). Para validar o MEU trabalho, rodei numa cópia isolada (robocopy sem a migração, junção `node_modules`, banco próprio).
  **How to apply:** ao ver falha em massa depois de `git status`/`ls migrations` mudar, compare com baseline antes de mexer; reporte o conjunto como de terceiros.
- Prova por mutação faz o teste de segurança GRAVAR coisa real: a trilha `admin_audit_log` é append-only, então a mutação "usuário em claro" sujou o banco para sempre e o teste de varredura da tabela inteira passou a falhar sozinho. Use marca única por execução (`Math.random().toString(36)`) nas strings procuradas, e faça mutação sempre numa cópia (nunca na árvore compartilhada).
- Teste de rajada: não fixe `sleep(150)` esperando a pista encher (CI lento); espere por polling até a condição (`stats().active === SIZE`). Mutação "bcrypt na principal mas com teto" é a que prova a asserção de /healthz; "sem pool" derruba o `before` antes e não prova nada sobre o healthz.
- Driver de mutação em Python: `subprocess.run(["bash", ...])` resolve para o `bash.exe` do WSL (System32), que não enxerga `C:/...` e devolve "No such file" — a primeira rodada marcou 19 mutações como "SOBREVIVEU" sem ter rodado teste nenhum. Use o caminho do Git Bash e trate "sem linha `ℹ tests`" como INVÁLIDO, nunca como sobrevivente.
- Mutante de camada redundante (conferência da API + rede do banco devolvendo o mesmo 409) sobrevive até o teste observar a camada: rastreie as instruções SQL (pool/clients anotando `text`) e afirme "nenhum INSERT/UPDATE/DELETE chegou" para a conferência; para a rede do banco use a corrida (publicar entre a conferência e o INSERT). Teste positivo no perfil CERTO (motorista com a vigente DELE) mata o mutante "compara com o perfil errado".
- Banco de teste persiste entre execuções: `uniqueEmail()` do kit (contador) colide com conta já verificada na 2ª rodada (409 email_taken). Em teste novo use e-mail com `randomUUID()`. E `\b` em script gerado por heredoc vira backspace (0x08): grave via Write e confira com `cat -A`.
