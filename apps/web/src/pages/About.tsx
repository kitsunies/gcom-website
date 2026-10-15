import { Fragment } from 'react';
import { asset, href } from '../content';
import { Join } from '../components/Join';
const aboutCopy = {
  intro: {
    title: 'About Us',
    lead: 'We’re GCOM, the Monash University game development club. We bring people together to explore how games are made and create something of their own.',
  },
  sections: [
    {
      heading: 'Ideas are better together.',
      text: 'Our mission is to make game development a shared experience: a place to learn, experiment and find collaborators.',
    },
    {
      heading: 'Bring your curiosity.',
      text: 'You don’t need a finished game or years of experience to get involved. Whether you’re interested in code, art, music, storytelling or design, there’s something to explore.',
    },
  ],
  action: { label: 'Meet the Team', url: 'team/' },
  activitiesLabel: 'Club activities',
  activitiesHeading: 'What we make space for',
  image: { src: 'artwork/green-original-web.webp', alt: '' },
  activities: [
    { name: 'Game jams', text: 'Make something with a team.' },
    { name: 'Workshops', text: 'Learn tools and try new skills.' },
    { name: 'Collaboration', text: 'Find people to build with.' },
    { name: 'Showcases', text: 'Share what you’ve created.' },
  ],
};

export function About() {
  const copy = aboutCopy;
  return (
    <>
      <section className="page-intro container">
        <h1>{copy.intro.title}</h1>
        <p className="lead">{copy.intro.lead}</p>
      </section>
      <section className="about-content container">
        <div className="about-copy">
          {copy.sections.map((section, index) => (
            <Fragment key={index}>
              <h2>{section.heading}</h2>
              <p>{section.text}</p>
            </Fragment>
          ))}
          <a className="button secondary" href={href(copy.action.url)}>
            {copy.action.label} <span aria-hidden="true">→</span>
          </a>
        </div>
        <aside className="about-activities" aria-label={copy.activitiesLabel}>
          <img
            src={asset(copy.image)}
            alt={copy.image.alt}
            width="128"
            height="128"
          />
          <h3>{copy.activitiesHeading}</h3>
          <ul>
            {copy.activities.map((activity, index) => (
              <li key={index}>
                <strong>{activity.name}</strong>
                <span>{activity.text}</span>
              </li>
            ))}
          </ul>
        </aside>
      </section>
      <Join />
    </>
  );
}
