import React from 'react';

export default function AuthGate({ children }:{children:React.ReactNode}) {
  const [ok, setOk] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    const url = new URL(location.href);
    const needFresh = url.searchParams.get('from') === 'setup';

    fetch(`/api/auth/check${needFresh ? '?fresh=1' : ''}`, {
      credentials: 'include',
      cache: 'no-store'
    })
      .then(r => setOk(r.ok))
      .catch(() => setOk(false));

    // 認証後に from=setup をURLから除去（ブクマ/PWA用に綺麗に）
    if (needFresh) {
      url.searchParams.delete('from');
      history.replaceState(null, '', url.toString());
    }
  }, []);

  if (!ok) {
    const cur = new URL(location.href);
    const u = new URL('/setup', location.origin);
    const char = cur.searchParams.get('char');
    const tag  = cur.searchParams.get('tag'); // ← 追加
    if (char) u.searchParams.set('char', char);
    if (tag)  u.searchParams.set('tag', tag); // ← 追加
    location.replace(u.toString());
    return null;
  }
