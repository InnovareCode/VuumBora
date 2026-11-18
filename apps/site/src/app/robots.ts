import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

// Exportação estática (output: 'export'): esta rota precisa ser resolvida em
// build time, não por requisição.
export const dynamic = 'force-static';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
