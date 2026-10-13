import type fixture from '../content/fixture.json';

export type Media = { src: string; alt: string };
export type TeamMember = {
  id: string;
  name: string;
  role: string;
  photo?: Media;
  links: { label: string; url: string }[];
};
export type SiteContent = Omit<typeof fixture, 'team'> & {
  team: Omit<typeof fixture.team, 'members'> & { members: TeamMember[] };
};
