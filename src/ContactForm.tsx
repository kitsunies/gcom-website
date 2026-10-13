import { useRef, useState, type FormEvent } from 'react';
import { contact, contactEndpoint } from './content';

export function ContactForm() {
  const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [feedback, setFeedback] = useState('');
  const [emailLink, setEmailLink] = useState(`mailto:${contact}`);
  const notice = useRef<HTMLDivElement>(null);
  const sending = useRef(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending.current) return;
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form)) as Record<string, string>;
    setEmailLink(`mailto:${contact}?subject=${encodeURIComponent(values.subject || 'GCOM enquiry')}&body=${encodeURIComponent(`${values.message}\n\nFrom: ${values.name}\nReply to: ${values.email}`)}`);
    sending.current = true;
    setStatus('sending');
    setFeedback('Sending your message…');
    try {
      if (!contactEndpoint) throw new Error('Message delivery is temporarily unavailable. You can send your message using the email link below.');
      const response = await fetch(contactEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values), signal: AbortSignal.timeout(20000), credentials: 'omit' });
      const result = await response.json().catch(() => null);
      if (!response.ok || result?.ok !== true) {
        const message = response.status === 429 ? 'Too many messages in a short time. Please try again later, or email us directly.' : [400, 413].includes(response.status) && typeof result?.message === 'string' ? result.message : 'We couldn’t send your message right now. Your draft is still here. Try again, or use the email link below.';
        throw new Error(message);
      }
      setStatus('success');
      setFeedback('Message sent. Thanks for getting in touch! We’ll reply to the email address you provided.');
      form.reset();
      setEmailLink(`mailto:${contact}`);
    } catch (error) {
      setStatus('error');
      setFeedback(error instanceof Error && error.name !== 'TypeError' && error.name !== 'TimeoutError' ? error.message : 'We couldn’t reach the message service. Your draft is still here. Try again, or use the email link below.');
    } finally {
      sending.current = false;
      requestAnimationFrame(() => notice.current?.focus());
    }
  }
  return <div className="contact-form-panel"><h2>Send us a message.</h2><p className="form-introduction">Tell us what’s on your mind. All fields except the subject are required.</p>
    <form onSubmit={submit} aria-label="Contact GCOM" aria-busy={status === 'sending'}>
      <fieldset disabled={status === 'sending'}><legend className="sr-only">Your message to GCOM</legend>
        <div className="form-row"><label htmlFor="contact-name">Your name<input id="contact-name" name="name" type="text" autoComplete="name" required maxLength={80} /></label><label htmlFor="contact-email">Email address<input id="contact-email" name="email" type="email" autoComplete="email" required maxLength={254} aria-describedby="contact-email-help" /></label></div>
        <p className="field-help" id="contact-email-help">We’ll use your email to reply to this message.</p>
        <label htmlFor="contact-subject">Subject <span className="optional-label">(optional)</span><input id="contact-subject" name="subject" type="text" maxLength={120} /></label>
        <label htmlFor="contact-message">Your message<textarea id="contact-message" name="message" required minLength={10} maxLength={5000} rows={6} placeholder="Tell us a little about your question or idea…" /></label>
        <div className="honeypot" aria-hidden="true"><label htmlFor="contact-website">Leave this field empty<input id="contact-website" name="website" type="text" tabIndex={-1} autoComplete="off" /></label></div>
        <button className="button" type="submit">{status === 'sending' ? 'Sending…' : 'Send message'} <span aria-hidden="true">→</span></button>
      </fieldset>
      {status !== 'idle' ? <div className={`form-feedback ${status}`} ref={notice} tabIndex={-1} role={status === 'error' ? 'alert' : 'status'}>{feedback}</div> : null}
    </form>
    <p className="direct-email">Prefer email? <a href={emailLink}>Email us directly <span aria-hidden="true">↗</span></a></p>
  </div>;
}
