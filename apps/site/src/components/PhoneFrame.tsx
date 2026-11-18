import styles from './PhoneFrame.module.css';

interface PhoneFrameProps {
  src: string;
  alt: string;
  priority?: boolean;
  className?: string | undefined;
}

/**
 * Moldura de celular desenhada em CSS (bezel arredondado, botões laterais)
 * — nunca uma imagem de moldura, para ficar nítida em qualquer tamanho de
 * tela. A tela real do app entra como <img> comum, recortada pelo frame
 * (`object-fit: cover`, `object-position: top`), já que os prints não têm
 * todos a mesma proporção de celular.
 *
 * Sem ilha dinâmica desenhada por cima: os prints reais não reservam essa
 * faixa (o cabeçalho do app já começa rente ao topo da imagem), então uma
 * ilha sobreposta cobria texto de verdade ("Para onde vamos?", "Confirmar
 * corrida") — medido no navegador em 18/11/2026, não só suposto.
 */
export function PhoneFrame({ src, alt, priority, className }: PhoneFrameProps) {
  return (
    <div className={className ? `${styles['frame']} ${className}` : styles['frame']}>
      <div className={styles['screen']}>
        {/* eslint-disable-next-line @next/next/no-img-element -- exportação
            estática com images.unoptimized: o <Image> do Next não traz
            ganho aqui; <picture>/<img> dá controle direto de srcSet (ver
            ParallaxScene) e aqui nem isso é necessário, um recorte só. */}
        <img
          src={src}
          alt={alt}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          className={styles['img']}
        />
      </div>
    </div>
  );
}
