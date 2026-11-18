---
name: project-tipografia-vuumbora
description: VuumBora typography shortlist (2026-11-18) — Plus Jakarta Sans recommended, Manrope/Sora alternatives, Montserrat Alternates rejected for app (caps break plates); owner has not chosen yet
metadata:
  type: project
---
Tipografia proposta em 2026-11-18 em `docs/tipografia.md` + `docs/prints/tipografia-candidatas.png`. Recomendada Plus Jakarta Sans; alternativas Manrope (segura) e Sora (expressiva). **Dono ainda não escolheu**; token `typography.family` continua "Inter".

**Why:** o dono pediu fonte "moderna e bonita que remeta a mobilidade urbana"; critério que mais elimina candidatas é ter `tnum` real (preço/ETA/placa não podem dançar).

**How to apply:**
- Antes de propor fonte, checar `tnum` no GSUB e medir largura dos dígitos no navegador: Urbanist e DM Sans NÃO têm tnum; Geist tem, mas a largura tabular muda com o peso.
- App é Expo/RN: embarcar TTF estáticos por peso (@expo-google-fonts), não o variável (eixo wght não funciona no Android).
- Ferramental que funcionou: fontTools via `pip --target` no scratchpad + playwright-core apontando para o Chromium já em `%LOCALAPPDATA%/ms-playwright`. Heredoc grande no Git Bash quebrou; usar Write.
- Montserrat Alternates (dono gostou no ModaShop) avaliada e reprovada para o app: maiúsculas alternativas (E→ɛ, M N U W Y com forma de minúscula) quebram placa Mercosul e rótulos em caixa-alta; só estáticos, 835 KB. Uso aceito: marketing. Sempre testar fonte "display" com placa contendo E M N U W Y, não só ABC.
- Ver também [[project-paleta-vuumbora]].
