import Image from 'next/image';
import { FOOTER_CONTENT } from '@/content/footer';
import { NAV_LINKS } from '@/content/nav';
import { Container } from './Container';
import styles from './Footer.module.css';

export function Footer() {
  return (
    <footer className={styles['footer']}>
      <Container>
        <div className={styles['top']}>
          <div className={styles['brandColumn']}>
            <Image src="/brand/vuumbora-horizontal.png" alt="VuumBora" width={140} height={34} />
            <p className={styles['tagline']}>{FOOTER_CONTENT.tagline}</p>
          </div>

          <nav aria-label="Rodapé">
            <p className={styles['columnTitle']}>{FOOTER_CONTENT.siteColumnTitle}</p>
            <ul className={styles['navList']}>
              {NAV_LINKS.map((link) => (
                <li key={link.href}>
                  <a href={link.href}>{link.label}</a>
                </li>
              ))}
            </ul>
          </nav>

          <div>
            <p className={styles['columnTitle']}>{FOOTER_CONTENT.legalColumnTitle}</p>
            <ul className={styles['navList']}>
              {FOOTER_CONTENT.legal.map((item) => (
                <li key={item.name} className={styles['legalItem']}>
                  <span className={styles['legalName']}>{item.name}</span>
                  <span className={styles['legalNote']}>{item.note}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className={styles['columnTitle']}>{FOOTER_CONTENT.contactColumnTitle}</p>
            <p className={styles['contactNote']}>{FOOTER_CONTENT.contactNote}</p>
            <a className={styles['contactEmail']} href={`mailto:${FOOTER_CONTENT.contactEmail}`}>
              {FOOTER_CONTENT.contactEmail}
            </a>
          </div>
        </div>

        <div className={styles['bottom']}>
          <span>
            © {new Date().getFullYear()} VuumBora. {FOOTER_CONTENT.bottomLeft}
          </span>
          <a href={FOOTER_CONTENT.backToTop.href}>{FOOTER_CONTENT.backToTop.label}</a>
        </div>
      </Container>
    </footer>
  );
}
