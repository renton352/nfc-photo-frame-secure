// api/claim.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  let body: any = req.body || {};
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  const ip = (body.ip || '').trim();
  const cara = (body.cara || '').trim();

  // ざっくりバリデーション（必要なら厳しく）
  const ok = /^[a-z0-9_\-]+$/i;
  if (!ok.test(ip) || !ok.test(cara)) return res.status(400).end();

  // Cookie値は base64url(JSON)。HttpOnly でJSから読めない
  const json = JSON.stringify({ ip, cara });
  const b64 = Buffer.from(json, 'utf8').toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  const maxAge = 60 * 60 * 24 * 180; // 180日

  res.setHeader('Set-Cookie',
    `oshi_profile=${b64}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`
  );
  return res.status(204).end();
}
