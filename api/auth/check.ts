import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createHmac } from 'crypto'

function getCookie(req: VercelRequest, key: string): string {
  const raw = (req.headers.cookie || '')
  const hit = raw.split(';').map(s => s.trim()).find(s => s.startsWith(key + '='))
  return hit ? decodeURIComponent(hit.split('=').slice(1).join('=')) : ''
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method Not Allowed' })

  const sid = getCookie(req, 'sid')
  if (!sid) return res.status(200).json({ ok: false })

  const secret = process.env.SESSION_SECRET || 'dev-secret'
  const parts = sid.split('.')
  if (parts.length < 4) return res.status(200).json({ ok: false })

  const [tag, issuedBase36, nonce, sig] = parts
  const expected = createHmac('sha256', secret).update(`${tag}:${issuedBase36}:${nonce}`).digest('base64url')
  if (sig !== expected) return res.status(200).json({ ok: false })

  // セットアップ直後の1分制限: /frame?from=setup&fresh=1 の時だけ適用
  if ((req.query.fresh as string) === '1') {
    const issuedMs = parseInt(issuedBase36, 36)
    if (!Number.isFinite(issuedMs)) return res.status(200).json({ ok: false })
    if (Date.now() - issuedMs > 60_000) {
      return res.status(200).json({ ok: false, reason: 'expired', tag })
    }
  }

  return res.status(200).json({ ok: true })
}
