import { siteLink } from './links';
import type { Media } from './site-content';
export type { Media, TeamMember } from './site-content';

export const settings = {
  name: 'GCOM',
  brand: { before: 'GC', highlight: 'O', after: 'M' },
  fullName: 'Monash University Game Development Club',
  logo: { src: 'artwork/logo-original.png', alt: '' },
  membershipUrl: 'https://clubs.msa.monash.edu/organisation/9329/',
  contactEmail: 'kitsunies@gmail.com',
  calendarUrl: '',
  artwork: {
    hero: { src: 'artwork/hero-complete-web.webp', alt: '' },
    purple: { src: 'artwork/purple-original-web.webp', alt: '' },
    green: { src: 'artwork/green-original-web.webp', alt: '' },
    yellow: { src: 'artwork/yellow-original-web.webp', alt: '' },
    coral: { src: 'artwork/coral-original-web.webp', alt: '' },
    cross: { src: 'artwork/cross-original-web.webp', alt: '' },
  },
};
export const base = import.meta.env?.BASE_URL || '/';
export const local = (path = '') => `${base}${path}`;
export const href = (url: string) => siteLink(url, base);
export const asset = (image: Media) => href(image.src);
export const membership = settings.membershipUrl;
export const calendar = settings.calendarUrl;
export const contact = settings.contactEmail;
export const art = settings.artwork;
export const contactEndpoint = import.meta.env?.VITE_CONTACT_ENDPOINT || '';
export const composition = import.meta.env?.VITE_COMPOSITION || 'reference';
export type EventSummary = {
  id: string;
  title: string;
  start: string;
  end?: string;
  allDay: boolean;
  location?: string;
  url: string;
};
export type PageName = 'home' | 'about' | 'team' | 'contact';
