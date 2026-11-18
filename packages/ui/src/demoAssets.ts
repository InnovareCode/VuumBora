/// <reference path="./assets.d.ts" />
import motoristaDemoSource from '../assets/people/motorista-demo.jpg';

/**
 * Asset de foto de DEMONSTRAÇÃO embutido no pacote — para passar direto em
 * `Avatar.imageSource` (`ImageSourcePropType`, o mesmo formato que `Image.source`
 * aceita). **Não** resolver para `{ uri }` com `Image.resolveAssetSource`: essa API
 * não existe no `react-native-web` (`Image.default.resolveAssetSource is not a
 * function`, erro real visto medindo a Home do motorista) — o número de asset do
 * Metro já funciona direto em `source`, nativo e web, igual ao que
 * `MapPreviewBackground` já fazia. Nenhuma dessas fotos é de uma pessoa real — quem
 * usa precisa continuar marcando com `MockBadge` (mesma regra de qualquer outro
 * dado fabricado).
 */
export const driverDemoAvatarSource = motoristaDemoSource;
