import type { VercelRequest, VercelResponse } from '@vercel/node';
import { randomBytes, createHmac } from 'crypto';

function appendSetCookie(res: VercelResponse, value: string) {
  const prev = res.getHeader('Set-Cookie');
  const arr = prev ? (Array.isArray(prev) ? prev : [String(prev)]) : [];
  arr.push(value);
  res.setHeader('Set-Cookie', arr);
}

function setCookie(res: VercelResponse, name: string, value: string, maxAgeSec: number) {
  const cookie = [
    `${name}=${value}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    `Max-Age=${maxAgeSec}`
  ].join('; ');
  appendSetCookie(res, cookie);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method Not Allowed' });

  res.setHeader('Cache-Control', 'no-store');

  const tag = (req.query.tag || (req.body as any)?.tag) as string | undefined;
  if (!tag) return res.status(400).json({ ok: false, error: 'tag required' });

  const allowed = (process.env.ALLOWED_TAGS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!allowed.includes(tag)) return res.status(403).json({ ok: false, error: 'invalid tag' });

  const secret = process.env.SESSION_SECRET || 'dev-secret';
  const nonce = randomBytes(8).toString('hex');
  const issued = Date.now().toString(36);
  const payload = `${tag}.${issued}.${nonce}`;
  const sig = createHmac('sha256', secret).update(payload).digest('base64url');
  const sid = `${payload}.${sig}`;

  // 両方とも確実にセット（上書きしない）
  setCookie(res, 'sid', sid, 60 * 60 * 24 * 30); // 30日
  setCookie(res, 'fresh', '1', 60);              // 1分

  res.status(200).json({ ok: true });
}
