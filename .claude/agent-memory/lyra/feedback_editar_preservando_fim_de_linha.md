---
name: feedback_editar_preservando_fim_de_linha
description: No Windows, editar arquivo do repo com Python em modo texto regrava tudo em CRLF; o repo é eol=lf mas a cópia de trabalho mistura LF e CRLF. Como editar em lote sem sujar e como conferir.
metadata:
  type: feedback
---

O repo tem `.gitattributes` com `* text=auto eol=lf`, mas a cópia de trabalho do Windows mistura arquivos LF e CRLF (`git ls-files --eol`
mostra `w/lf` ou `w/crlf`). `open(p).read()` / `open(p,'w')` em modo texto do Python converte CRLF→LF na leitura e **LF→CRLF na escrita**:
um arquivo LF vira CRLF sem ninguém pedir (o git avisa "CRLF will be replaced by LF" e a diff continua pequena, mas o arquivo muda de bytes).
O `Edit` do Claude Code preserva o fim de linha; o Python não.

**Como fazer em lote:** uma classe `Doc` que lê com `newline=''`, detecta `\r\n`, edita em LF e regrava no fim de linha ORIGINAL, com `rep(old,new)`
que falha se a contagem de ocorrências não for a esperada (evita substituição silenciosa errada). `sed -i 's/\r$//'` normaliza para LF
(não é necessário: o git normaliza no commit). Conferir com `git ls-files --eol <arquivos>`.
Vale também para `Write`: arquivo NOVO nasce LF (o certo para este repo).
