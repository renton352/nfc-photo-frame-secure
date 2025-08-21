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
      setMsg('�^�O��񂪂���܂���i?tag= ���K�v�j')
      setState('error')
      return
    }
    setState('working')
    setMsg('�m�F��...')

    try {
      const r = await fetch(`/api/setup/start?tag=${encodeURIComponent(tag)}`, { method: 'GET' })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error || 'setup failed')

      // ����� 1 ���������ۂ����߁A?from=setup&fresh=1 ��t�^���đJ��
      const to = new URL(location.origin + `/frame?char=${encodeURIComponent(char)}&from=setup&fresh=1`)
      history.pushState({}, '', to)
      location.reload()
    } catch (e: any) {
      setState('error')
      setMsg(e?.message || '�ʐM�Ɏ��s���܂���')
    }
  }

  return (
    <div style={{ maxWidth: 520, margin: '48px auto', color: '#e6e6e6', fontFamily: 'system-ui, sans-serif' }}>
      <h1>�����ݒ�i1�񂾂��j</h1>
      <p>PWA ���͌�ŁB�܂��� NFC �^�O����N���ł��邩���m�F���܂��B</p>

      <div style={{ background: '#192132', padding: 16, borderRadius: 8, marginTop: 16 }}>
        <ol>
          <li>�u���E�U�ł��̃y�[�W���J���iNFC�^�b�`�őJ�ځj</li>
          <li>���́u�L�����t���[���N���v������</li>
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
          �L�����t���[���N��
        </button>
        <div style={{ marginTop: 12, minHeight: 24 }}>
          {state !== 'idle' && <span>{msg}</span>}
        </div>
        <div style={{ marginTop: 8, opacity: .7, fontSize: 12 }}>
          ���: {state} / �^�O: {tag || '(�Ȃ�)'} / �L����: {char || '(�Ȃ�)'}
        </div>
      </div>
    </div>
  )
}
