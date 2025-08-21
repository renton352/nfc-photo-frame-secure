import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createHmac } from 'crypto'

function bad(res: VercelResponse, code: number, error: string) {
  return res.status(code).json({ ok: false, error })
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return bad(res, 405, 'Method Not Allowed')

  const tag = (req.query.tag as string || '').trim()
  if (!tag) return bad(res, 400, 'tag required')

  const allowed = (process.env.ALLOWED_TAGS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)

  if (allowed.length && !allowed.includes(tag)) {
    return bad(res, 403, 'tag not allowed')
  }

  const secret = process.env.SESSION_SECRET || 'dev-secret'
  const issued = Date.now().toString(36)
  const nonce = Math.random().toString(36).slice(2, 8)
  const sig = createHmac('sha256', secret)
    .update(`${tag}:${issued}:${nonce}`)
    .digest('base64url')

  const sid = `${tag}.${issued}.${nonce}.${sig}`

  res.setHeader('Set-Cookie',
    `sid=${sid}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=3600`
  )

  return res.status(200).json({ ok: true })
}
