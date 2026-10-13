import { content, asset, href } from '../content';
import { Join } from '../components/Join';
export function Team() {
  const copy = content.team;
  const { members } = copy;
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
                          {link.label} <span aria-hidden="true">↗</span>
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
