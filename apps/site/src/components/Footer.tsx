import Image from 'next/image';
import { Container } from './Container';
import styles from './Footer.module.css';

const NAV_LINKS = [
  { href: '#como-funciona', label: 'Como funciona' },
  { href: '#seja-motorista', label: 'Seja motorista' },
  { href: '#seguranca', label: 'Segurança' },
  { href: '#faq', label: 'Perguntas frequentes' },
] as const;

export function Footer() {
  return (
    <footer className={styles['footer']}>
      <Container>
        <div className={styles['top']}>
          <div className={styles['brandColumn']}>
            <Image src="/brand/vuumbora-horizontal.png" alt="VuumBora" width={140} height={34} />
            <p className={styles['tagline']}>
              Mobilidade urbana em desenvolvimento. Nenhum valor, prazo ou cidade mostrado aqui é
              definitivo.
            </p>
          </div>

          <nav aria-label="Rodapé">
            <p className={styles['columnTitle']}>Site</p>
            <ul className={styles['navList']}>
              {NAV_LINKS.map((link) => (
                <li key={link.href}>
                  <a href={link.href}>{link.label}</a>
                </li>
              ))}
            </ul>
          </nav>

          <div>
            <p className={styles['columnTitle']}>Legal</p>
            <ul className={styles['navList']}>
              <li className={styles['legalItem']}>
                <span className={styles['legalName']}>Termos de Uso</span>
                <span className={styles['legalNote']}>Em elaboração — ainda não publicados.</span>
              </li>
              <li className={styles['legalItem']}>
                <span className={styles['legalName']}>Política de Privacidade</span>
                <span className={styles['legalNote']}>Em elaboração — ainda não publicada.</span>
              </li>
            </ul>
          </div>

          <div>
            <p className={styles['columnTitle']}>Contato</p>
            <p className={styles['contactNote']}>
              Ainda estamos definindo nossos canais de atendimento. Enquanto isso, não há um
              e-mail ou telefone de suporte ativo — assim que existir, ele aparece aqui.
            </p>
          </div>
        </div>

        <div className={styles['bottom']}>
          <span>© {new Date().getFullYear()} VuumBora. Todos os direitos reservados.</span>
          <span>Projeto em desenvolvimento.</span>
        </div>
      </Container>
    </footer>
  );
}
