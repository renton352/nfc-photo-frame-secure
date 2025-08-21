// api/bootstrap.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';

function fromB64url(s: string) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = s.length % 4 ? '='.repeat(4 - (s.length % 4)) : '';
  return Buffer.from(s + pad, 'base64').toString('utf8');
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  const cookie = req.headers.cookie || '';
  const m = cookie.match(/(?:^|;\s*)oshi_profile=([^;]+)/);
  if (!m) return res.status(204).end();
  try {
    const payload = JSON.parse(fromB64url(m[1]));
    if (payload?.ip && payload?.cara) return res.status(200).json({ ip: payload.ip, cara: payload.cara });
  } catch {}
  return res.status(204).end();
}
