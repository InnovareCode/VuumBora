# <ID> · <Nome da tela>

| Campo | Valor |
|---|---|
| App | passageiro / motorista / painel |
| Rota e arquivo | `apps/<app>/app/(grupo)/<arquivo>.tsx` (ou "não existe") |
| Spec | `especificacoes/<PASSAGEIRO\|MOTORISTA>.md`, linha <ID> |
| Alvo visual | `referencias/alvo_<app>_2026-11-22.png`, recorte (x0, y0, x1, y1), ou "sem recorte: herda de <ID>" |
| Estado hoje | não existe / UI com mock / parcial / real |
| Última nota | nota da `docs/auditoria-premium.md` com a data, ou "não auditada" |
| Depende de decisão | números de `docs/decisoes-do-dono.md`, PP-x e D-xx de `docs/padrao-premium-telas.md` |
| Ordem | onda de tratamento (ver `README.md`) |

## 1. Pergunta que a tela responde

Uma frase, do ponto de vista do usuário. Mais o sinal de sucesso: o que ele consegue fazer ao sair da tela.

## 2. Layout

Esqueleto por zonas, de cima para baixo, em 390×844, com a altura e o espaço de cada zona em pt e o token de cada medida.
Depois, o que muda em 320×568 e em 430×932 (só as diferenças).

```
┌──────────────────────────┐
│ safe area                 │
│ zona 1 …                  │
└──────────────────────────┘
```

## 3. Hierarquia

| Nível (§2 do padrão) | Elemento |
|---|---|
| N1 ação | … (um só) |
| N2 resposta | … |
| N3 apoio | … |
| N4 ação secundária | … |
| N5 metadado | … |

Contagem de amarelo: blocos (máx. 1) e sinais, listados.

## 4. Componentes e tokens

| Elemento | Componente (`packages/ui` ou do app, com arquivo) | Tokens e papéis |
|---|---|---|

## 5. Estados (todas as linhas; "n/a" com motivo)

| Estado | Como aparece | Captura exigida |
|---|---|---|
| Padrão | | sim |
| Carregando | | |
| Carregando ação | | |
| Vazio | | |
| Erro recuperável | | |
| Sem rede | | |
| Texto longo | | |
| 320×568 | | |
| 430×932 | | |
| Fonte 200% | | aparelho |
| Teclado aberto | | aparelho |
| Permissão negada | | |
| Mock | | |

## 6. Microinterações

Toque, seleção, transição de entrada e saída, anúncio ao leitor de tela, resposta tátil. Com "reduzir movimento".

## 7. Copy

| Chave | Texto |
|---|---|

Mensagens de erro: uma por código do contrato, nunca "Algo deu errado" genérico quando o código é conhecido.

## 8. Acessibilidade

Ordem de foco, rótulos e papéis, o que é cabeçalho, o que é anunciado, alvos especiais.

## 9. Assets

O que já existe (caminho) e o que falta (com licença e origem).

## 10. Dados: reais × mock

| Dado | Fonte hoje | Fonte alvo | Selo enquanto for mock |
|---|---|---|---|

## 11. Lacunas do protótipo (código de hoje, arquivo:linha)

## 12. Pedidos de componente

Referências a C-xx do padrão, ou pedido novo com justificativa.

## 13. Portão: itens próprios desta tela

Além de G-01 a G-28: o que medir aqui, com o número esperado. Lista de capturas: `<app>/<ID>-<estado>-<LxA>.png`.

## 14. Não conferido
