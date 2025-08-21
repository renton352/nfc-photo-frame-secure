// api/setup/start.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHmac, randomBytes } from 'crypto';

function setCookie(res: VercelResponse, name: string, value: string, maxAgeSec: number) {
  const cookie = [`${name}=${value}`, 'Path=/', 'HttpOnly', 'Secure', 'SameSite=Lax', `Max-Age=${maxAgeSec}`].join('; ');
  const prev = res.getHeader('Set-Cookie');
  const arr = prev ? (Array.isArray(prev) ? prev : [String(prev)]) : [];
  arr.push(cookie);
  res.setHeader('Set-Cookie', arr);
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  res.setHeader('Cache-Control', 'no-store');

  const tag = String((req.query.tag ?? (req.body as any)?.tag ?? '')).trim();
  if (!tag) return res.status(400).json({ ok: false, error: 'tag required' });

  const allowed = (process.env.ALLOWED_TAGS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!allowed.includes(tag)) return res.status(403).json({ ok: false, error: 'invalid tag' });

  const secret = process.env.SESSION_SECRET || 'dev-secret';
  const iat = Date.now();                          // 発行時刻
  const jti = randomBytes(8).toString('hex');      // 一意ID
  const payload = `${tag}.${iat}.${jti}`;
  const sig = createHmac('sha256', secret).update(payload).digest('base64url');

  // snonce = tag.iat.jti.sig （60秒）
  setCookie(res, 'snonce', `${payload}.${sig}`, 60);

  return res.status(200).json({ ok: true, iat });
}
