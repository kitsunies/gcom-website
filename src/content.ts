import { siteLink } from './links';
import snapshot from './generated/site-content.json';
import type { Media, SiteContent } from './site-content';
export type { TeamMember } from './site-content';

export const content: SiteContent = snapshot;
export const base = import.meta.env?.BASE_URL || '/';
export const local = (path = '') => `${base}${path}`;
export const href = (url: string) => siteLink(url, base);
export const asset = (image: Media) => href(image.src);
export const membership = content.settings.membershipUrl;
export const calendar = content.settings.calendarUrl;
export const contact = content.settings.contactEmail;
export const art = content.settings.artwork;
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
