# Responsividade — o alvo do VuumBora

Requisito dado pelo dono em 18/11/2026: **as telas têm que funcionar em celular
de verdade, não em um tamanho só.**

Até aqui a equipe media 360, 390 e 420. É pouco: cobre o meio da faixa e deixa de
fora justamente os aparelhos onde as coisas quebram.

## A faixa que precisa funcionar

| Largura | Quem é | Por que importa |
|---|---|---|
| **320 pt** | iPhone SE (1ª geração), Androids de entrada antigos | O pior caso. Se passa aqui, passa em tudo |
| **360 pt** | Android mais comum no Brasil (Galaxy, Moto) | A maior fatia real de usuários |
| **375 pt** | iPhone SE 2/3, iPhone 8 | Ainda muito presente |
| **390–393 pt** | iPhone 12/13/14, Pixel | O padrão atual |
| **430 pt** | iPhone Pro Max | Onde o layout "sobra" e pode ficar esticado |
| **≥ 600 pt** | Tablet, dobrável aberto | Não é alvo de entrega, mas não pode quebrar feio |

## O que mais muda, além da largura

Largura é só a metade do problema. Também precisa aguentar:

1. **Altura curta.** O iPhone SE tem 568 pt de altura. Conteúdo que cabe num
   iPhone 15 pode exigir rolagem lá — e CTA fixo não pode cobrir informação.
2. **Escala de fonte do sistema.** O usuário pode aumentar o texto até cerca de
   200% nas configurações do celular. Isso é acessibilidade, não capricho:
   quem tem baixa visão usa. Layout com altura fixa quebra aqui.
3. **Safe area.** Notch, ilha dinâmica, barra de gestos. Conteúdo não pode
   nascer debaixo do recorte nem terminar debaixo da barra de navegação.
4. **Teclado aberto.** Nas telas com campo (destino, login, cadastro), o teclado
   come metade da tela. O campo em foco precisa continuar visível.
5. **Orientação.** Se o app travar em retrato, isso é decisão explícita, não
   esquecimento — e a tela de navegação do motorista é a candidata natural a
   aceitar paisagem.

## Como se prova

Medindo no navegador com viewport emulado, elemento por elemento — nunca
estimando pelo código, nunca por `document.scrollWidth`, que não enxerga
overflow dentro de um `ScrollView` do React Native Web.

Critérios de aprovação, em cada largura da tabela:

- nenhum elemento ultrapassa a viewport;
- nenhum texto que carrega informação aparece truncado;
- todo alvo de toque mede ao menos 44 × 44;
- nada essencial fica coberto por barra fixa ou CTA.

E, com a escala de fonte em 200%: nada de texto sobreposto, cortado na vertical
ou empurrado para fora do card.

## Dívida conhecida

As telas entregues até 18/11/2026 foram medidas em 360/390/420 apenas. Elas
**não foram verificadas** em 320 pt, em altura curta, com fonte ampliada nem com
teclado aberto. Isso precisa de uma auditoria antes de considerarmos o protótipo
do passageiro fechado.
