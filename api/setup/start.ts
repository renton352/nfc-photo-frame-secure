// /api/setup/start.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHmac } from 'crypto';

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }

  const tag = (req.query.tag as string) || '';
  if (!tag) return res.status(400).json({ ok: false, error: 'missing tag' });

  // 許可タグの簡易チェック（環境変数 ALLOWED_TAGS にカンマ区切りで登録）
  const allow = (process.env.ALLOWED_TAGS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  if (allow.length && !allow.includes(tag)) {
    return res.status(403).json({ ok: false, error: 'forbidden' });
  }

  // 署名付きセッションIDを発行してクッキーに保存
  const secret = process.env.SESSION_SECRET || 'dev-secret';
  const issued = Date.now().toString(36);
  const nonce = Math.random().toString(36).slice(2);
  const sig = createHmac('sha256', secret).update(`${tag}:${issued}:${nonce}`).digest('base64url');
  const sid = [tag, issued, nonce, sig].join('.');

  const isProd = process.env.VERCEL_ENV === 'production';
  res.setHeader(
    'Set-Cookie',
    `sid=${encodeURIComponent(sid)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400; ${isProd ? 'Secure' : ''}`
  );

  return res.status(200).json({ ok: true });
}
