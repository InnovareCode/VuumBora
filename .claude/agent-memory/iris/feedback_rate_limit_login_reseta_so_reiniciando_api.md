---
name: feedback-rate-limit-login-reseta-so-reiniciando-api
description: O rate limit do /v1/admin/auth/login é em memória, por IP, e não reseta sozinho — planeje os testes de login em lote único
metadata:
  type: feedback
---

`ADMIN_LOGIN_RATE_LIMIT_MAX=5` por `ADMIN_LOGIN_RATE_LIMIT_WINDOW_MINUTES=15`
é global por IP (`@fastify/rate-limit` em memória, sem Redis). Em teste local
todo mundo bate do mesmo `127.0.0.1`, então QUALQUER chamada a
`/v1/admin/auth/login` — sucesso ou falha — consome uma das 5 tentativas da
janela. Rodar vários scripts de teste que cada um faz seu próprio login
estoura o limite rápido e trava por 15 minutos reais.

**Por quê:** levei duas rodadas de "por que caiu pra 401 genérico de novo?"
até perceber que não era bug, era eu mesma consumindo o orçamento de login
em testes separados.

**Como aplicar:** antes de uma bateria de testes no Admin v0, faça UM login
e reaproveite o cookie (jar do curl, ou `context.cookies()` do Playwright)
em todas as chamadas de leitura subsequentes. Se precisar mesmo testar o
próprio rate limit (estourar de propósito), faça por último, e reinicie o
processo da API depois (`Stop-Process` no PID da porta 3100 + `npm run dev`
de novo) para zerar o contador em memória antes de continuar outros testes
de login — não tem endpoint nem flag pra resetar, é literalmente reiniciar
o processo.
