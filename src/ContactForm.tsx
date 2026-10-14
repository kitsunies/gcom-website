import { contact } from './content';

export function ContactForm() {
  return (
    <div className="contact-form-panel">
      <h2>Get in touch</h2>
      <p>
        The contact form is not connected yet. Email us and we’ll get back to
        you.
      </p>
      <a className="button" href={`mailto:${contact}`}>
        Email GCOM <span aria-hidden="true">↗</span>
      </a>
    </div>
  );
}
