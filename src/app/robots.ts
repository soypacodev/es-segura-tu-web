import type { MetadataRoute } from 'next';

// La API no es para buscadores: solo la portada se indexa.
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: '*', allow: '/', disallow: '/api/' } };
}
