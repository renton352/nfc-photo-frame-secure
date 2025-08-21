import React from 'react'

function q<T extends string>(k: T) {
  return new URL(location.href).searchParams.get(k) || ''
}

export default function Setup() {
  const tag = q('tag')
  const char = q('char')

  const [state, setState] = React.useState<'idle' | 'working' | 'done' | 'error'>('idle')
  const [msg, setMsg] = React.useState<string>('')

  const start = async () => {
    if (!tag) {
      setMsg('タグ情報がありません（?tag= が必要）')
      setState('error')
      return
    }
    setState('working')
    setMsg('確認中...')

    try {
      const r = await fetch(`/api/setup/start?tag=${encodeURIComponent(tag)}`, { method: 'GET' })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error || 'setup failed')

      // 初回は 1 分制限を課すため、?from=setup&fresh=1 を付与して遷移
      const to = new URL(location.origin + `/frame?char=${encodeURIComponent(char)}&from=setup&fresh=1`)
      history.pushState({}, '', to)
      location.reload()
    } catch (e: any) {
      setState('error')
      setMsg(e?.message || '通信に失敗しました')
    }
  }

  return (
    <div style={{ maxWidth: 520, margin: '48px auto', color: '#e6e6e6', fontFamily: 'system-ui, sans-serif' }}>
      <h1>初期設定（1回だけ）</h1>
      <p>PWA 化は後で。まずは NFC タグから起動できるかを確認します。</p>

      <div style={{ background: '#192132', padding: 16, borderRadius: 8, marginTop: 16 }}>
        <ol>
          <li>ブラウザでこのページを開く（NFCタッチで遷移）</li>
          <li>下の「キャラフレーム起動」を押す</li>
        </ol>
      </div>

      <div style={{ marginTop: 24 }}>
        <button
          onClick={start}
          disabled={state === 'working'}
          style={{
            background: '#10b981', color: '#0b1220', border: 0,
            padding: '12px 20px', borderRadius: 8, fontWeight: 700, cursor: 'pointer'
          }}
        >
          キャラフレーム起動
        </button>
        <div style={{ marginTop: 12, minHeight: 24 }}>
          {state !== 'idle' && <span>{msg}</span>}
        </div>
        <div style={{ marginTop: 8, opacity: .7, fontSize: 12 }}>
          状態: {state} / タグ: {tag || '(なし)'} / キャラ: {char || '(なし)'}
        </div>
      </div>
    </div>
  )
}
