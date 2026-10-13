import { content, asset, href, membership } from '../content';
import { ContactForm } from '../ContactForm';
export function Contact() {
  const copy = content.contact;
  return (
    <>
      <section className="page-intro container">
        <span className="eyebrow pixel">{copy.intro.eyebrow}</span>
        <h1>{copy.intro.title}</h1>
        <p className="lead">{copy.intro.lead}</p>
      </section>
      <section className="contact-section container">
        <div className="contact-layout">
          <ContactForm />
          <aside className="contact-aside">
            <img
              src={asset(copy.image)}
              alt={copy.image.alt}
              width="192"
              height="192"
            />
            <h2>{copy.sidebar.heading}</h2>
            <p>{copy.sidebar.text}</p>
            <div className="membership-note">
              <h3>{copy.sidebar.joinHeading}</h3>
              <p>{copy.sidebar.joinText}</p>
              <a className="text-link" href={membership}>
                {copy.sidebar.joinLabel} <span aria-hidden="true">↗</span>
              </a>
            </div>
          </aside>
        </div>
      </section>
    </>
  );
}
