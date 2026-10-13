import { isIP } from 'node:net';
import nodemailer from 'nodemailer';

const unavailable =
  'Message delivery is temporarily unavailable. Please email us directly.';
const controls = /[\u0000-\u001f\u007f-\u009f]/;
const bodyControls = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/;
const windowMs = 10 * 60 * 1000;

function email(value) {
  if (typeof value !== 'string' || value.length > 254 || controls.test(value))
    return false;
  const parts = value.split('@');
  return (
    parts.length === 2 &&
    parts[0].length <= 64 &&
    /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/i.test(
      parts[0],
    ) &&
    parts[1].includes('.') &&
    parts[1]
      .split('.')
      .every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label))
  );
}

function validate(data) {
  if (
    !data ||
    typeof data !== 'object' ||
    Array.isArray(data) ||
    Object.keys(data).some(
      (key) =>
        !['name', 'email', 'subject', 'message', 'website'].includes(key),
    )
  )
    return null;
  for (const [key, max, required] of [
    ['name', 100, true],
    ['subject', 150, false],
    ['message', 5000, true],
    ['website', 200, false],
  ]) {
    const value = data[key];
    if (value === undefined && !required) continue;
    if (
      typeof value !== 'string' ||
      value.length > max ||
      (required && !value.trim()) ||
      (key === 'message' ? bodyControls : controls).test(value)
    )
      return null;
  }
  if (!email(data.email) || data.website?.trim()) return null;
  return {
    name: data.name.trim(),
    email: data.email,
    subject: data.subject?.trim() || 'Website contact',
    message: data.message.trim(),
  };
}

function readJSON(req) {
  return new Promise((resolve, reject) => {
    let size = 0,
      chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 16384) {
        chunks = [];
        reject({ status: 413, message: 'Message is too large.' });
      } else chunks.push(chunk);
    });
    req.on('end', () => {
      if (size > 16384) return;
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject({ status: 400, message: 'Invalid JSON.' });
      }
    });
    req.on('error', () =>
      reject({ status: 400, message: 'Unable to read this message.' }),
    );
    req.on('aborted', () =>
      reject({ status: 400, message: 'Unable to read this message.' }),
    );
  });
}

export function createContactHandler({
  env = process.env,
  createTransport = nodemailer.createTransport,
  now = Date.now,
} = {}) {
  const allowedOrigin =
    env.CONTACT_ALLOWED_ORIGIN || 'https://gcom.techtom.tech';
  let originReady = false;
  try {
    const url = new URL(allowedOrigin);
    originReady =
      ['http:', 'https:'].includes(url.protocol) &&
      url.origin === allowedOrigin;
  } catch {}
  const trustedProxies = new Set(
    (env.CONTACT_TRUSTED_PROXY_IPS || '')
      .split(',')
      .map((ip) => ip.trim())
      .filter((ip) => isIP(ip)),
  );
  const recipient = env.CONTACT_RECIPIENT || 'kitsunies@gmail.com';
  const from = env.CONTACT_SMTP_FROM;
  const host = env.CONTACT_SMTP_HOST;
  const port = Number(env.CONTACT_SMTP_PORT || 587);
  const smtpReady =
    typeof host === 'string' &&
    host.length <= 253 &&
    (isIP(host) || /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(host)) &&
    Number.isInteger(port) &&
    port > 0 &&
    port <= 65535 &&
    email(from) &&
    email(recipient) &&
    typeof env.CONTACT_SMTP_USER === 'string' &&
    !!env.CONTACT_SMTP_USER.trim() &&
    env.CONTACT_SMTP_USER.length <= 512 &&
    !controls.test(env.CONTACT_SMTP_USER) &&
    typeof env.CONTACT_SMTP_PASS === 'string' &&
    !!env.CONTACT_SMTP_PASS.trim() &&
    env.CONTACT_SMTP_PASS.length <= 4096;
  let transport;
  // shortcut: limits are per Node process and reset on restart, use a shared limiter before adding replicas.
  const clients = new Map();
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Vary', 'Origin');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const send = (message, status) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(status === 200 ? { ok: true } : { message }));
    };
    try {
      if (!originReady || req.headers.origin !== allowedOrigin) {
        send('Origin denied.', 403);
        return;
      }
      res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
      if (req.method === 'OPTIONS') {
        const headers = (req.headers['access-control-request-headers'] || '')
          .toLowerCase()
          .split(',')
          .map((header) => header.trim())
          .filter(Boolean);
        if (
          req.headers['access-control-request-method'] !== 'POST' ||
          headers.some((header) => header !== 'content-type')
        ) {
          send('Preflight denied.', 403);
          return;
        }
        res.setHeader('Access-Control-Allow-Methods', 'POST');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        res.writeHead(204);
        res.end();
        return;
      }
      if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST, OPTIONS');
        send('Method not allowed.', 405);
        return;
      }
      const time = now();
      for (const [ip, bucket] of clients)
        if (bucket.expires <= time) clients.delete(ip);
      const peer =
        req.socket.remoteAddress?.replace(/^::ffff:/, '') || 'unknown';
      const forwarded = req.headers['x-forwarded-for'];
      const ip =
        trustedProxies.has(peer) &&
        typeof forwarded === 'string' &&
        isIP(forwarded.trim())
          ? forwarded.trim()
          : peer;
      let bucket = clients.get(ip);
      if ((!bucket && clients.size >= 1000) || bucket?.count >= 5) {
        res.setHeader(
          'Retry-After',
          String(
            Math.max(
              1,
              Math.ceil(((bucket?.expires || time + windowMs) - time) / 1000),
            ),
          ),
        );
        send(
          'Too many messages. Please try again later or email us directly.',
          429,
        );
        return;
      }
      if (!bucket) {
        bucket = { count: 0, expires: time + windowMs };
        clients.set(ip, bucket);
      }
      bucket.count++;
      if (
        !/^application\/json(?:\s*;\s*charset=utf-8)?\s*$/i.test(
          req.headers['content-type'] || '',
        )
      ) {
        send('Use application/json.', 415);
        return;
      }
      const data = validate(await readJSON(req));
      if (!data) {
        send('Please check your name, email, subject and message.', 400);
        return;
      }
      if (!smtpReady) {
        send(unavailable, 503);
        return;
      }
      try {
        transport ||= createTransport({
          host,
          port,
          secure: port === 465,
          requireTLS: true,
          auth: { user: env.CONTACT_SMTP_USER, pass: env.CONTACT_SMTP_PASS },
          connectionTimeout: 10000,
          greetingTimeout: 10000,
          socketTimeout: 15000,
          disableFileAccess: true,
          disableUrlAccess: true,
          logger: false,
          debug: false,
        });
        const result = await transport.sendMail({
          from,
          to: recipient,
          replyTo: data.email,
          envelope: { from, to: [recipient] },
          subject: `GCOM contact: ${data.subject}`,
          text: `Name: ${data.name}\nEmail: ${data.email}\nSubject: ${data.subject}\n\n${data.message}`,
        });
        if (
          !result?.accepted?.some(
            (address) =>
              typeof address === 'string' &&
              address.toLowerCase() === recipient.toLowerCase(),
          )
        )
          throw new Error('Recipient not accepted');
      } catch {
        send(
          'Your message could not be delivered. Please try again or email us directly.',
          502,
        );
        return;
      }
      send('', 200);
    } catch (error) {
      send(error.status ? error.message : unavailable, error.status || 503);
    }
  };
}
