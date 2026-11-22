---
name: feedback-python-crlf-e-admissao-na-http
description: Python no Windows regrava CRLF sem avisar; grep -c com $'\r' mente; teste de concorrência do banco pela HTTP não convive com limite por origem; o timer do worker conta a subida da thread
metadata:
  type: feedback
---

- **`open(p,'w')` do Python no Windows converte LF em CRLF** (e `open(p)` lê CRLF como LF). Reescrevi 5 arquivos de `src/` assim na rodada 3b: o único sinal foi o aviso do git ("CRLF will be replaced by LF") e um `git diff --stat` inflado. Use `newline=''` na leitura E na escrita, ou a ferramenta Edit.
  **How to apply:** depois de editar por script, conte CRs com `tr -cd '\r' < arquivo | wc -c` (0 = LF). `grep -c $'\r' arquivo` deu 0 antes e "todas as linhas" depois no mesmo arquivo: não confie nele aqui. Conserto: `sed -i 's/\r$//'`.
- **`python3` funcionou nesta máquina** (a nota antiga sobre o atalho da Loja que pendura não se repetiu), mas heredoc com aspas/crases continua quebrando: grave o script com `Write` e rode.
- **Teste de concorrência do banco pela HTTP (12 logins do mesmo par em paralelo) não convive com admissão por origem**: o par é por definição o mesmo IP, então vira o mesmo balde e o excedente leva 503 antes de chegar ao lock. Prove o lock no repositório (`reserveDelayedAttempt`, `reserveFailureSlot`: 12 chamadas, 1 concedida) e deixe a HTTP com o que um balde pode ter (2). Teste com 12 IPs DIFERENTES simultâneos esbarra na capacidade da pista (10 lugares): suba `AUTH_BCRYPT_QUEUE_MAX` no preâmbulo do arquivo (processo por arquivo no `node --test`).
- **Timer de worker conta a subida da thread**: sob `tsx` a thread leva centenas de ms para subir; prazo curto de teste estoura por isso. Aqueça todas as threads antes de armar o prazo, use thread JÁ aquecida para a operação seguinte e prefira prazo folgado + espera maior que o prazo para provar "o vigia foi cancelado".
- **Prova determinística de fila/justiça**: ocupe as vagas de rodar com `hash(..., 13)` (~1 s) e dispare a rajada inteira; nada começa antes de a rajada ser decidida, em qualquer CPU. Contar só o que ESPERA por balde (o que roda sai da conta) é o que faz a asserção valer sem depender de velocidade.
- Runner de mutação em cópia: junção de `node_modules` para a raiz E para `apps/api/node_modules`, copiar `tsconfig.base.json`, `--test-timeout` para transformar travamento em falha (mutante sem vigia trava de verdade), e matar o processo filho (thread em laço infinito mantém o processo vivo).
