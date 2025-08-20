import React from 'react';

export default function AuthGate({ children }:{children:React.ReactNode}) {
  const [ok, setOk] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    const cur = new URL(location.href);
    const needFresh = cur.searchParams.get('from') === 'setup';

    fetch(`/api/auth/check${needFresh ? '?fresh=1' : ''}`, {
      credentials: 'include',
      cache: 'no-store'
    }).then(async (r) => {
      if (r.ok) {
        setOk(true);
      } else {
        let apiTag: string | undefined;
        try {
          const j = await r.json();
          if (j?.tag) apiTag = String(j.tag);
        } catch {}
        const u = new URL('/setup', location.origin);
        const char = cur.searchParams.get('char') || undefined;
        const tag  = cur.searchParams.get('tag') || apiTag || undefined; // ← 必ず tag を引き継ぐ
        if (char) u.searchParams.set('char', char);
        if (tag)  u.searchParams.set('tag', tag);
        location.replace(u.toString());
        setOk(false);
      }
    }).catch(() => setOk(false));

    // 認証後は URL をクリーンに
    if (needFresh) {
      cur.searchParams.delete('from');
      history.replaceState(null, '', cur.toString());
    }
  }, []);

  if (ok === null) {
    return <div className="min-h-screen grid place-items-center text-white bg-slate-900">確認中...</div>;
  }
  if (!ok) return null;
  return <>{children}</>;
}
