---
name: bug_inputcore_foco_invisivel_em_campo_invalido
description: InputCore (@vuumbora/ui) — campo INVÁLIDO e FOCADO tinha a mesma aparência do inválido sem foco (borda de 2pt vermelha nos dois), então o foco que a tela leva ao campo depois de um erro era invisível. Achado na B2 medindo imagem focado×desfocado; correção e como provar.
metadata:
  type: feedback
---

**Sintoma (B2, 22/11/2026):** a prova "foco por teclado visível em todo alvo" falhou só no campo do código (`codigo-code-input`) — o único que estava
inválido ao ser alcançado por Tab. Os testes anteriores (B1/B3 do passageiro, passada 3 da Íris) mediam `document.activeElement`, que prova ONDE o foco
está e não que ELE SE VÊ.

**Causa raiz:** `InputCore` usa a borda do wrapper como indicador de foco (`ctaBackground`, 2pt) E de erro (`dangerFill`, 2pt):
`borderColor = error ? dangerFill : focused ? cta : edge`. Com `error && focused` ganha o erro e o foco some — mesma cor, mesma largura. O `outline`
do navegador está desligado (`WEB_NO_INNER_OUTLINE`) de propósito. Afeta TODO campo (TextInput/Password/Phone/Date/Code/Search) e os dois apps; aparece justo
quando mais importa: o app leva o foco ao campo com erro (`setFocus`) depois de um envio que falhou.

**Correção (`packages/ui/src/InputCore.tsx`):** `error && focused` acrescenta `boxShadow: FOCUS_RING_ON_ERROR` = anel nítido (blur 0, spread 3, `ctaBackground`)
POR FORA da borda vermelha — o erro continua vermelho, o foco ganha sinal próprio, sem mexer no layout (boxShadow não ocupa espaço). Sem blur = não é halo
(direção de arte §0/§4). NÃO provado: o anel no Android/iOS (mesma ressalva de [[boxshadow_rn088_android_evidencia]]).

**Como provar (receita):** para cada alvo alcançado por Tab, recortar a imagem do elemento (+8px) FOCADO e DESFOCADO e comparar os buffers (`Buffer.compare`);
iguais = sem indicador. Rodar também com a tela em ESTADO DE ERRO (envio vazio), não só no estado inicial — o bug só existe com `error`. Controle negativo:
remover a linha do anel e ver a prova falhar em `codigo` e em `criar-conta COM erros`.

**Como evitar:** indicador de foco e indicador de erro não podem usar o MESMO canal visual (cor+largura da borda). Testar "visível", não só "focado".
