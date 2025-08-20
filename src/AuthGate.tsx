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

  if (ok === null) {
    return <div className="min-h-screen grid place-items-center text-white bg-slate-900">確認中...</div>;
  }
  if (!ok) {
    const u = new URL('/setup', location.origin);
    const char = new URL(location.href).searchParams.get('char');
    if (char) u.searchParams.set('char', char);
    location.replace(u.toString());
    return null;
  }
  return <>{children}</>;
}
