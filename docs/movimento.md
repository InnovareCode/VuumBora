# Movimento e animação — o padrão do VuumBora

Requisito do dono, reforçado em 18/11/2026: **layout extremamente premium, com
efeitos e animações profissionais.**

A direção de arte (`docs/direcao-de-arte.md`) cobre o que a tela parece **parada**.
Este documento cobre o que ela faz **quando o usuário toca** — e são coisas
diferentes. Tela bonita e estática parece maquete; é o movimento que dá a
sensação de produto caro.

## O que separa animação profissional de animação amadora

Não é quantidade. É disciplina. Quatro coisas distinguem:

1. **Toda ação tem resposta imediata.** Nenhum toque fica sem retorno visual em
   menos de 100 ms, mesmo que a operação demore. Silêncio depois do toque é o
   que faz o usuário tocar de novo.
2. **A animação explica o que aconteceu.** O elemento que você tocou cresce e
   vira a próxima tela; o painel sobe de onde o dedo estava. Movimento que só
   enfeita vira ruído na terceira vez que a pessoa vê.
3. **Nada trava.** 60 quadros por segundo, sempre. Animação engasgada é pior que
   animação nenhuma — comunica app mal feito, não app sofisticado.
4. **Dá para desligar.** Quem ativa "reduzir movimento" no celular tem motivo:
   enjoo, vertigem, epilepsia fotossensível. O app respeita, trocando movimento
   por transição simples de opacidade.

## Biblioteca

**`react-native-reanimated`** (já suportada pelo Expo 58), com
`react-native-gesture-handler` onde houver gesto.

O motivo é técnico e importante: o Reanimated roda a animação na **thread de UI**,
separada da thread onde o app pensa. Com `Animated` padrão do React Native, uma
tela ocupada processando dados engasga a animação. É exatamente o que acontece
nas telas que mais importam aqui — mapa atualizando, corrida mudando de estado.

## Tempos e curvas

Duração curta parece responsivo; longa parece caro. O equilíbrio:

| Uso | Duração | Curva |
|---|---|---|
| Toque em botão, seleção de card | 120–150 ms | saída rápida |
| Abrir/fechar painel, acordeão | 200–250 ms | entrada e saída suaves |
| Transição entre telas | 280–350 ms | entrada e saída suaves |
| Aparecer elemento (fade + subida) | 200 ms | saída suave |
| Pulso contínuo (buscando motorista) | 1200–1600 ms | senoidal, em laço |
| Barra de progresso, contador | linear | linear |

Regra: **nada acima de 400 ms** numa interação direta. Acima disso o usuário
sente que esperou.

## Micro-interações, por componente

- **PrimaryButton:** ao pressionar, encolhe para 0,97 e escurece; ao soltar,
  volta com leve excesso. Em "carregando", o rótulo some e o indicador aparece
  sem o botão mudar de tamanho — botão que encolhe no meio da ação desloca o
  resto da tela.
- **Card de categoria:** ao selecionar, a borda acende e o card sobe 2 px; o
  anterior apaga ao mesmo tempo, não antes.
- **Campo de texto:** a borda muda para amarelo em 150 ms; a mensagem de erro
  entra deslizando de cima, não aparece seca.
- **Toggle online do motorista:** o botão desliza, o fundo muda de cor e o texto
  troca em sequência — nunca tudo ao mesmo tempo, que é o que parece "piscar".
- **Listas (histórico, lugares salvos):** cada item entra com atraso de 30 ms em
  relação ao anterior, até no máximo 6 itens. Depois disso, todos juntos.
- **Selo de mock:** entra com fade, nunca com movimento. Ele informa, não disputa.

## Transições entre telas

- **Home → destino:** a barra de busca cresce e vira o cabeçalho da tela de
  destino. É o movimento que mais passa sensação de continuidade.
- **Confirmação → buscando:** o cartão da corrida sobe e desbota; o pulso de
  busca nasce de onde ele estava.
- **Buscando → motorista encontrado:** a troca mais importante do app. O pulso
  colapsa no pino e o cartão do motorista sobe de baixo. Precisa ser
  perceptivelmente diferente das outras — é a notícia boa da jornada.
- **Voltar:** sempre o inverso exato da entrada. Transição assimétrica
  desorienta.

## Movimento com propósito, no mapa

- Carro do motorista anda **interpolado** entre as posições recebidas, nunca
  saltando de coordenada em coordenada.
- A câmera acompanha com suavidade e **não recentra** enquanto o usuário estiver
  arrastando o mapa.
- A rota se desenha progressivamente ao aparecer, em 400–600 ms.

## O que NÃO fazer

- Animação de entrada em tela que o usuário vê dezenas de vezes por dia. Encanta
  na primeira, irrita na décima.
- Mais de dois elementos animando ao mesmo tempo na mesma área.
- Animar sombra, `blur` ou gradiente continuamente: custa caro e derruba os 60 fps.
- Bloquear a interação enquanto a animação acontece.
- Esqueleto de carregamento piscando rápido. Pulso lento, 1,5 s.

## Como se prova

Como tudo neste projeto: **medindo**. Gravação da tela em câmera lenta para
contar quadros perdidos, e teste com "reduzir movimento" ligado no sistema,
confirmando que o app continua utilizável e nada depende só do movimento para
ser compreendido.

## Estado hoje

Existe apenas o pulso da tela de busca de motorista, que já respeita a redução
de movimento. **Todo o resto deste documento é proposta, não implementação.**
