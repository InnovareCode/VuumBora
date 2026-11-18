---
name: project-recortes-marca
description: Recortes da logomarca e ícones Expo gerados em 2026-11-18 a partir de LogoMarca.png 1254px; como foram feitos e armadilhas do original
metadata:
  type: project
---
Recortes da marca (lockup, horizontal, selo, badge @1x/2x/3x + master) e ícones Expo (icon/adaptive/splash) foram gerados em 2026-11-18 por keying numérico do LogoMarca.png (1254×1254, RGB, sem alfa). Scripts reprodutíveis em tools/brand-assets (extract.py -> build.py -> measure.py, rodar na mesma pasta).

**Why:** o dono só tem o bitmap gerado por IA; não existe vetor. Tudo foi recortado, nada redesenhado.

**How to apply:**
- Se o dono mandar SVG/arquivo maior, re-gerar com os scripts em vez de editar PNG à mão.
- Armadilha: o campo escuro do logo tem vinheta quase preta que se conecta aos cantos pretos; detectar canto por limiar+fill_holes falha. Limitar a região de canto por caixa geométrica (280px).
- Armadilha: descontaminar cor da borda pelo "pixel sólido mais próximo" puxa cor de outro elemento (rabo do swoosh pegava branco do "m"); restringir por componente.
- O carro e o miolo do pin são "furos" (fundo navy), não preenchimento: recortes só funcionam sobre fundo escuro.
- Expo SDK 58: splash só via plugin expo-splash-screen (sem `splash` no topo); Android 12+ corta o splash num círculo de 192dp em 288dp.
- Relacionado: [[project-paleta-vuumbora]]
