export type Media = { src: string; alt: string };
export type TeamMember = {
  _key: string;
  name: string;
  role: string;
  photo?: Media;
  links: { label: string; url: string }[];
};
