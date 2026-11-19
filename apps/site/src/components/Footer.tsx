import Image from 'next/image';
import { FOOTER_CONTENT } from '@/content/footer';
import { SOCIAL_LINKS } from '@/content/social';
import { Container } from './Container';
import styles from './Footer.module.css';

function WhatsAppIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 3a9 9 0 0 0-7.78 13.54L3 21l4.6-1.2A9 9 0 1 0 12 3z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M9 9.6c0-.6.4-1 .9-1h.6c.3 0 .5.2.6.5l.5 1.4c.1.3 0 .6-.2.8l-.5.5c.5 1 1.3 1.8 2.3 2.3l.5-.5c.2-.2.5-.3.8-.2l1.4.5c.3.1.5.3.5.6v.6c0 .5-.4.9-1 .9-3.3 0-6-2.7-6-6z"
        fill="currentColor"
      />
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12" cy="12" r="3.6" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="17.2" cy="6.8" r="1.1" fill="currentColor" />
    </svg>
  );
}

const SOCIAL_ITEMS = [
  { ...SOCIAL_LINKS.whatsapp, icon: WhatsAppIcon },
  { ...SOCIAL_LINKS.instagram, icon: InstagramIcon },
  // `href` vazio (endereço ainda não confirmado) não renderiza — nunca um
  // ícone apontando para lugar nenhum.
].filter((item) => item.href);

export function Footer() {
  return (
    <footer className={styles['footer']}>
      <Container>
        <div className={styles['top']}>
          <div className={styles['brandColumn']}>
            <Image src="/brand/vuumbora-horizontal.png" alt="VuumBora" width={140} height={34} />
            <p className={styles['tagline']}>{FOOTER_CONTENT.tagline}</p>
            <p className={styles['legalEntity']}>
              VuumBora é desenvolvido por <strong>{FOOTER_CONTENT.legalEntity.company}</strong>.
              <br />
              CNPJ {FOOTER_CONTENT.legalEntity.cnpj}
            </p>
          </div>

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

            {SOCIAL_ITEMS.length > 0 ? (
              <>
                <p className={`${styles['columnTitle']} ${styles['socialColumnTitle']}`}>{FOOTER_CONTENT.socialColumnTitle}</p>
                <ul className={styles['socialList']}>
                  {SOCIAL_ITEMS.map(({ href, label, ariaLabel, icon: Icon }) => (
                    <li key={href}>
                      <a
                        className={styles['socialLink']}
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`${ariaLabel} (abre em nova aba)`}
                      >
                        <Icon />
                        <span>{label}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
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
