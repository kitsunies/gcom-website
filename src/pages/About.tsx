import { Fragment } from 'react';
import { content, asset, href } from '../content';
import { Join } from '../components/Join';
export function About() {
  const copy = content.about;
  return (
    <>
      <section className="page-intro container">
        <span className="eyebrow pixel">{copy.intro.eyebrow}</span>
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
