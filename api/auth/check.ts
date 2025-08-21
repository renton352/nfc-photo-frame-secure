// /api/auth/check.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHmac } from 'crypto';

function getCookie(req: VercelRequest, key: string) {
  const raw = req.headers.cookie || '';
  const hit = raw.split(';').map(s => s.trim()).find(s => s.startsWith(key + '='));
  return hit ? decodeURIComponent(hit.split('=').slice(1).join('=')) : '';
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  const sid = getCookie(req, 'sid');
  if (!sid) return res.status(200).json({ ok: false });

  const [tag, issued, nonce, sig] = sid.split('.');
  if (!tag || !issued || !nonce || !sig) return res.status(200).json({ ok: false });

  const secret = process.env.SESSION_SECRET || 'dev-secret';
  const expected = createHmac('sha256', secret).update(`${tag}:${issued}:${nonce}`).digest('base64url');
  if (sig !== expected) return res.status(200).json({ ok: false });

  return res.status(200).json({ ok: true });
}
