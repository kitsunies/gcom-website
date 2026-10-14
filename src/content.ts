export const art = {
  hero: 'hero-original-web.webp',
  purple: 'purple-original-web.webp',
  green: 'green-original-web.webp',
  yellow: 'yellow-original-web.webp',
  coral: 'coral-original-web.webp',
  cross: 'cross-original-web.webp',
};

export const calendar = '';
export const composition = 'reference';
export const local = (path = '') => `/${path}`;
export const membership = 'https://clubs.msa.monash.edu/organisation/9329/';
export const contact = 'kitsunies@gmail.com';

export type PageName = 'home' | 'about' | 'team' | 'contact';

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
