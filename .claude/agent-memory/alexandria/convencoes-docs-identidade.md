---
name: convencoes-docs-identidade
description: Onde ficam as tabelas de erro e os caminhos de código em docs/ (identidade, admin, build, mapbox) e as armadilhas de leitura dos contratos (desenho vs. implementado, M-3 ambíguo)
metadata:
  type: project
---

Convenções de documentação do VuumBora, verificadas em 22/11/2026.

- **Caminhos de código nos docs são relativos a `apps/api/`** para o backend (ex.: `src/services/identity-service.ts`) e a
  `apps/passenger/` para o app. Mantenha a base explícita na primeira menção.
- **Tabelas de erro do admin**: `docs/contrato-admin-2fa.md` seção 4 e `docs/contrato-admin-email.md` "Erros da reautenticação".
  `docs/contrato-identidade-apps.md` não tem tabela de admin; só aponta para lá.
- **`contrato-identidade-apps.md` mistura desenho e implementado.** Os blocos "B3" e "Migração 0021" já estão no código
  (commits `d75b9b9`, `0cc39aa`). Ao atualizar uma regra, leia o trecho inteiro antes: há texto de desenho ("a implementar",
  "Substituído pelo desenho") que pode estar desatualizado.
- **`retryAfterSeconds` do par de conferência (verify-email/reset) é a janela cheia** (`AUTH_CODE_CHECK_WINDOW_MINUTES` × 60),
  não o tempo exato até liberar. Já o login usa espera progressiva calculada (`progressive-delay.ts`).
- **"M-3" é ambíguo no projeto**: rodada 3 do Órion = aceite com versão exibida (item B3 do plano); rodada 3b = build de loja
  sem telas de dev e sem identidade simulada (commit `0fe8883`). Escreva sempre o contexto junto.
- **Pista do bcrypt (`503 server_busy`, `Retry-After: 3`)** é recusada antes de gravar no banco. Um achado antigo da Íris (F4,
  passada 3) dizia o contrário; a ordem foi corrigida no código, mas o veredito não foi refeito.

**Why:** a documentação de identidade foi escrita em rodadas sucessivas (desenho, depois implementação), e a equipe já
perdeu tempo com trechos de desenho lidos como estado atual.

**How to apply:** antes de afirmar comportamento de auth/identidade, confira o arquivo e a linha no código; ao citar "M-3"
ou "B-9", diga qual rodada.
