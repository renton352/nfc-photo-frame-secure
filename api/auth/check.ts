import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHmac } from 'crypto';

function parseCookie(req: VercelRequest, key: string): string | undefined {
  const raw = req.headers.cookie || '';
  const m = raw.split(';').map(s => s.trim()).find(s => s.startsWith(key + '='));
  return m ? decodeURIComponent(m.split('=').slice(1).join('=')) : undefined;
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  const sid = parseCookie(req, 'sid');
  if (!sid) return res.status(401).json({ ok: false });

  const secret = process.env.SESSION_SECRET || 'dev-secret';
  const parts = sid.split('.');
  if (parts.length < 4) return res.status(401).json({ ok: false });
  const [tag, issued, nonce, sig] = [parts[0], parts[1], parts[2], parts[3]];
  const expected = createHmac('sha256', secret).update(`${tag}.${issued}.${nonce}`).digest('base64url');
  if (sig !== expected) return res.status(401).json({ ok: false });

  // ★追加：?fresh=1 のときだけ、1分クッキーを要求
  const needFresh = req.query.fresh === '1';
  if (needFresh) {
    const fresh = parseCookie(req, 'fresh');
    if (!fresh) return res.status(401).json({ ok: false, reason: 'expired' });
  }

  return res.status(200).json({ ok: true });
}
