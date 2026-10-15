import { siteLink } from '../src/links';
import { settings } from '../src/content';
export const pagePaths = {
  home: '',
  about: 'about/',
  team: 'team/',
  contact: 'contact/',
} as const;
export const pageMetadata = {
  home: {
    title: 'GCOM | Build it your way.',
    description:
      "Explore Game Development and Game Design with GCOM. Let's create cool experiences together!",
    image: { src: 'artwork/banner.png', alt: 'GCOM game development club' },
  },
  about: {
    title: 'About Us | GCOM',
    description:
      'Explore GCOM, a community for creating games, learning together and finding collaborators at Monash University.',
    image: { src: 'artwork/banner.png', alt: 'GCOM game development club' },
  },
  team: {
    title: 'Meet the Team | GCOM',
    description:
      'Meet the committee behind GCOM, the Monash University game development club.',
    image: { src: 'artwork/banner.png', alt: 'GCOM game development club' },
  },
  contact: {
    title: 'Contact | GCOM',
    description:
      'Get in touch with the GCOM committee about game development, club activities and collaboration.',
    image: { src: 'artwork/banner.png', alt: 'GCOM game development club' },
  },
} as const;
export const escapeHtml = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        char
      ]!,
  );
export function pageHtml(
  page: keyof typeof pagePaths,
  origin: URL,
  base: string,
  metadata: {
    title: string;
    description: string;
    image: { src: string; alt: string };
  } = pageMetadata[page],
) {
  const { title, description, image } = metadata;
  const canonical = new URL(`${base}${pagePaths[page]}`, origin).href;
  const media = (src: string) => new URL(siteLink(src, base), origin).href;
  const social = media(image.src),
    escape = escapeHtml;
  return `<!doctype html>
<html lang="en-AU"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><meta name="theme-color" content="#1c1c1c" />
<title>${escape(title)}</title><meta name="description" content="${escape(description)}" /><link rel="canonical" href="${escape(canonical)}" />
<meta name="application-name" content="${escape(settings.fullName)}" />
<meta property="og:type" content="website" /><meta property="og:site_name" content="${escape(settings.name)}" /><meta property="og:title" content="${escape(title)}" /><meta property="og:description" content="${escape(description)}" /><meta property="og:url" content="${escape(canonical)}" /><meta property="og:image" content="${escape(social)}" /><meta property="og:image:alt" content="${escape(image.alt)}" />
<meta name="twitter:card" content="summary_large_image" /><meta name="twitter:title" content="${escape(title)}" /><meta name="twitter:description" content="${escape(description)}" /><meta name="twitter:image" content="${escape(social)}" /><meta name="twitter:image:alt" content="${escape(image.alt)}" />
<link rel="icon" type="image/png" href="${escape(siteLink(settings.logo.src, base))}" />
</head><body data-page="${page}"><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>`;
}
