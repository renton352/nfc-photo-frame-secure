import React from 'react'

function getQuery() {
  const u = new URL(location.href)
  return {
    from: u.searchParams.get('from') || '',
    fresh: u.searchParams.get('fresh') || '',
    char: u.searchParams.get('char') || ''
  }
}

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [{ ok, reason, loading }, set] = React.useState({ ok: false, reason: '', loading: true })

  React.useEffect(() => {
    const q = getQuery()
    const params = new URLSearchParams()
    if (q.from === 'setup' && q.fresh === '1') params.set('fresh', '1')

    fetch(`/api/auth/check?${params.toString()}`, { method: 'GET' })
      .then(r => r.json())
      .then(j => set({ ok: !!j.ok, reason: j.reason || '', loading: false }))
      .catch(() => set({ ok: false, reason: 'network', loading: false }))
  }, [])

  if (loading) {
    return <div style={{ padding: 24 }}>確認中…</div>
  }

  if (!ok) {
    // 期限切れ等。セットアップへ戻す（メッセージ付き）
    const q = getQuery()
    const back = new URL(location.origin + `/setup?char=${encodeURIComponent(q.char)}&expired=1`)
    history.replaceState({}, '', back)
    location.reload()
    return null
  }

  return <>{children}</>
}
