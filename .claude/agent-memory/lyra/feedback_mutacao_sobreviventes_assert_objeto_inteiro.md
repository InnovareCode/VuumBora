---
name: feedback_mutacao_sobreviventes_assert_objeto_inteiro
description: Como provar que testes unitários de lógica pura pegam regressão (runner de mutação em Python, restauração por hash) e a lição dos 2 sobreviventes da A3 — asserte o objeto/pedido inteiro e a ORDEM, não só os campos que você lembrou.
metadata:
  type: feedback
---

**Receita (A3, 22/11/2026):** script Python em scratch com lista `(nome, arquivo, trecho único, trecho mutado)`; para cada mutante:
confere que o trecho existe UMA vez, grava, roda `node --import tsx --test test/*.test.ts` (~3 s), RESTAURA no `finally`, e ao fim
confere o SHA-256 de cada arquivo contra o original. 37 mutantes (apagar, marcar antes de apagar, não esperar a verificação,
comparação de hash desligada, http liberado, origem não conferida, hash do texto em vez dos bytes, hex sem zero à esquerda, UTF-8
aceitando forma longa...). Rodar o baseline antes (tem que dar verde) e re-rodar tudo depois de refatorar: um trecho mutado que
mudou de texto vira "TRECHO NAO UNICO" (aconteceu com `failed.length` → `failures.length`), não sobrevivente silencioso.

**Os 2 sobreviventes da 1ª rodada e a lição:**
1. `removeItem` sem esperar a verificação passava: eu tinha testado ordem só de leitura e escrita. **Teste de ordem por LOG do cofre**
   (`[remove:A, remove:B, remove:C, remove:pedida]`), não só por resultado final — o resultado final coincide mesmo na ordem errada.
2. Pedido de rede com um campo EXTRA (`cookie`) passava: o teste olhava `method`, `credentials` e as CHAVES de `headers`. **`deepEqual`
   do objeto de init inteiro** (`{method, credentials, headers, signal}`); campo a campo deixa passar o que você não lembrou de listar.
Também: o teste "mensagem de erro não vaza valor" era vácuo (o cofre falso lançava `'boom'`, sem o token). Faça o dublê ECOAR o
segredo na mensagem; só então o mutante que repassa `error.message` morre.

Relacionado: [[project_a3_secure_storage_and_verified_text]], [[feedback_prova_api_falsa_e_controle_negativo]].
