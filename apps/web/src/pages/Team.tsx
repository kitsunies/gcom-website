import { Icon } from '../components/Icon';
import { asset } from '../content';
import roster from '../generated/roster.json';
import type { TeamMember } from '../site-content';
import { Join } from '../components/Join';
const copy = {
  intro: {
    eyebrow: 'THE PEOPLE BEHIND THE PLAY',
    title: 'Meet the Team',
    lead: 'Meet the committee bringing GCOM’s activities and community together.',
  },
  label: 'Current committee',
  linksLabel: 'public links',
  emptyHeading: 'The team roster is on its way.',
  emptyText:
    'Committee profiles will appear here once the roster has been approved and published.',
  image: { src: 'artwork/purple-original-web.webp', alt: '' },
};

export function Team() {
  const members = (roster as { members: TeamMember[] }).members;
  return (
    <>
      <section className="page-intro container">
        <span className="eyebrow pixel">{copy.intro.eyebrow}</span>
        <h1>{copy.intro.title}</h1>
        <p className="lead">{copy.intro.lead}</p>
      </section>
      <section className="team-section container" aria-label={copy.label}>
        {members.length ? (
          <div className="team-grid">
            {members.map((member) => (
              <article className="team-card" key={member.id}>
                {member.photo ? (
                  <img
                    className="profile-photo"
                    src={asset(member.photo)}
                    alt={member.photo.alt || member.name}
                    width="400"
                    height="400"
                    loading="lazy"
                  />
                ) : (
                  <div className="photo-placeholder pixel" aria-hidden="true">
                    {member.name.charAt(0)}
                  </div>
                )}
                <h2>{member.name}</h2>
                <p>{member.role}</p>
                {member.links?.length ? (
                  <ul aria-label={`${member.name} ${copy.linksLabel}`}>
                    {member.links.map((link) => (
                      <li key={link.url}>
                        <a href={link.url}>
                          {link.label} <Icon name="arrow-up-right" />
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <img
              src={asset(copy.image)}
              alt={copy.image.alt}
              width="96"
              height="96"
            />
            <div>
              <h2>{copy.emptyHeading}</h2>
              <p>{copy.emptyText}</p>
            </div>
          </div>
        )}
      </section>
      <Join />
    </>
  );
}
