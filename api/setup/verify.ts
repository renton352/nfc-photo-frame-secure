// api/setup/verify.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { randomBytes, createHmac } from 'crypto';

function getCookie(req: VercelRequest, key: string) {
  const raw = req.headers.cookie || '';
  const hit = raw.split(';').map(s => s.trim()).find(s => s.startsWith(key + '='));
  return hit ? decodeURIComponent(hit.split('=').slice(1).join('=')) : undefined;
}
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

  // 1) snonce を検証（必須）
  const snonce = getCookie(req, 'snonce');
  if (!snonce) return res.status(401).json({ ok: false, reason: 'no_snonce' });

  const secret = process.env.SESSION_SECRET || 'dev-secret';
  const parts = snonce.split('.');
  if (parts.length !== 4) return res.status(401).json({ ok: false, reason: 'bad_snonce' });

  const [tagIn, iatStr, jti, sig] = parts;
  const expected = createHmac('sha256', secret).update(`${tagIn}.${iatStr}.${jti}`).digest('base64url');
  if (sig !== expected) return res.status(401).json({ ok: false, reason: 'bad_sig' });

  const iat = Number(iatStr);
  if (!Number.isFinite(iat) || Date.now() - iat > 60_000) {
    return res.status(401).json({ ok: false, reason: 'expired' });
  }
  if (tagIn !== tag) return res.status(401).json({ ok: false, reason: 'tag_mismatch' });

  // 2) tag 自体も許可リスト確認（ダブルチェック）
  const allowed = (process.env.ALLOWED_TAGS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!allowed.includes(tag)) return res.status(403).json({ ok: false, error: 'invalid tag' });

  // 3) 条件OK  → sid を発行
  const nonce = randomBytes(8).toString('hex');
  const issued = Date.now().toString(36);
  const payload = `${tag}.${issued}.${nonce}`;
  const sessionSig = createHmac('sha256', secret).update(payload).digest('base64url');
  const sid = `${payload}.${sessionSig}`;

  setCookie(res, 'sid', sid, 60 * 60 * 24 * 30); // 30日
  return res.status(200).json({ ok: true });
}
