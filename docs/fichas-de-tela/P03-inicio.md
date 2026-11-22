# P03 · Início (mapa e "para onde vamos?")

| Campo | Valor |
|---|---|
| App | passageiro |
| Rota e arquivo | `/` · `apps/passenger/app/(app)/index.tsx` |
| Spec | `PASSAGEIRO.md`, P03: posição atual, busca de destino, casa/trabalho, favoritos |
| Alvo visual | `alvo_passageiro_2026-11-22.png`, recorte 813, 12, 1049, 508 ("Home") |
| Estado hoje | UI com mock; mapa ilustrativo |
| Última nota | 8 (18/11): a melhor tela do app. H1, H2, H4 e H5 continuam abertos no código |
| Depende de decisão | PP-2 (categorias saem daqui), PP-6/D-07 (banner), PP-9/D-06 (menu ou abas), 12 (indicação), 14 (agendar), 1 (Mapbox: decidido) |
| Ordem | Onda 2 |

## 1. Pergunta que a tela responde

"Para onde você vai?" Sucesso: em 1 toque a pessoa chega à busca de destino, ou, em 1 toque num atalho, já tem o destino.

## 2. Layout

Leitura da prancha: cabeçalho com ☰, o logo horizontal no centro e o sino; saudação em 2 linhas ("Olá, Juarez!" em
`subtitle` e "Para onde vamos hoje?" em `title` bold); a **pílula clara** de destino (60 pt, raio 20); 3 atalhos lado a lado
(Casa, Trabalho, Favoritos) em cartões quadrados de cerca de 86 pt com o ícone em cima; um banner (D-07: sem conteúdo até a
decisão); e, na base, o **mapa sangrando** até a borda de baixo, com o pino amarelo da posição. Sem barra de abas, sem
categorias, sem CTA amarelo: o CTA da tela **é** a pílula de destino.

```
390×844
┌──────────────────────────────┐
│ ☰         [logo 28]        🔔 │  44 pt; HomeHeader
│ ↓ 16                          │
│ Olá, {nome}!                  │  subtitle 18, textSecondary
│ Para onde vamos hoje?         │  title 22 bold, textPrimary
│ ↓ 16                          │
│ (📍 Digite seu destino      ) │  DestinationSearchBar 60 pt, searchLight, elevation.2
│ ↓ 16                          │
│ [🏠 Casa][💼 Trabalho][☆ Fav.]│  QuickAccessGrid, 3 colunas, vão 8, ~86 pt
│ ↓ 20                          │
│ [ banner: vazio até decisão ] │  (só se houver fato verdadeiro)
│ ↓ 16                          │
│ ░░░░░░ mapa ░░░░░░░░░░░░░░░░░ │  MapPreviewBackground → MapView (C-12)
│ ░░░ 📍 você está aqui ░░░░░░░ │  ≥ 200 pt; sangra até a borda e o pé
│ ░[⊕]  chip "mapa ilustrativo"░│  botão localizar 44, glassOnMap
└──────────────────────────────┘
```

- **320×568:** mapa com 168 pt (`docs/direcao-de-arte.md` §6); atalhos continuam em 3 colunas (3 × 90 cabe em 288) com o
  rótulo embaixo e **sem** subtítulo; saudação em 1 linha ("Para onde vamos?").
- **430×932:** o mapa cresce para ocupar a sobra (flex), nunca o resto da coluna.
- **Atalhos:** hoje são 4 (com "Agendar", mock) e com subtítulo de endereço (`index.tsx:16-22`). A prancha tem 3, sem
  subtítulo. "Agendar" sai (decisão 14 adiada; o design system proíbe prometer agendamento). Atalho sem endereço salvo leva a
  "Salvar Casa".

## 3. Hierarquia

| Nível | Elemento |
|---|---|
| N1 | Pílula "Digite seu destino" (o único elemento claro da tela) |
| N2 | "Para onde vamos hoje?" |
| N3 | Atalhos, mapa |
| N4 | ☰, 🔔, localizar |
| N5 | Selo do mapa ilustrativo |

Amarelo: **nenhum bloco** (a pílula clara faz o papel do CTA, `docs/direcao-de-arte.md` §2 item 3). Sinais: ícones dos 3
atalhos em `tint.yellowSoft` (PP-7), o pino da posição e o anel do avatar, se houver.

## 4. Componentes e tokens

| Elemento | Componente | Tokens |
|---|---|---|
| Moldura | `AppShell scroll glow` (o brilho fica acima do mapa; nunca sobre ele) | `gradient.screen` |
| Cabeçalho | `HomeHeader` (`apps/passenger/src/components/home/HomeHeader.tsx`), ganhando ☰ | ícones 24 `textPrimary` |
| Saudação | `GreetingRow` | `subtitle`/`title` |
| Busca | `DestinationSearchBar` | `gradient.searchLight`, `role.textOnLight`, `textOnLightMuted`, `layout.searchHeight` |
| Atalhos | `QuickAccessGrid` | `SurfaceRaised`, `radius.lg`, `tint.yellowSoft` (falta no JSON) |
| Mapa | `HomeMapPreview` + `MapPreviewBackground` → `MapView` (C-12) | `map.*`, `glassOnMap`, `elevation.2` |
| Permissão | `PermissionPrompt` (C-06) | — |

## 5. Estados

| Estado | Como aparece | Captura |
|---|---|---|
| Padrão | Com nome e localização | sim |
| Carregando | Saudação em esqueleto de 2 linhas; mapa em `block` com o tom `map.land`; a pílula **já ativa** (não espera o mapa) | `P03-carregando-*` |
| Carregando ação | n/a: as ações navegam | — |
| Vazio (sem lugares salvos) | Os atalhos mostram "Adicionar" com o ícone `Plus` e levam a salvar | `P03-sem-atalhos-*` |
| Erro (localização falhou) | Chip sobre o mapa: "Não achamos sua localização" + "Tentar de novo"; a pílula continua funcionando | `P03-erro-local-*` |
| Sem rede | `NetworkBanner`; mapa com o último quadro ou o ilustrativo; a pílula abre a P04, que mostra só os lugares salvos | sim |
| Texto longo | Nome de 30 caracteres: a saudação quebra em 2 linhas, nunca corta | sim |
| 320×568 | Ver layout | sim |
| 430×932 | Ver layout | sim |
| Fonte 200% | Atalhos viram 1 coluna de linhas (ícone ao lado); o mapa fica com 168 | aparelho |
| Teclado | n/a | — |
| Permissão negada | No lugar do mapa: cartão "Para achar você no mapa, permita a localização" + "Permitir" + "Digitar endereço"; com recusa definitiva, "Abrir ajustes" | `P03-sem-permissao-*` |
| Mock | Um selo "mapa ilustrativo" no canto de baixo do mapa, **fora** dos controles (auditoria H1) | sim |

## 6. Microinterações

- Toque na pílula: ela **cresce e vira o cabeçalho** da P04 (a transição que mais passa continuidade, `docs/movimento.md`);
  com "reduzir movimento", troca com fade.
- Atalho: escala 0,97 e vai direto para a P05 com o destino preenchido.
- Mapa: o pino da posição pulsa uma vez ao ser localizado (não em laço).
- Sem animação de entrada da tela (vista dezenas de vezes por dia).

## 7. Copy

| Chave | Texto |
|---|---|
| Saudação | Olá, {primeiro nome}! · Para onde vamos hoje? |
| Saudação sem nome | Olá! · Para onde vamos hoje? |
| Pílula | Digite seu destino |
| Atalhos | Casa · Trabalho · Favoritos · (sem endereço) "Adicionar" |
| Localizar | rótulo acessível "Centralizar no meu local" |
| Sem localização | Não achamos sua localização. · Tentar de novo |
| Pré-permissão | Para achar você no mapa, permita o acesso à localização enquanto usa o app. · Permitir · Digitar endereço |
| Selo | mapa ilustrativo |

## 8. Acessibilidade

- Ordem: menu → logo → notificações → saudação (cabeçalho) → pílula → atalhos → mapa → localizar.
- A pílula é `button` com o rótulo "Buscar destino"; com destino salvo, "Destino: {endereço}. Tocar para trocar".
- O mapa é uma imagem com a descrição da posição ("Você está em Ponta Negra"); os controles do mapa são alcançáveis por Tab
  e por leitor.
- Sino com contador: "Notificações, 2 novas".

## 9. Assets

`map/mapa-escuro-natal.jpg` (existe). Pino da marca em SVG (C-12). Nenhum carro fotorrealista (D-08).

## 10. Dados: reais × mock

| Dado | Fonte hoje | Fonte alvo | Selo |
|---|---|---|---|
| Nome | "Juliana" fixo (`index.tsx:74`) com selo "nome de exemplo" | `me()` (já existe no cliente de identidade) | não, quando real |
| Posição | "Ponta Negra" fixo (`index.tsx:75`) | `expo-location` (D1) | "mapa ilustrativo" até o D1 |
| Atalhos | endereços fixos (`index.tsx:17-19`) | lugares salvos do usuário (API, a definir) | sim, até existir |
| Notificações | 3 fixo (`index.tsx:70`) | push (D5) | **tirar o número** até existir |

## 11. Lacunas do protótipo

1. Categorias, preço e "Solicitar corrida" no início (`index.tsx:79-118`): saem para a P05 (PP-2).
2. Banner com promessas proibidas (`SafetyPromoBanner.tsx:34-45`, PP-6) e título amarelo (`:72`, H4).
3. Selo do mapa sobre o botão de localizar (`HomeMapPreview.tsx:92`, H1) e moldura legada (`:90`, H2).
4. Barra de abas com "Mensagens" sem ação e contador fabricado (`index.tsx:57-63`); a prancha não tem abas (PP-9).
5. Atalho "Agendar" (mock) e subtítulos (`index.tsx:16-22`).
6. Nome fixo em vez de `me()` (`index.tsx:74`).
7. Sem estado de permissão nem de localização.

## 12. Pedidos de componente

C-06 (`PermissionPrompt`), C-12 (mapa), C-01; `tint.yellowSoft` (PP-7).

## 13. Portão: itens próprios

- G-07b com o recorte "Home": ordem cabeçalho → saudação → pílula → 3 atalhos → banner → mapa no pé.
- Pílula com 60 ± 2 pt de altura e raio 20 (52 em < 360 de largura, se a altura apertar).
- Zero blocos amarelos.
- Mapa ≥ 200 pt em 390×844 e ≥ 168 em 320×568.
- Capturas: `passageiro/P03-{padrao,carregando,sem-atalhos,erro-local,sem-permissao,sem-rede}-{320x568,360x800,390x844,430x932}.png`.

## 14. Não conferido

Não li `GreetingRow`, `DestinationSearchBar` nem `QuickAccessGrid` linha a linha; o tamanho dos atalhos de hoje é o da
auditoria (84 a 126 pt, H6).
