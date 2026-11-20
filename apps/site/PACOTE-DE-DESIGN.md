# Pacote de design — VuumBora, página de pré-lançamento

Escrito em 19/11/2026, antes de qualquer linha de código, pelo rito da skill
`10k-websites`. Quem pegar este documento não deve precisar de mais nada para
construir a página certa.

**Duas regras:** toda linha de texto aqui vai para a página **literalmente**, sem
reescrever. E os números de faixa são ponto de partida, validados depois rolando
a página de verdade.

## Desvio declarado

A skill constrói a jornada com **um vídeo gerado** que avança conforme a rolagem.
Aqui não há vídeo: a conta do Higgsfield zerou em três imagens, e o vídeo mais
barato custa 12,5 créditos. O dono optou por seguir assim.

Então a jornada é feita com **as três imagens**, que foram geradas de propósito
como um arco contínuo: mesmo ponto de vista de dentro do carro, mesma câmera,
mesma altura de painel, com a luz progredindo de amanhecer a entardecer. A
rolagem atravessa o dia em vez de atravessar um vídeo. Quando houver crédito, a
primeira imagem vira o quadro inicial do vídeo e a estrutura não muda.

## 1. A premissa

**O primeiro dia.** Tudo na página serve a uma ideia: entrar agora vale mais do
que entrar depois. O arco visual é um dia de trabalho inteiro ao volante, do
amanhecer à chegada, e o convite aparece no fim desse dia, quando o motorista já
viu a cidade passar. Seção que não serve a essa ideia não entra.

## 2. A paleta, amostrada das imagens

Medida nos pixels das três fotos, não escolhida de cabeça: os painéis do carro
deram `#020A15` e `#0C1820`, que confirmam o navy da marca. A luz âmbar do
amanhecer deu `#886749`.

```css
:root{
  --canvas:#0A1119;         /* fundo da página, o navy das fotos, nunca preto puro */
  --panel:#131E29;          /* cartões e superfícies elevadas */
  --accent:#FFCC00;         /* a marca: botão e ênfase rara */
  --accent-hover:#FFD84D;
  --accent-muted:rgba(255,204,0,.18);  /* bordas, brilhos, partículas */
  --ember:#886749;          /* a luz do amanhecer, para brilhos quentes */
  --text-primary:#F4F7FA;
  --text-secondary:#A8B4C2;
}
```

## 3. O trio tipográfico

- **Display: Poppins 800.** Decisão do dono em 19/11/2026, para o site ficar
  uniforme com as artes dele. Tracking negativo, `-0.045em`.
- **Corpo: Poppins 500.** Também decisão dele.
- **Rótulos: JetBrains Mono 500**, maiúsculas, tracking `+0.14em`. É o terceiro
  tipo que a skill pede, e entra só nos olhos de seção e nos números, onde dá a
  cara técnica que uma empresa de tecnologia quer.

## 4. O mapa das faixas

| Faixa | Trecho da rolagem | Imagem | Texto (literal) | Entrada |
|---|---|---|---|---|
| 1 | 0.00 a 0.30 | amanhecer | **Quem entra agora, entra no começo.** / A VuumBora está chegando a Natal e à Grande Natal. O cadastro de motorista abre antes do aplicativo. | Subida curta com desfoque saindo |
| 2 | 0.34 a 0.64 | dia | **A cidade roda o dia inteiro.** / Taxa menor e repasse mais rápido para quem passa o dia no volante. | Deslize lateral curto, no sentido da ponte |
| 3 | 0.68 a 1.00 | entardecer | **No fim do dia, o que importa é o que sobrou.** / É por isso que a taxa pesa tanto. | Repouso: só opacidade, sem movimento |

## 5. O bloco do topo estático

Para celular e para quem pede menos movimento:

- Olho: `PRÉ-LANÇAMENTO · NATAL E GRANDE NATAL`
- Título: **Quem entra agora, entra no começo.**
- Apoio: A VuumBora está chegando a Natal e à Grande Natal. O cadastro de
  motorista abre antes do aplicativo.
- Botão: **Quero me candidatar**

## 6. O que vem depois da jornada

Tudo funila para **uma** ação: a candidatura de motorista.

**Os quatro motivos** (cartões, sem foto, com rótulo em mono)
1. `TAXA` — **Taxa menor.** O que fica com quem dirige é o que decide se vale a
   pena. A VuumBora começa por aí.
2. `REPASSE` — **Repasse mais rápido.** Receber rápido é o que paga a conta no
   fim da semana.
3. `AQUI` — **Suporte daqui.** Quem atende conhece a cidade onde você roda.
4. `ESCOLHA` — **Motorista mulher.** O passageiro poderá escolher essa opção ao
   pedir a corrida.

**O compromisso público** (faixa com borda, texto já aprovado pelo dono)
As regras de taxa da plataforma e de repasse ao motorista serão publicadas antes
de o cadastro de motoristas ser aberto.

**As perguntas que o motorista faz de verdade**
- *Quando começa?* Ainda não temos data. Quem está na lista fica sabendo antes.
- *Preciso pagar alguma coisa?* Não. A candidatura é gratuita e não existe taxa
  de inscrição.
- *Qualquer um entra?* Não. Cada candidatura é avaliada antes de virar vaga.
- *Que documentos preciso mandar agora?* Nenhum. Nesta etapa pedimos só contato
  e cidade. Documento e endereço só depois da aprovação.
- *Vocês vendem meus dados?* Não. Os dados servem para avaliar a candidatura e
  avisar o resultado. Nada além disso.

**O momento interativo:** uma barra de taxa que o visitante arrasta para ver
quanto sobra de uma corrida. Sem número inventado: a barra mostra a conta, e o
texto diz que a taxa real da VuumBora será publicada antes da abertura.

**O formulário** (a ação única)
- Rótulos: Nome completo · Telefone (WhatsApp) · E-mail · Cidade onde dirige · UF
- Opcionais: Já dirige por aplicativo? · Tem veículo próprio?
- Botão: **Enviar candidatura**
- Sucesso: **Candidatura recebida.** A gente avalia e responde no WhatsApp que
  você informou.
- Aviso: Usamos nome, telefone, e-mail, cidade e UF só para avaliar sua
  candidatura e avisar o resultado. Controlado por Innovare Code (CNPJ
  09.813.446/0001-00). Não vendemos nem repassamos seus dados a ninguém. Para
  remover seus dados, escreva para contato@vuumbora.com.br.
- **Destino do envio:** o mesmo endpoint que já está em produção,
  `POST /v1/driver-applications`. Não é formulário de demonstração: a
  candidatura entra no banco de verdade. Quando a variável do endereço da API
  não estiver configurada, o formulário mostra o aviso honesto em vez de fingir
  que enviou.

**Rodapé:** VuumBora, mobilidade urbana. Desenvolvido por Innovare Code, CNPJ
09.813.446/0001-00. Contato contato@vuumbora.com.br. WhatsApp (84) 3113-2584 e
Instagram @vuumbora.oficial. A marca é real, então não existe aviso de marca
fictícia. As fotos são geradas por computador e serão trocadas por fotos reais
depois, decisão do dono em 19/11/2026.

## 7. A camada vetorial

- Uma linha de rota em SVG que se desenha sozinha ao rolar, acompanhando a
  lateral da página: é o mesmo gesto do pino da marca, agora como fio condutor.
- Partículas de poeira quentes, em `--ember`, no nível de sussurro, só sobre a
  faixa do amanhecer.
- Divisores finos em `--accent-muted` entre as seções, nunca linha cinza padrão.
- Tudo isso respeita quem pede menos movimento: o estado final aparece, o motor
  para.

### Os ícones são um conjunto, não uma coleção

Desenhados aqui, nunca de biblioteca e nunca gerados como imagem. São SVG
porque o navegador desenha o traço na hora: nítido em qualquer tela, 2 KB
para os seis, e a cor acompanha o `currentColor` (é o que permite o ícone
ficar amarelo no hover sem virar um segundo arquivo).

A regra que mantém o conjunto coerente, estabelecida em 20/11/2026:

> **O traço tem 1,6px NA TELA. Sempre.**

Não é o `stroke-width` que se repete — é a espessura que o olho vê. Como o
`stroke-width` vale dentro de um `viewBox` de 24, cada tamanho exige um
valor diferente:

| Onde | Tamanho na tela | `stroke-width` |
|---|---|---|
| Ícone de categoria | 22px | **1.75** |
| Seta do carrossel | 20px | **1.92** |
| Ícone do rodapé | 16px | **2.4** |

A conta é `1.6 ÷ (tamanho ÷ 24)`. Antes dessa regra, os ícones do rodapé
tinham 1,07px na tela, **33% mais finos** que os das categorias — e ninguém
percebe isso olhando um ícone de cada vez, só comparando a página inteira.

Mais duas regras do conjunto:

- **Grade fixa:** conteúdo entre 3 e 21 do `viewBox` de 24, com margem
  óptica de 3. Terminais e junções sempre redondos, raios generosos — é a
  linguagem do pino da marca, que não tem canto vivo nem linha fina.
- **Nenhum ícone nasce amarelo.** Seis marcas amarelas iguais viram enfeite,
  que é o erro apontado na seção 6. O amarelo entra no hover, como sinal de
  interação, e some no toque.

Para julgar um ícone novo: renderize os seis **lado a lado em tamanho real**.
Ampliado e sozinho, qualquer desenho parece bom — o ícone de Conforto levou
três tentativas (poltrona lia como impressora, assento lia como pote de
creme) e só a fileira revelou isso.

## 8. A lista de engenharia

HTML, CSS e JavaScript puro. Um `index.html` e uma pasta `assets`. Sem framework,
sem passo de build, sem npm. As imagens entram por `<picture>` com as duas
larguras já geradas (1920 e 960). A página precisa ficar bonita e completa mesmo
se nenhuma imagem carregar. Toda troca de faixa escreve no DOM só quando muda, e
a rolagem roda num laço que descansa. Texto sobre foto ganha véu local, sombra
real, e o contraste é conferido contra o pior quadro, nunca contra a média.

## 9. O portão do texto

Toda linha acima vai para a página literalmente. Antes de qualquer pessoa ver, a
página passa pela busca por travessão e pelas palavras de encher linguiça
(alavancar, soluções, robusto, empoderar, experiência completa). Zero ocorrência
das duas, no arquivo inteiro, incluindo as perguntas e o rodapé.
