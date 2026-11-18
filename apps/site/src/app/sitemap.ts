import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

// Exportação estática (output: 'export'): esta rota precisa ser resolvida em
// build time, não por requisição.
export const dynamic = 'force-static';

export default function sitemap(): MetadataRoute.Sitemap {
  // Site de página única por enquanto — uma entrada só. Crescer para mais
  // rotas é só acrescentar aqui.
  return [
    {
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1,
    },
  ];
}
