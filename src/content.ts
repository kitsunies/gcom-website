export const membership = 'https://clubs.msa.monash.edu/organisation/9329/';
export const base = import.meta.env.BASE_URL;
export const local = (path = '') => `${base}${path}`;
export const calendar = import.meta.env.VITE_CALENDAR_URL || '';
export const contact = import.meta.env.VITE_CONTACT_EMAIL || 'kitsunies@gmail.com';
export const contactEndpoint = import.meta.env.VITE_CONTACT_ENDPOINT || '';
export const composition = import.meta.env.VITE_COMPOSITION || 'reference';

export type TeamMember = {
  id: string;
  name: string;
  role: string;
  photo?: string;
  links?: { label: string; url: string }[];
};
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
export const art = {
  hero: 'hero-original-web.webp',
  purple: 'purple-original-web.webp',
  green: 'green-original-web.webp',
  yellow: 'yellow-original-web.webp',
  coral: 'coral-original-web.webp',
  cross: 'cross-original-web.webp',
};
