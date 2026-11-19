import { CREDIBILITY_COLUMNS, CREDIBILITY_HEADING, CREDIBILITY_SCREENS, CREDIBILITY_SCREENS_LEGEND } from '@/content/credibility';
import { AboutBlock } from './AboutBlock';
import { CredibilityColumns } from './CredibilityColumns';
import { Reveal } from './Reveal';
import { ScreensStrip } from './ScreensStrip';
import { Section } from './Section';
import { SectionHeading } from './SectionHeading';

/**
 * Substitui a antiga seção de Segurança: aqui a credibilidade vem de
 * mostrar o estado real do projeto, não de prova social que ainda não
 * existe (`docs/conteudo-site.md` §5). O bloco "Quem está por trás"
 * (`AboutBlock`) entrou em 19/11/2026, quando o dono identificou o
 * controlador dos dados.
 */
export function CredibilitySection() {
  return (
    <Section id="transparencia" headingId="transparencia-titulo">
      <Reveal>
        <SectionHeading id="transparencia-titulo" {...CREDIBILITY_HEADING} />
      </Reveal>
      <CredibilityColumns columns={CREDIBILITY_COLUMNS} />
      <ScreensStrip screens={CREDIBILITY_SCREENS} legend={CREDIBILITY_SCREENS_LEGEND} />
      <AboutBlock />
    </Section>
  );
}
