# VuumBora — Plano de implementação faseado

Escrito em 18/11/2026 por Atlas, que orquestra a execução.
Substitui a ordem informal que a equipe vinha seguindo.

**Como ler:** cada etapa tem **responsável**, **do que depende**, e **critério de
pronto** — a condição objetiva que decide se está entregue, e não "parece ok".
Etapas sem dependência entre si rodam em paralelo.

**Regra que vale em todas as fases:** nada é dado como pronto sem medição no
navegador em 320/360/390/430 e `npm run check` em 0. Quem escreve o código não é
quem aprova a entrega.

---

## Onde estamos hoje

**Pronto e commitado (19 commits):**
- Monorepo Expo SDK 58, dois apps, quatro pacotes, guarda de arquitetura que
  quebra o build se alguém escrever cor solta ou cruzar os perfis
- Paleta medida na logomarca e aprovada · Plus Jakarta Sans · logomarca
  recortada, ícones e splash
- Design system com 17 componentes, acabamento premium aplicado (itens 1–6)
- **Passageiro:** boas-vindas, login, cadastro, home, destino, confirmação,
  buscando, a caminho, em andamento, concluída — **10 telas**
- **Motorista:** dashboard — **1 tela**
- Máquina de estados da corrida no pacote de domínio

**Em execução agora:** mapa escuro, veículos nos cards e fundo das boas-vindas.

**O que não existe:** backend, mapa real, pagamento, autenticação, testes
automatizados.

---

# FASE 1 — Fechar o protótipo do passageiro
*Objetivo: o passageiro navega tudo que a referência mostra, sem backend.*

| # | Etapa | Responsável | Depende de | Pronto quando |
|---|---|---|---|---|
| 1.1 | Concluir acabamento premium (mapa, veículos, boas-vindas, 3 itens travados) | Lyra | — | Em execução |
| 1.2 | Decidir os marcadores de demonstração (selo por dado → aviso único) | **Dono** | — | Decisão registrada |
| 1.3 | Histórico de viagens (P11) | Lyra | 1.1 | Lista, filtros, detalhe, estado vazio |
| 1.4 | Perfil (P13) | Lyra | 1.1 | Dados, endereços salvos, navegação para as seções |
| 1.5 | Configurações | Lyra | 1.1 | Notificações, tema, idioma, privacidade, cache |
| 1.6 | Controle de sessão e rota protegida | Vega + Lyra | 1.4 | App abre nas boas-vindas; tela interna sem sessão redireciona |
| 1.7 | Auditoria visual tela a tela contra as referências | Apolo | 1.1–1.5 | Tabela de divergências com gravidade, nota por tela |
| 1.8 | Correção das divergências | Lyra | 1.7 | Reauditado, sem divergência relevante |

**Fora desta fase por decisão pendente:** carteira (decisão 4) e indique e ganhe
(decisão 12).

# FASE 2 — Fechar o protótipo do motorista
*Objetivo: paridade com o passageiro. Hoje o motorista tem 1 tela de 11.*

| # | Etapa | Responsável | Depende de | Pronto quando |
|---|---|---|---|---|
| 2.1 | Login e cadastro do motorista | Lyra | 1.1 | Mesma validação real do passageiro |
| 2.2 | Corrida em andamento (M09) e finalizar (M10) | Lyra | 2.1 | Espelha o lado do passageiro pela mesma máquina de estados |
| 2.3 | Histórico de corridas (M12) | Lyra | 2.1 | Lista por período, detalhe, estado vazio |
| 2.4 | Perfil e veículo (M13) | Lyra | 2.1 | Dados, veículo, estado de validação |
| 2.5 | Ganhos (M11) — **sem saque** | Lyra | 2.1 | Totais por período, gráfico, lista; saque bloqueado pela decisão 6 |
| 2.6 | Documentos (M03/M13) — **só visual** | Lyra | 2.1 | Lista com estados; envio real depende da decisão 9 |
| 2.7 | Suporte (M14) | Lyra | 2.1 | Central, reportar problema; canal real depende da decisão 11 |
| 2.8 | Auditoria visual do motorista | Apolo | 2.1–2.7 | Mesmo rito da 1.7 |

# FASE 3 — Qualidade
*Objetivo: provar que funciona, não só que renderiza. Roda em paralelo a partir da 1.3.*

| # | Etapa | Responsável | Depende de | Pronto quando |
|---|---|---|---|---|
| 3.1 | Suíte de testes (Jest + RNTL) — hoje não existe nenhuma | Íris | — | Componentes do design system cobertos; roda em um comando |
| 3.2 | Testes de fluxo do passageiro | Íris | 1.6 | Pedido de corrida ponta a ponta, incluindo os caminhos de erro |
| 3.3 | Auditoria de responsividade completa | Íris | 1.8 | 320 a 430 **mais** altura curta, fonte do sistema em 200%, teclado, safe area |
| 3.4 | Auditoria de acessibilidade | Íris | 3.3 | Leitor de tela, foco, rótulos, contraste em tela real |
| 3.5 | Prova em Android e iOS reais | Vulcano + Íris | 3.3 | Build instalado; confirma sombra, fonte e toque no aparelho |
| 3.6 | CI: check e testes a cada commit | Vulcano | 3.1 | Pipeline barra merge com check vermelho |

**3.5 é mais importante do que parece:** tudo foi medido em navegador. A sombra
do React Native em Android, por exemplo, **nunca foi vista rodando**.

# FASE 4 — Contratos e adaptadores
*Objetivo: separar o app do backend antes de o backend existir. Pode começar já.*

| # | Etapa | Responsável | Depende de | Pronto quando |
|---|---|---|---|---|
| 4.1 | Contrato de API completo em `packages/api-client` | Nova + Vega | — | Interfaces tipadas de auth, lugares, cotação, corrida, pagamento, motorista |
| 4.2 | Adaptador mock implementando o contrato | Vega | 4.1 | As telas trocam dado fabricado por porta mock, sem mudar UI |
| 4.3 | Camada de estado remoto (TanStack Query) | Vega | 4.2 | Carregando, erro, repetição e cache tratados num lugar só |
| 4.4 | Modelo de dados e migrações | Cronos | 4.1 | Esquema com dinheiro em centavos, UUID, fuso explícito, auditoria |

**Por que antes do backend:** com o contrato fechado, trocar mock por servidor
não reescreve tela nenhuma — e o backend pode ser construído em paralelo.

# FASE 5 — O que depende das suas decisões
*Objetivo: transformar protótipo em app. Cada etapa espera uma decisão.*

| # | Etapa | Responsável | Espera a decisão |
|---|---|---|---|
| 5.1 | Mapa real, rota e localização | Lyra + Vega | **1 — SDK de mapa** |
| 5.2 | Backend, autenticação e persistência | Vega + Cronos | **2 — onde roda e quem constrói** |
| 5.3 | Cálculo de tarifa e repasse | Vega | **7 — modelo de tarifa** |
| 5.4 | Pagamento real | Vega | **3 — provedor com split** |
| 5.5 | Distribuição de corridas e tempo real | Vega + Cronos | 5.2 |
| 5.6 | Login social | Lyra | **8** |
| 5.7 | Navegação do motorista | Lyra | **10** |
| 5.8 | Verificação de documentos | Vega | **9** |
| 5.9 | Suporte e contato mascarado | Vega | **11** |
| 5.10 | Carteira, saque, indicação, agendamento | Vega + Lyra | **4, 5, 6, 12, 14** |

As decisões estão detalhadas em `docs/decisoes-do-dono.md`.
**As que mais travam: 1 (mapa), 7 (tarifa) e 2 (backend).**

# FASE 6 — Segurança, operação e lançamento

| # | Etapa | Responsável | Depende de | Pronto quando |
|---|---|---|---|---|
| 6.1 | Auditoria de segurança (OWASP) | Órion | Fase 5 | Achados por severidade, críticos corrigidos |
| 6.2 | LGPD: base legal, retenção, descarte, direitos | Órion + Alexandria | 5.2 | Política escrita e implementada |
| 6.3 | Revisão das 52 vulnerabilidades do `npm audit` | Órion | — | Cada uma avaliada; o que importa, corrigido |
| 6.4 | Termos de uso e política de privacidade | **Dono** + Alexandria | 6.2 | Textos reais publicados (hoje os links avisam que não existem) |
| 6.5 | Build de produção e contas de loja | Vulcano + **Dono** | 3.5 | `.aab` e `.ipa` assinados; identificadores definitivos |
| 6.6 | Monitoramento e telemetria sem dado pessoal | Vulcano | 5.2 | Erro em produção chega a alguém |
| 6.7 | Documentação | Alexandria | — | README, API e guia de operação conferidos contra o código |
| 6.8 | Publicação | Vulcano + **Dono** | 6.1–6.6 | Aprovado nas duas lojas |

---

## Animações

Atravessa as fases, não é etapa isolada. O padrão está em `docs/movimento.md`.
Entra **depois** que o visual de cada tela estabiliza: animar componente que
ainda vai mudar de forma é trabalho jogado fora.

- Micro-interações dos componentes base → junto da 1.8
- Transições entre telas → junto da 2.8
- Movimento do mapa → com a 5.1

## O caminho crítico

```
Fase 1 ──┬── Fase 2 ──┬── Fase 3 ── Fase 6
         │            │
         └── Fase 4 ──┴── Fase 5 (espera suas decisões)
```

As fases 1, 2, 3 e 4 **não dependem de nenhuma decisão sua** — dá para ir longe
antes de qualquer travamento. A Fase 5 é onde o projeto para, se as decisões 1,
2 e 7 não existirem.

## Como vou orquestrar

1. Uma missão no painel por etapa, com o responsável correto.
2. Etapas independentes em paralelo, com arquivos separados para não colidirem.
3. A cada entrega: conferência no navegador, print para você, commit e missão
   fechada no mesmo turno.
4. Nada entra como pronto sem medição — quem escreveu não é quem aprova.
5. Decisão sua que aparecer no caminho vira pergunta objetiva, com recomendação,
   não um "o que você acha?".

---

## Repositório

`https://github.com/InnovareCode/VuumBora.git` — conectado em 18/11/2026,
branch `main`. O histórico completo (26 commits) foi publicado.

Antes do primeiro push houve varredura do que ia ser publicado: nenhum token,
chave ou segredo nos arquivos versionados, e `.env`, `.missao-atual` e
`.missoes-quadro.json` confirmados como ignorados.

**Nunca commitar:** o `.env` (token do Mapbox) e os arquivos de estado de
sessão da equipe. O `.gitignore` já barra os três.
