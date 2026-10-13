import http from 'node:http';
import { createContactHandler } from './contact.mjs';

const contact = createContactHandler();
const server = http.createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  );
  const path = req.url.split('?')[0];
  if (path === '/api/contact') {
    await contact(req, res);
    return;
  }
  let status = 404;
  let data = { message: 'Endpoint not found.' };
  if (path === '/health') {
    if (req.method === 'GET') {
      status = 200;
      data = { ok: true };
    } else {
      status = 405;
      data = { message: 'Method not allowed.' };
      res.setHeader('Allow', 'GET');
    }
  }
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
});
server.listen(
  Number(process.env.PORT || 8091),
  process.env.HOST || '127.0.0.1',
  () => console.log('GCOM contact server ready'),
);
