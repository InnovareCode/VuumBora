---
name: feedback-tsx-watch-eaddrinuse-restart-falho
description: Nesta máquina Windows, tsx watch às vezes falha o restart automático com EADDRINUSE e mantém o processo ANTIGO no ar — perigoso em mutation test
metadata:
  type: feedback
---

Ao editar `apps/api/src/*.ts` com a API rodando via `npm run dev` (`tsx watch
src/server.ts`), o restart automático do `tsx watch` falhou mais de uma vez
com `listen EADDRINUSE: address already in use` nesta máquina — o processo
novo não conseguiu subir, e o processo ANTIGO (com o código de ANTES da
edição) continuou escutando e respondendo normalmente.

**Por quê isto importa:** numa prova por mutação (ver skill
`quem-valida-o-que`, regra 3 — quebrar a correção de propósito pra ver o
teste falhar), isso é armadilha silenciosa: mutei `app.ts` pra remover o
serializer do log, esperei o restart, rodei a busca de novo — e o grep deu
zero igual, porque quem respondeu foi o processo velho (ainda com o fix),
não o mutado. Só percebi porque chequei o log e vi a linha `EADDRINUSE`
bem onde esperava o restart.

**Como aplicar:** depois de editar código da API com `tsx watch` rodando,
NUNCA confie que o restart funcionou só porque o terminal não travou. Confira
a linha de log do restart: se aparecer `EADDRINUSE` depois do `[tsx] change
in ...`, o processo ativo ainda é o antigo. `taskkill //F //PID <pid da
porta>` (achar com `netstat -ano | grep LISTENING | grep <porta>`) e subir
`npm run dev` de novo do zero garante o código atual de fato no ar. Vale
tanto pra ligar o fix de volta depois de um teste de mutação quanto pra
qualquer edição durante uma bateria de testes.

Ver [[project-admin-v0-ambiente-de-teste]].
