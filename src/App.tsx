import React from 'react'
import Setup from './Setup'
import AuthGate from './AuthGate'

function usePath() {
  const [p, setP] = React.useState(location.pathname + location.search)
  React.useEffect(() => {
    const h = () => setP(location.pathname + location.search)
    window.addEventListener('popstate', h)
    return () => window.removeEventListener('popstate', h)
  }, [])
  return p
}

export default function App() {
  const path = usePath()

  if (location.pathname === '/setup') {
    return <Setup />
  }

  if (location.pathname === '/frame') {
    return (
      <AuthGate>
        <div style={{ padding: 24 }}>
          <h1>フレーム起動中</h1>
          <p>ようこそ！コンテンツ本体はここに置きます。</p>
        </div>
      </AuthGate>
    )
  }

  // デフォルトはセットアップへ
  return <Setup />
}
