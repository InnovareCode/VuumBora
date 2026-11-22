import { sondaEstilo } from './estilo.mjs';
import { sondaGeometria } from './geometria.mjs';
import { sondaTexto } from './texto.mjs';
import { sondaContraste } from './contraste.mjs';
import { sondaFoco } from './foco.mjs';
import { sondaAtivacaoDeLinks } from './ativacao-links.mjs';
import { conjuntoDeCoresDosTokens } from '../tokens.mjs';

/** Roda as sondas do §14.3 sobre uma página já carregada, mais a ativação por
 * teclado dos links (G-22, adaptação do q4.mjs da Íris — ver docs/qualidade-tela.md).
 * `foco` e `ativacaoLinks` precisam de teclado/mouse de verdade (não são só
 * `page.evaluate`), por isso rodam por último e em sequência — nunca em paralelo
 * com as outras, que mudariam o DOM por baixo do pé desses dois. */
export async function rodarSondas(page) {
  const cores = conjuntoDeCoresDosTokens();
  const estilo = await sondaEstilo(page, cores);
  const geometria = await sondaGeometria(page);
  const texto = await sondaTexto(page);
  const contraste = await sondaContraste(page);
  const foco = await sondaFoco(page);
  // Por último: `ativacaoLinks` navega (Enter em role=link) e desfaz com
  // `page.goBack()`, que nem sempre volta ao pixel exato de onde saiu (histórico
  // de 1 entrada, navegação dupla no teste de auto-repeat). Rodar antes do `foco`
  // fazia o Tab seguinte andar sobre uma página diferente da esperada — achado
  // real ao depurar esta sonda (22/11/2026).
  const ativacaoLinks = await sondaAtivacaoDeLinks(page);
  return { estilo, geometria, texto, contraste, foco, ativacaoLinks };
}
