import React from 'react';

export default function AuthGate({ children }:{children:React.ReactNode}) {
  const [ok, setOk] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    const cur = new URL(location.href);
    const needFresh = cur.searchParams.get('from') === 'setup';

    fetch(`/api/auth/check${needFresh ? '?fresh=1' : ''}`, {
      credentials: 'include',
      cache: 'no-store'
    })
      .then(async (r) => {
        if (r.ok) {
          setOk(true);
          // URLをクリーンに（共有・PWA用）
          if (needFresh) {
            const clean = new URL(location.href);
            clean.searchParams.delete('from');
            clean.searchParams.delete('tag');
            history.replaceState(null, '', clean.toString());
          }
        } else {
          let apiTag: string | undefined;
          let reason: string | undefined;
          try {
            const j = await r.json();
            if (j?.tag) apiTag = String(j.tag);
            if (j?.reason) reason = String(j.reason);
          } catch {}

          const u = new URL('/setup', location.origin);
          const char = cur.searchParams.get('char') || undefined;
          const tag  = cur.searchParams.get('tag') || apiTag || undefined;
          if (char) u.searchParams.set('char', char);
          if (tag)  u.searchParams.set('tag', tag);
          if (reason === 'expired') u.searchParams.set('expired', '1'); // メッセージ用
          location.replace(u.toString());
          setOk(false);
        }
      })
      .catch(() => setOk(false));
  }, []);

  if (ok === null) {
    return <div className="min-h-screen grid place-items-center text-white bg-slate-900">確認中...</div>;
  }
  if (!ok) return null;
  return <>{children}</>;
}
