---
name: feedback-harness-passada-5
description: Armadilhas e receitas do meu harness na passada 5 (Postgres UTF-8 no Windows, splat do PowerShell, mutante que morre por pré-condição, dev Expo sem watch, seletores que pegam tela escondida, gancho para o B-6 no navegador)
metadata:
  type: feedback
---

Contexto: [[project-s1-passada-5-qa]]. Quase todo "FAIL" que eu vi nesta passada era meu roteiro, não o app; calibrar antes de reprovar (mesma lição de [[project-s1-passada-3-qa]]).

**Infra**
- `initdb` no Windows nasce em WIN1252 e a migração 0002 (a seta) falha com "sem equivalente na codificação": usar `initdb -E UTF8`.
- PowerShell: `$list = $Files.Split(',') | ForEach-Object {...}` com UM arquivo vira string e `@list` espalha CARACTER POR CARACTER para o `node` (erro "Cannot find module C:\index.ts"). Embrulhar em `@(...)`.
- Nome de banco acima de 63 caracteres é truncado e perde o sufixo `_test` (o harness recusa). Encurtar o nome do mutante.
- Expo dev server com `CI=1` NÃO observa arquivos: editar a fonte para canário não recarrega. Fazer o canário por EXPORT de produção (12 a 45 s) num diretório próprio e restaurar a fonte comparando com `git show <sha>:arquivo`.
- 6 grupos de navegador de 2 CPUs (máscaras 12288, 49152, 196608, 786432, 3145728, 12582912) mais as trilhas de tempo nas CPUs 0-3 e mutantes nas 4-11 cabem na máquina de 24 CPUs. Cada motor precisa de PORTAS próprias para servidores de teste (colisão EADDRINUSE derrubou uma execução em 1 s).
- `pngjs` mora em `repo/node_modules` (cópia limpa), não na pasta do skill do Playwright.
- Nunca matar por `CommandLine like '*padrao*'` (repeti o erro e quase mato o próprio PowerShell): por porta (`stop-by-port.sh`) ou por PID.

**Mutação**
- Um mutante que morre por uma PRÉ-CONDIÇÃO anterior (`0 !== 2` "pista ocupada") não prova nada sobre o limite novo. Ler a mensagem do assert que falhou. Para exercitar o limite foi preciso um mutante que preserva as vagas (M1b: bcrypt síncrono + `setTimeout(finish, 400)`).
- Calibrar limite de tempo emulando máquina mais rápida (custo do bcrypt 11 = 2x, 10 = 4x), e mutar CADA ponto de chamada (login, cadastro, reset, verify, admin), não só o caminho que o teste exercita.
- Canário do N2: reverter `uniqueEmail` e rodar o mesmo arquivo 2x no mesmo banco (a 2ª cai nos 2 testes B-1/F4).

**Navegador (Expo web)**
- `history.pushState` antes de o app montar se PERDE: esperar algum `data-testid` na tela + ~900 ms (e ~1,5 s depois do login, para a guarda de rota assentar) antes de `nav()`.
- `[data-testid$="-terms-link"]` casou primeiro o link escondido da tela de boas-vindas que fica montada por baixo da pilha (retângulo 0x0). Usar o testID exato.
- A tela de reaceite REMONTA ao trocar de rota e as caixas voltam desmarcadas; no passageiro o portão entra NO MEIO da sessão quando a versão legal muda e a pessoa navega. Para ir ao portão: sair, trocar a versão do mock, entrar. Para aceitar: marcar conferindo `aria-checked`.
- B-6 no navegador sem API: no dev server, `__vuumboraIdentity.mode = 'http'` e `__vuumboraIdentity.legalCurrent = async () => ({ ok: true, origin: 'real', data: { audience, terms, privacy } })` com `url` apontando para um servidor de texto meu (CORS aberto) e o `sha256` que eu quiser; o componente `VerifiedTextView` é o real. IP da rede local (origem não segura) dá "hash_unavailable".
- Detector de token que varre `JSON.stringify` do dump inteiro acusa a PALAVRA "session" da minha própria chave: varrer só os valores.
- O dev server do motorista/passageiro compila rota preguiçosa: a 1ª ida a `/perfil` pode passar de 30 s; esperar o elemento com `waitFor({ timeout: 90000 })`.
- Teclado: Enter/Espaço em `LinkButton` no web não faz nada (Q4); para testar ativação por teclado usar elementos `role=button`.
