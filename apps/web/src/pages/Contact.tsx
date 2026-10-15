import { Icon } from '../components/Icon';
import { asset, membership } from '../content';
import { ContactForm } from '../ContactForm';
const contactCopy = {
  intro: {
    title: 'Contact',
    lead: 'Have a question, an idea for a collaboration or something you’d like to share with the club?',
  },
  image: { src: 'artwork/yellow-original-web.webp', alt: '' },
  sidebar: {
    heading: 'Say hello.',
    text: 'Game dev questions, club enquiries or an idea you can’t stop thinking about: we’d love to hear it.',
    joinHeading: 'Ready to join?',
    joinText: 'You can join directly through the Monash Student Association.',
    joinLabel: 'Join the Club',
  },
  form: {
    heading: 'Send us a message.',
    introduction:
      'Tell us what’s on your mind. All fields except the subject are required.',
    label: 'Contact GCOM',
    legend: 'Your message to GCOM',
    nameLabel: 'Your name',
    emailLabel: 'Email address',
    emailHelp: 'We’ll use your email to reply to this message.',
    subjectLabel: 'Subject',
    optionalLabel: '(optional)',
    messageLabel: 'Your message',
    messagePlaceholder: 'Tell us a little about your question or idea…',
    honeypotLabel: 'Leave this field empty',
    sendLabel: 'Send message',
    sendingLabel: 'Sending…',
    directPrompt: 'Prefer email?',
    directLabel: 'Email us directly',
    defaultSubject: 'GCOM enquiry',
    sending: 'Sending your message…',
    unavailable:
      'Message delivery is temporarily unavailable. You can send your message using the email link below.',
    rateLimited:
      'Too many messages in a short time. Please try again later, or email us directly.',
    invalid: 'Please check your name, email, subject and message.',
    tooLarge: 'Message is too large.',
    failed:
      'We couldn’t send your message right now. Your draft is still here. Try again, or use the email link below.',
    success:
      'Message sent. Thanks for getting in touch! We’ll reply to the email address you provided.',
    unreachable:
      'We couldn’t reach the message service. Your draft is still here. Try again, or use the email link below.',
  },
};

export function Contact() {
  const copy = contactCopy;
  return (
    <>
      <section className="page-intro container">
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
                {copy.sidebar.joinLabel} <Icon name="arrow-up-right" />
              </a>
            </div>
          </aside>
        </div>
      </section>
    </>
  );
}
