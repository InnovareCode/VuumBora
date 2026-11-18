# Conflitos entre a diretriz de refatoração e o que já foi aprovado

Em 18/11/2026 o dono passou uma diretriz de refatoração visual ("Prompt mestre —
VuumBora Premium UI/UX"). Ela é clara e a equipe vai segui-la.

Mas ela própria manda: *"Se houver conflito entre referências aprovadas,
identifique-o antes de alterar a identidade."* São três conflitos reais, e
**nenhum deles vai ser resolvido por minha conta** — todos mexem em coisa que o
dono já aprovou explicitamente nesta mesma sessão.

---

## Conflito 1 — Tipografia: Inter ou Plus Jakarta Sans?

**A diretriz diz:** *"Utilize preferencialmente Inter."*

**O que já foi decidido:** o dono escolheu **Plus Jakarta Sans** depois de
comparar quatro candidatas lado a lado, em amostra renderizada com os textos
reais do produto. A Inter foi analisada e **descartada com motivo**: passa nos
critérios, mas é genérica e pesa 1,3 MB nos quatro pesos, contra 377 KB da
Jakarta. Está em `docs/tipografia.md`.

A fonte já está instalada, com `tabular-nums` provado no DOM, e aplicada em
todos os componentes.

**Hipótese:** a palavra "preferencialmente" sugere que a Inter era um padrão
razoável do prompt, escrito antes de a escolha existir — não uma reversão
deliberada.

**Recomendação:** manter a **Plus Jakarta Sans**. Trocar agora significa
refazer a medição de largura de toda tela, porque a métrica muda.

## Conflito 2 — Paleta: a do prompt ou a medida na logomarca?

**A diretriz traz** `#172438` para superfícies, `#FFD600` como amarelo de
destaque, `#F5A400` como laranja e `#AAB5C5` para texto secundário.

**O que já foi decidido:** a paleta atual foi **medida pixel a pixel na
logomarca** (System.Drawing + CIEDE2000), validada em WCAG AA par a par, e
aprovada pelo dono. Está em `docs/identidade-visual.md`.

Divergências concretas:

| Uso | Diretriz | Aprovado | Observação |
|---|---|---|---|
| Superfície elevada | `#172438` | `#192536` | Diferença imperceptível |
| Amarelo destaque | `#FFD600` | `#FFCC00` | Imperceptível (ΔE < 2) |
| Laranja | `#F5A400` | `#FEA101` | O `#F5A400` foi **medido e rejeitado**: é mais avermelhado que o âmbar real do logo |
| Texto secundário | `#AAB5C5` | `#B9C4D2` | O aprovado tem contraste melhor |

**Recomendação:** manter a paleta medida. As diferenças são pequenas demais para
serem percebidas, e duas delas **pioram** o que já foi corrigido. Se a diretriz
for intencional, a equipe troca — mas aí refazemos a tabela de contraste.

## Conflito 3 — Marcadores de demonstração: o mais importante dos três

**A diretriz diz:** *"Não exiba dados fictícios, marcadores de demonstração ou
mensagens de debug na interface destinada ao usuário."*

**O que já foi decidido:** o `DESIGN_SYSTEM_MESTRE.md`, do próprio pacote do
dono, manda o contrário — *"Não prometer suporte 24h, motorista verificado,
cupom de 10% como recursos já entregues"* e *"Diferenciar implementado, mockado
e pendente"*. Foi por isso que o `MockBadge` existe.

**A contradição não é de estilo, é de fato:** hoje **não existe backend**. Preço,
ETA, nome, promoção e busca de motorista são todos fabricados. As duas regras
juntas pedem o impossível: nem exibir dado fabricado marcado, nem exibir dado
fabricado sem marcar — restaria não exibir nada, e aí não há tela.

**As saídas possíveis:**

1. **Manter os selos** enquanto for protótipo e removê-los quando o backend
   chegar. Honesto, mas polui a tela e foge do acabamento premium pedido.
2. **Trocar os selos por um indicador único e discreto** — uma faixa ou marca
   d'água de "versão de demonstração" no app, em vez de um selo por dado. A tela
   fica limpa, e continua claro que nada ali é real. **É a minha recomendação.**
3. **Remover tudo**, sem nenhuma marcação. Só aceitável se o app jamais for
   mostrado a terceiros antes do backend — porque preço falso sem aviso vira
   expectativa, e, se chegar a um usuário, vira problema.

**Risco concreto da opção 3:** qualquer pessoa que veja a tela pensa que o app
calcula preço, tem motoristas verificados e dá 10% de desconto. Nenhuma das três
coisas existe.

---

## O que NÃO é conflito, e já está sendo feito

A diretriz também pede coisas que a equipe já adotou: tokens centralizados sem
HEX espalhado (garantido por `check:boundaries`, que quebra o build), ícones
vetoriais em vez de emoji (Lucide), responsividade real (320 a 430pt, medida no
navegador), safe areas, estados de carregamento, erro e vazio, e a proibição de
declarar fidelidade sem comparar screenshot — que é exatamente o método que a
equipe usa desde o começo.

**Sobre o mapa:** a diretriz proíbe mapa desenhado com linhas — e tem razão. Mas
mapa real exige o SDK, que é a **decisão 1** de `docs/decisoes-do-dono.md`, ainda
pendente. A própria diretriz prevê isso: *"Caso a integração dependa de chaves de
API ainda não configuradas, prepare a estrutura e documente a pendência."* É o
que está sendo feito.

**Sobre os nomes de componente:** a diretriz lista `AppHeader`, `AppInput`,
`AppCard` e outros. O projeto já tem os equivalentes com outros nomes
(`ScreenHeader`, `TextInput`, `InfoCard`). Renomear tudo custa caro e não
entrega nada ao usuário. A equipe vai **criar os que faltam** de verdade
(`RideMap`, `ConfirmationModal`, `RatingDisplay`, `PaymentMethodCard`) e manter
os nomes existentes nos que já cumprem o papel.
