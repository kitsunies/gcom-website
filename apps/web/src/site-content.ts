export type Media = { src: string; alt: string };
export type TeamMember = {
  id: string;
  name: string;
  role: string;
  photo?: Media;
  links: { label: string; url: string }[];
};
