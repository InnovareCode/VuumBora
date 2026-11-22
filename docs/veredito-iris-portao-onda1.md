# Veredito da Íris — Portão de qualidade, onda 1 do padrão premium (telas de entrada)

**VEREDITO: APROVADO.**

**Candidata:** `main` (`4ae190b`) + merge de `fatia/f09-onda1-passageiro` (`47ef082`) + merge de
`fatia/f09-onda1-motorista` (`2ba6e2c`). Montada em cópia limpa fora do repositório (`git clone` local + `npm ci`,
Node 26.12.1), os dois merges entraram **sem nenhum conflito** (`git merge --no-edit` limpo nos dois). Confirmado por
`git diff --stat` que nenhuma das duas fatias toca `packages/` (zero risco de integração entre elas além do próprio
merge) nem `apps/admin/` — o escopo ficou exatamente onde deveria.

Telas no escopo: **P01** (boas-vindas), **P02a** (login), **P02b** (cadastro), **P02c/d/e** (código, esqueci senha,
redefinir senha — sem captura automática, medidas à mão), **M01** (entrar) e **M02** (criar conta).

## Como medi

- `npm run check:boundaries` e `npm run typecheck` limpos na candidata. O único erro de typecheck
  (`mapbox-check.web.tsx`, `TS2882` em `mapbox-gl/dist/mapbox-gl.css`) é **pré-existente**: reproduzi em `main` puro
  (`4ae190b`, antes de qualquer fatia) e o erro é idêntico — não é regressão desta onda.
- `tools/qualidade-tela` com o Metro vivo (a ferramenta já sobe e derruba o próprio `expo start --web` com
  `dev-server.mjs`, fixado pelo Vulcano na F09 onda 0a — não é o workaround manual antigo que eu tinha registrado
  como "nunca com CI=1"; aqui o `CI=1` é interno à ferramenta e já testado por ela). Portas próprias, todas acima de
  8500 (8503–8511), isoladas das portas 5470–5489/4600+ da Íris do painel admin em paralelo.
- **Linha de base própria, não a `.baseline/` compartilhada do repositório real:** cloning separado de `main` puro
  (`4ae190b`, que já tem a onda 0 aprovada) e captura das mesmas 5 telas × 2 estados × 4 tamanhos = 40 PNGs, promovida
  a linha de base isolada (`QUALIDADE_TELA_BASELINE_DIR` próprio). Isso evita qualquer disputa com a `.saida`/
  `.baseline` do repositório real enquanto outra sessão (painel admin) possa estar usando a ferramenta, e me dá uma
  base "antes da onda 1" confiável e sem bug conhecido (ao contrário da onda 0, aqui a base NÃO tinha bug pendente —
  lição [[feedback-comparador-pixel-contra-baseline-com-bug]] não se aplica da mesma forma, mas apliquei a mesma
  disciplina: abri toda captura "reprovada" pelo comparador a olho antes de concluir).
- Comparador de pixel: **40 capturas, 10 aprovadas, 30 "reprovadas"** pelo `ratio` cru. Abri as 30 a olho: **nenhuma é
  regressão** — são mudanças visuais pretendidas desta onda (logo removido de P02c/d/e e do `AuthHeader` do
  cadastro, `glow` novo no topo, redesenho de `AuthHeader`/`FooterActions` do motorista). Detalhe por tela abaixo.
- As 5 sondas do §14.3 (estilo, geometria, texto, contraste, foco) + ativação de links por teclado, nas 40
  combinações da candidata, e nas mesmas telas/tamanhos da linha de base "antes" (para separar achado novo de
  achado antigo).
- G-07b (lado a lado com a prancha de 22/11) gerado e preenchido para as 5 telas com recorte.
- P02c (código) e P02d/e (esqueci/redefinir senha) não têm captura automática (fora de `screens.config.mjs`) — medi
  à mão com um script Playwright descartável que dirige o fluxo real (cadastro → código; esqueci-senha →
  redefinir-senha) contra o Metro vivo, em 320×568 e 390×844, com a MESMA lógica de geometria da sonda oficial
  (G-09 só horizontal; G-11 como indício pelo maior botão) — evitei o erro de marcar rolagem vertical normal de
  `ScrollView` como "fora da viewport".
- Keyboard aberto em M02 (pedido do Atlas): tentei simular encolhendo a viewport de 568 para 320px de altura DEPOIS
  de focar o campo Senha (aproximação do que um teclado físico faz no visual viewport). Resultado e ressalva na
  seção própria abaixo.
- Nada criado nesta rodada ficou no repositório real nem em `tools/qualidade-tela/.saida`/`.baseline` compartilhados:
  tudo rodou em clones e saídas isoladas no meu scratchpad, apagados ao final.

## Nota por tela (antes = veredito da onda 0 sobre `a03961e`; depois = esta rodada)

| Tela | Antes | Depois | O que mudou | Regressão? |
|---|---|---|---|---|
| P01 boas-vindas | 7 | **8** | `accessibilityRole="header"` no título (lacuna 3 da ficha, resolvida); `Cadastrar` com `size="prominent"` (lacuna 1, botões com a mesma altura); `content:{minHeight:480}` fora de token removido (lacuna 5) — o comentário do código cita a correção do `AppShell.scrollFill` (onda 0) como motivo de ser seguro tirar o número fixo | Não. 0 sobreposição, 0 alvo pequeno, 0 texto truncado nas 4 larguras; o único `ultrapassaViewport` (320/360) é os mesmos 4px à esquerda já documentados como pré-existentes desde a passada anterior |
| P02a login | 7 | **8** | `AppShell glow` (lacuna 1 da ficha P02, "sem brilho de topo", resolvida). Nenhuma outra mudança de conteúdo | Não. `ratio=0` em todos os tamanhos (o `glow` é sutil o bastante para ficar abaixo do limiar de 10%/canal do comparador — confirmado visualmente, não é falha da ferramenta) |
| P02b cadastro | 6 | **7** | `showLogo={false}` no `AuthHeader` (lacuna 4 da ficha, "a prancha não tem logo em Criar conta" — recomendação seguida à risca); `AppShell glow` (lacuna 1). Os "botões sociais legados" citados no veredito da onda 0 **não existem mais no código** (confirmado também em `main` puro: já tinham sido removidos antes desta onda, não é crédito desta fatia) | Não, mas **G-11 continua quebrado em 320/360/390×*** (CTA só visível sem rolar em 430×932) — já era assim antes (pré-onda1 o CTA ficava ainda mais longe, até 140px pior), a remoção do logo melhorou a margem mas não fechou a lacuna. Mesma lacuna já registrada na ficha (§12, pede `FooterActions`), não lhe foi aplicada nesta fatia |
| M01 entrar | 7 (linha de base própria da Lyra/onda0, nunca tinha os bugs do logo/seta) | **8** | Título "Entrar"→"Acesse sua conta" (copy da ficha), alinhado à esquerda; "Esqueci minha senha" movido para depois do CTA (posição da prancha); `AuthHeader` ganhou lockup responsivo (`sm`<640pt alt., `md` acima — a ficha pede "lockup md 240" em tela alta, antes era sempre `sm`); `AppShell glow` | Não. 0 sobreposição, 0 overflow, 0 alvo pequeno nas 4 larguras; CTA visível sem rolar nas 4 |
| M02 criar conta | 6 | **8** | `logoVariant="selo"` (fecha o item que a onda 0 deixou pendente: "ficha pede selo, código usa lockup"); CTA + alerta + resumo + rodapé movidos para dentro de `FooterActions` (primeiro uso real do componente) — G-11 que estava quebrado (CTA só depois de rolar o formulário inteiro em 320×568) **fechado nas 4 larguras**; título "Criar conta"→"Criar sua conta"; `AppShell glow` | Não. 0 sobreposição, 0 overflow, 0 alvo pequeno nas 4 larguras. Pendências que sobram são **confirmadas pré-existentes, idênticas às de antes** (ver seção própria) |

Todas as 5 telas tocadas ficam com nota ≥ 7 — meta batida.

## Os dois achados do Atlas, verificados

**1) `FooterActions` do M02 com o teclado "aberto" em 320×568.** Simulei encolhendo a viewport de 568 para 320px de
altura depois de focar o campo Senha (Playwright não tem teclado virtual real; isso aproxima o efeito no *visual
viewport*). Resultado: o `FooterActions` e o CTA continuam dentro da nova viewport (`footerVisivel`/`submitVisivel`
= true), mas o **campo Senha em foco fica coberto pelo rodapé fixo** (a captura mostra o rótulo "Senha" visível e o
campo escondido atrás do botão "Criar conta"). **Ressalva importante antes de tratar isto como bug:** o comportamento
que deveria evitar isso (`automaticallyAdjustKeyboardInsets` no iOS, `adjustResize` no Android — comentário do
próprio `AppShell.tsx:93-95`) é **nativo**, não existe no React Native Web — a Web não tem como reagir ao "teclado"
porque não há teclado de verdade, só uma viewport menor. Ou seja, meu teste mede exatamente o cenário que a própria
ficha já marca como "aparelho" (fora do alcance desta ferramenta) e que Lyra já tinha registrado como não medido. Não
é evidência de bug real em iOS/Android — é a mesma lacuna de sempre, agora com uma tentativa de aproximação que
confirma por que só um aparelho/emulador resolve a dúvida. Registrando como pendência, não como reprovação.

**2) Contraste do ícone "i" do `RegistrationNotice`/`InlineAlert` (M02).** Medido pela sonda oficial, não só por
leitura de código: o elemento reprovado é o **glifo "i" em si** — um nó de **texto literal** (`<Text>{visual.glyph}</Text>`
em `InlineAlert.tsx:75`, não uma borda nem um retângulo de fundo), cor `theme.role.info` contra o fundo composto do
aviso (`withAlpha(role.borderControl, 0.1)` sobre o fundo sólido mais próximo). Razão medida: **1,92:1**. Como é texto
(não ícone vetorial/SVG), o limiar que vale é o de **texto normal — 4,5:1** (não o de não-texto, 3:1): o glifo usa
`glyphStyle(bold, 'body')` = 16px/700, e "texto grande" exigiria 24px ou (negrito E ≥18,66px) — 16px bold fica abaixo
disso, então não se qualifica para o limiar mais frouxo. É **texto informativo**, não decorativo: ele reforça o tom do
aviso por cor+forma (comentário do próprio componente, `InlineAlert.tsx:3`, "cor nunca é o único sinal: cada tom tem
glifo próprio"), não está marcado como oculto para leitor de tela, e carrega significado (mesmo redundante com o
título/corpo do aviso ao lado). **Confirmado pré-existente, não desta fatia:** rodei a mesma sonda em `main` puro
(antes da onda 1) e o resultado é idêntico (`razao:1.92`, mesmo seletor) — o Lyra já tinha apontado a causa raiz
(`role.info` em `packages/tokens`, fora da fronteira dela nesta fatia) no handoff dela. Não bloqueia esta onda (não é
regressão), mas seria um bom próximo alvo de quem mexe em tokens de cor.

## G-07b — tabela de 8 linhas por tela

### P01 (boas-vindas)
| # | Critério | Confere/diverge | Motivo |
|---|---|---|---|
| 1 | ordem dos blocos | confere | logo → foto → título → promessa → CTA → secundário → aviso legal, nos dois |
| 2 | qtd./posição de cartões | confere (n/a) | tela sem cartões nos dois lados |
| 3 | proporção dos cartões | n/a | idem |
| 4 | posição/largura do CTA | confere | largura total, mesma posição relativa após a promessa |
| 5 | ícones | confere | só o logo em ambos, mesma posição |
| 6 | barra inferior | confere | nenhuma nos dois |
| 7 | contagem de amarelo | confere | 1 bloco (Entrar) + "VuumBora!" no título, igual à prancha |
| 8 | ilustração/mapa | confere | foto noturna ocupando o terço de cima, scrim e proporção equivalentes |

### P02a (login)
| # | Critério | Confere/diverge | Motivo |
|---|---|---|---|
| 1 | ordem dos blocos | confere | voltar → logo → título → subtítulo → campos → ações → rodapé |
| 2 | qtd./posição de cartões | n/a | campos de formulário, não cartões |
| 3 | proporção dos cartões | n/a | idem |
| 4 | posição/largura do CTA | confere | largura total, logo após os campos |
| 5 | ícones | diverge | a prancha usada (recorte "Criar conta") mostra ícones de cadastro (nome/celular); P02a herda esse recorte só pelo estilo de coluna — a própria ficha P02 (§2) documenta essa herança como esperada, não como alvo literal de conteúdo |
| 6 | barra inferior | confere | nenhuma nos dois |
| 7 | contagem de amarelo | confere | 1 bloco (Entrar); "Esqueci minha senha"/"Cadastre-se" são sinais permitidos (`LinkButton`) |
| 8 | ilustração/mapa | n/a | sem imagem nesta tela |

### P02b (cadastro)
| # | Critério | Confere/diverge | Motivo |
|---|---|---|---|
| 1 | ordem dos blocos | confere | voltar → título → subtítulo → aviso/campos → aceites → CTA → rodapé, sem logo (como a ficha recomenda) |
| 2 | qtd./posição de cartões | n/a | campos de formulário |
| 3 | proporção dos cartões | n/a | idem |
| 4 | posição/largura do CTA | confere | mesma posição relativa no fluxo (logo após os aceites), largura total — a tela precisa rolar mais que a prancha porque tem mais itens (selo de termos provisórios, 2 links "Ler..."), não porque o CTA mudou de lugar |
| 5 | ícones | confere | usuário/e-mail/celular/calendário/cadeado, mesmos da prancha |
| 6 | barra inferior | confere | nenhuma nos dois |
| 7 | contagem de amarelo | confere | 1 bloco (CTA); link "Ler os Termos de Uso" sublinhado é sinal permitido |
| 8 | ilustração/mapa | n/a | sem imagem |

### M01 (entrar)
| # | Critério | Confere/diverge | Motivo |
|---|---|---|---|
| 1 | ordem dos blocos | confere | lockup → título (esquerda) → campos → CTA → "Esqueci" → rodapé, igual à prancha |
| 2 | qtd./posição de cartões | n/a | campos de formulário |
| 3 | proporção dos cartões | n/a | idem |
| 4 | posição/largura do CTA | confere | largura total, mesma posição |
| 5 | ícones | diverge | prancha mostra botão social (Google); oculto no candidato (D-01, decisão já registrada, não desta fatia) |
| 6 | barra inferior | confere | nenhuma nos dois |
| 7 | contagem de amarelo | confere | 1 bloco (Entrar); "Esqueci"/"Criar conta" são sinais permitidos |
| 8 | ilustração/mapa | n/a | sem imagem |

### M02 (criar conta)
| # | Critério | Confere/diverge | Motivo |
|---|---|---|---|
| 1 | ordem dos blocos | confere | voltar → selo → título → subtítulo → [aviso] → campos → aceites → CTA → rodapé |
| 2 | qtd./posição de cartões | diverge | 1 bloco a mais que a prancha: `RegistrationNotice` — a própria ficha M02 (§2) manda MANTER esse bloco mesmo sem equivalente na prancha (compromisso público "conta ≠ cadastro") |
| 3 | proporção dos cartões | confere | campos de 44–56pt, dentro da tolerância |
| 4 | posição/largura do CTA | confere | largura total, agora fixo no rodapé (`FooterActions`), sempre alcançável |
| 5 | ícones | confere | usuário/e-mail/celular/calendário/cadeado, iguais à prancha; logo agora é o selo pequeno (não o lockup grande) |
| 6 | barra inferior | confere | nenhuma nos dois |
| 7 | contagem de amarelo | confere | 1 bloco (CTA) |
| 8 | ilustração/mapa | n/a | sem imagem |

## P02c/d/e — medidas à mão (sem captura automática)

Fluxo real dirigido (cadastro → código; esqueci-senha → redefinir-senha), 320×568 e 390×844, Metro vivo:

| Tela | 320×568 — CTA visível sem rolar? | 390×844 | Observação |
|---|---|---|---|
| P02c (código) | **Sim** (antes da onda 1: não — `bottom=615` vs. viewport 568) | Sim | A remoção do logo (`showLogo=false`) resolve um G-11 que **já estava quebrado antes desta onda** — ganho não documentado nas fichas, mas real e medido |
| P02d (esqueci senha) | Sim (já cabia antes também) | Sim | Sem mudança de conteúdo, só `glow` |
| P02e (redefinir senha) | **Sim** (antes: não — `bottom=658`) | Sim | Mesmo ganho do P02c, mesma causa |

Nenhum overflow horizontal, nenhuma sobreposição visível nas capturas (320 e 390), "Mostrar" fora do amarelo nas
três. Isto **não é regressão** em nenhuma leitura — é melhora líquida de um problema que já existia.

## O que sobra como pendência (não bloqueia esta onda)

1. **G-11 do P02b continua quebrado em 320/360/390×*** (só cabe sem rolar em 430×932) — pré-existente, melhorou a
   margem mas não fechou; a ficha já pede `FooterActions` para esta tela (§12), que não entrou nesta fatia.
2. **Contraste do ícone "i" (M02), 1,92:1** — pré-existente, raiz em `role.info` (`packages/tokens`), fora da
   fronteira desta onda (confirmado pela sonda oficial, não só leitura de código).
3. **Teclado aberto em M02 (simulação)**: o campo em foco fica coberto pelo `FooterActions` quando a viewport
   encolhe — mas é uma limitação de a Web não ter o comportamento nativo (`automaticallyAdjustKeyboardInsets`/
   `adjustResize`) que o próprio componente já prevê para nativo. Só um aparelho/emulador resolve a dúvida de
   verdade.
4. `possivelLegado`/`corForaDoConjunto` nas caixas do `LegalConsentFields` (checkbox nativo) — idêntico ao
   registrado na onda 0, não tocado por esta fatia.
5. "Sem indicador de foco" em inputs/botões embutidos em formulário real (contagem varia por tamanho/tela) —
   padrão já documentado pela Lyra como diferença entre catálogo isolado e tela real; não investigado a fundo.

## Aprendizado para a memória

- `tools/qualidade-tela` está mesmo consertado (Vulcano, F09 onda 0a): `expo start --web` com `CI=1` **interno à
  ferramenta** funciona bem — isto é diferente do workaround manual que eu tinha registrado como "nunca `CI=1`"
  (aquele era eu rodando `expo start --web` fora da ferramenta, herdando `CI=1` do shell sem querer). Não confundir
  os dois cenários nas próximas rodadas.
- G-09/G-11 em telas com `AppShell scroll`: rolagem vertical é normal (RN Web) e NÃO é "fora da viewport" — só
  overflow horizontal conta para G-09; G-11 é indício pelo maior botão/CTA, com `visivelSemRolar` calculado contra a
  viewport, não contra `scrollHeight`. Usei a mesma lógica da sonda oficial no script manual do P02c/d/e para não
  reportar falso positivo.
- Teclado aberto não é simulável de verdade em RN Web (sem comportamento nativo de inset) — encolher a viewport dá
  uma aproximação útil para achar colisões óbvias, mas um resultado "ruim" nessa simulação não prova bug em
  aparelho real, porque a correção nativa nem existe no código que a Web roda.

Ver também [[project-portao-onda0-brandlogo-regressao]] e [[feedback-ferramenta-qualidade-tela-export-quebrado]].
