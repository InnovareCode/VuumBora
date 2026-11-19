---
name: bug_align_items_center_vao_vazio_colunas_desiguais
description: Linha flex com duas colunas de altura MUITO diferente (ex. imagem 16:9 curta ao lado de formulário longo) — align-items:center ou stretch+center no item curto cria um vão vazio grande acima E abaixo dele, pior do que deixar flex-start. Use ao montar hero/layout de duas colunas com imagem fixa + conteúdo variável.
metadata:
  type: bug
---

**Sintoma:** no Hero do site (`apps/site`, `ArtworkPanel` 16:9 ao lado do
`DriverApplicationForm`, bem mais alto por ter 5 campos + 2 grupos de rádio +
aviso), com `align-items: center` na linha flex a imagem ficava visualmente
"flutuando" no meio de uma área escura, com um vão vazio grande ACIMA e outro
ABAIXO dela — pior que o problema original (que era só vão embaixo).

**Causa raiz:** quando os dois itens de uma linha flex têm alturas muito
diferentes, centralizar o item mais curto não "resolve" o espaço sobrando —
só redistribui a mesma área vazia para cima e para baixo, tornando o item
curto menos ancorado visualmente (sem alinhar com nada: nem com o topo do
texto ao lado, nem com nenhuma borda). `align-self: stretch` + `display:flex;
align-items:center` no item curto (pra "centralizar dentro da própria coluna
esticada") tem o mesmo resultado — só confirma visualmente que a média
matemática não é a resposta certa para um problema de proporção.

**Correção:** voltar para `align-items: flex-start` na linha — a imagem fica
alinhada ao TOPO do formulário (mesma linha de base que o resto do layout,
olho alinhado com o campo "Nome completo"), e o vão vazio sobra só embaixo
da imagem, dentro da própria coluna dela. É um hero assimétrico normal, não
um bug — medido e comparado visualmente (screenshot antes/depois) antes de
decidir, não só por dedução de CSS (ver `medir-antes-de-afirmar`).

**Quando reconsiderar:** só vale esticar a imagem para preencher a coluna
inteira (`height:100%` + `object-fit:cover`) se a imagem NÃO tiver texto
baked-in que dependa de enquadramento preciso — nesta arte (texto na faixa
navy à esquerda) esticar cortaria/distorceria o texto, então nem foi opção.
Ver [[project_site_nextjs_static_export]] (seção "reconstrução sobre as
artes").
