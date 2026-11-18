---
name: bug_phoneframe_ilha_sobre_print_real
description: Moldura de celular em CSS com ilha dinâmica desenhada por cima cobria texto real do print do app (ex. "Para onde vamos?", "Confirmar corrida") — causa raiz e correção aplicada em PhoneFrame.tsx (apps/site).
metadata:
  type: feedback
---

**O que aconteceu:** ao montar `PhoneFrame.tsx` (molduras de celular 100% CSS
para mostrar telas reais do app no site), desenhei uma "ilha dinâmica" (pílula
preta) absoluta no topo da tela, estilo iPhone. Lendo o CSS, parecia certo:
bezel + ilha + screenshot dentro. **Medindo no navegador** (screenshot real em
390/1280), a ilha caía exatamente em cima do cabeçalho real do print — "Para
onde vamos?", "Confirmar corrida" ficavam com um pedaço preto no meio do
texto.

**Causa raiz:** a ilha dinâmica só funciona visualmente quando o conteúdo por
trás reserva aquela faixa (barra de status transparente/escura, como nas
telas de verdade de um iPhone). Os prints do app (`docs/prints/*.jpg`) não
reservam nada — o cabeçalho do app já começa colado no topo da imagem. Uma
decoração pensada para "parecer place real" quebrou justamente por cima do
conteúdo mais real que existe na página.

**Por que não dava para só "empurrar a tela para baixo":** aumentar o
padding-top do frame para abrir espaço pra ilha mudava a proporção do bezel
(assimétrico) e ainda exigia confiar que TODO print futuro teria conteúdo
"seguro" nos primeiros ~40px — frágil pra qualquer tela nova que entrar depois
(ex. telas do Apolo/produto que eu nunca vi).

**Correção:** removida a ilha por completo. O frame ficou só bezel
arredondado + botões laterais (fora da área de tela, não tem como colidir) —
ainda lê como "celular", sem o risco. Ver `PhoneFrame.module.css`.

**Como aplicar:** qualquer moldura de dispositivo desenhada por cima de um
screenshot REAL (não maquete própria) só pode ter decoração nas bordas/fora
da área de conteúdo, nunca sobreposta ao miolo da imagem — a menos que você
controle o conteúdo da imagem e possa garantir a faixa reservada. Vale pra
qualquer projeto que vier a mostrar print de app de verdade dentro de moldura
CSS no site. Só vi isso rodando o screenshot de verdade no navegador — lendo
o CSS, o raciocínio fechava (skill `medir-antes-de-afirmar`).
