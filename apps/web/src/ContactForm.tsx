import { Icon } from './components/Icon';
import { useRef, useState, type FormEvent } from 'react';
import { contact, contactEndpoint } from './content';

const formCopy = {
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
};

export function ContactForm() {
  const copy = formCopy;
  const [status, setStatus] = useState<
    'idle' | 'sending' | 'success' | 'error'
  >('idle');
  const [feedback, setFeedback] = useState('');
  const [emailLink, setEmailLink] = useState(`mailto:${contact}`);
  const notice = useRef<HTMLDivElement>(null);
  const sending = useRef(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending.current) return;
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form)) as Record<
      string,
      string
    >;
    setEmailLink(
      `mailto:${contact}?subject=${encodeURIComponent(values.subject || copy.defaultSubject)}&body=${encodeURIComponent(`${values.message}\n\nFrom: ${values.name}\nReply to: ${values.email}`)}`,
    );
    sending.current = true;
    setStatus('sending');
    setFeedback(copy.sending);
    try {
      if (!contactEndpoint) throw new Error(copy.unavailable);
      const response = await fetch(contactEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
        signal: AbortSignal.timeout(20000),
        credentials: 'omit',
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || result?.ok !== true) {
        const message =
          response.status === 429
            ? copy.rateLimited
            : response.status === 400
              ? copy.invalid
              : response.status === 413
                ? copy.tooLarge
                : copy.failed;
        throw new Error(message);
      }
      setStatus('success');
      setFeedback(copy.success);
      form.reset();
      setEmailLink(`mailto:${contact}`);
    } catch (error) {
      setStatus('error');
      setFeedback(
        error instanceof Error &&
          error.name !== 'TypeError' &&
          error.name !== 'TimeoutError'
          ? error.message
          : copy.unreachable,
      );
    } finally {
      sending.current = false;
      requestAnimationFrame(() => notice.current?.focus());
    }
  }
  return (
    <div className="contact-form-panel">
      <h2>{copy.heading}</h2>
      <p className="form-introduction">{copy.introduction}</p>
      <form
        onSubmit={submit}
        aria-label={copy.label}
        aria-busy={status === 'sending'}
      >
        <fieldset disabled={status === 'sending'}>
          <legend className="sr-only">{copy.legend}</legend>
          <div className="form-row">
            <label htmlFor="contact-name">
              {copy.nameLabel}
              <input
                id="contact-name"
                name="name"
                type="text"
                autoComplete="name"
                required
                maxLength={80}
              />
            </label>
            <label htmlFor="contact-email">
              {copy.emailLabel}
              <input
                id="contact-email"
                name="email"
                type="email"
                autoComplete="email"
                required
                maxLength={254}
                aria-describedby="contact-email-help"
              />
            </label>
          </div>
          <p className="field-help" id="contact-email-help">
            {copy.emailHelp}
          </p>
          <label htmlFor="contact-subject">
            {copy.subjectLabel}{' '}
            <span className="optional-label">{copy.optionalLabel}</span>
            <input
              id="contact-subject"
              name="subject"
              type="text"
              maxLength={120}
            />
          </label>
          <label htmlFor="contact-message">
            {copy.messageLabel}
            <textarea
              id="contact-message"
              name="message"
              required
              minLength={10}
              maxLength={5000}
              rows={6}
              placeholder={copy.messagePlaceholder}
            />
          </label>
          <div className="honeypot" aria-hidden="true">
            <label htmlFor="contact-website">
              {copy.honeypotLabel}
              <input
                id="contact-website"
                name="website"
                type="text"
                tabIndex={-1}
                autoComplete="off"
              />
            </label>
          </div>
          <button className="button" type="submit">
            {status === 'sending' ? copy.sendingLabel : copy.sendLabel}{' '}
            <span aria-hidden="true">→</span>
          </button>
        </fieldset>
        {status !== 'idle' ? (
          <div
            className={`form-feedback ${status}`}
            ref={notice}
            tabIndex={-1}
            role={status === 'error' ? 'alert' : 'status'}
          >
            {feedback}
          </div>
        ) : null}
      </form>
      <p className="direct-email">
        {copy.directPrompt}{' '}
        <a href={emailLink}>
          {copy.directLabel} <Icon name="arrow-up-right" />
        </a>
      </p>
    </div>
  );
}
