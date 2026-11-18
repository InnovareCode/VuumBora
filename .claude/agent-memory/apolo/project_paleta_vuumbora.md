---
name: project-paleta-vuumbora
description: VuumBora palette was closed by pixel measurement (2026-11-18); source of truth is docs/identidade-visual.md; key traps (cyan in mockups/tokens, logo is gradient not flat)
metadata:
  type: project
---
Paleta final do VuumBora foi fechada por medição de pixels em 2026-11-18 e vive em `docs/identidade-visual.md` (tokens.json ainda NÃO atualizado — só recomendado).

**Why:** o dono exige identidade azul-noturno + amarelo + branco, sem ciano/roxo, e HEX com origem medida, não "de olho".

**How to apply:**
- O amarelo do logo é gradiente (#FED202 -> #FEA101, matiz 37-53°), não chapado; #FFCC00 fica como CTA (ΔE00 1,5 do topo do pin).
- Navy medido do logo = #0C111B, matiz 216°; qualquer azul de UI deriva dessa matiz.
- Mockups de referência (renders de IA) e o token info/userLocation usam ciano — fora da identidade; não copiar cor de mockup sem checar.
- LogoMarca.png e referencias/logo_aprovada.png são idênticos pixel a pixel; cantos são preto opaco (sem alfa).
- HEX duplicados em tokens.json, codigo/theme.css, codigo/theme.ts e DESIGN_SYSTEM_MESTRE.md — mudar sempre os quatro.
