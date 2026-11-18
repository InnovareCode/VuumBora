---
name: bug_chrome_screenshot_cli_viewport_mentiroso
description: O comando de linha `chrome.exe --headless --screenshot=... --window-size=W,H --force-device-scale-factor=N` pode salvar um PNG que não corresponde ao viewport CSS realmente renderizado — reproduzir um "corte" assim pode ser bug da ferramenta de captura, não do layout.
metadata:
  type: feedback
---

**O que aconteceu:** o Atlas reportou corte de texto em 390px usando
```
chrome.exe --headless=new --disable-gpu --hide-scrollbars --incognito \
  --force-device-scale-factor=2 --window-size=390,7700 --virtual-time-budget=25000 \
  --screenshot=saida.png "http://localhost:8082/catalogo?bust=..."
```
Reproduzi com os MESMOS flags, mas conectando via Playwright `connectOverCDP` no
Chrome real (lançado com `--remote-debugging-port`, mesmos flags, sem
`--screenshot`) em vez de deixar o Chrome escrever o arquivo sozinho. Resultado:
`window.innerWidth` era **492px**, não 390 — o `--window-size` + `--force-
device-scale-factor` juntos não produzem o viewport CSS que o número sugere
(comportamento conhecido e inconsistente do headless Chrome no Windows). Mesmo
com 492px de verdade, o layout não cortava nada (medido por elemento). A
hipótese que sobrou: o caminho de código do flag `--screenshot` do Chrome grava
o PNG com uma dimensão diferente da que o motor de layout realmente usou,
cortando visualmente o que já tinha sido desenhado maior — ou seja, o defeito
está na FERRAMENTA DE CAPTURA, não na página.

**Como confirmar isso da próxima vez, sem gastar as mesmas horas:**
1. Nunca confie só no PNG de `--screenshot`. Conecte via CDP
   (`chromium.connectOverCDP('http://localhost:<porta>')`, Chrome lançado com
   `--remote-debugging-port=<porta>` e os MESMOS flags, sem `--screenshot`) e
   leia `window.innerWidth`/`document.documentElement.clientWidth` direto.
2. Se o viewport real bater com o esperado e a medição por elemento (ver
   [[feedback_checar_overflow_por_elemento]]) não achar problema, o PNG do
   `--screenshot` é suspeito — tire o screenshot por `page.screenshot()` do
   Playwright (grava pelo processo Node, caminho testado e confiável) em vez do
   flag nativo do Chrome.
3. `chromium.launch({ channel: 'chrome' })` do Playwright também dirige o Chrome
   REAL instalado (não o Chromium empacotado) — útil pra eliminar "é só o motor
   de render que diverge" como hipótese, sem precisar lidar com o flag
   `--screenshot` nem com permissão de escrita em disco de um processo solto.

**Armadilha de ambiente:** rodar `chrome.exe` como processo solto via Bash (sem
ser Playwright) pode receber "Acesso negado" ao tentar escrever QUALQUER arquivo
em disco, em qualquer pasta, mesmo com `--user-data-dir` dedicado e sem
`--incognito` — o binário roda normalmente (`--version` funciona), só a escrita
falha. Isso parece ser uma restrição de sandbox específica da sessão de
subagente (o Atlas, rodando como orquestrador, conseguiu gravar o PNG direto).
Contorno: deixar o Playwright mediar a escrita (ele já prova, em outras partes
desta sessão, que a escrita em disco pelo processo Node funciona).
