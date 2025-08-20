import React from 'react';

export default function AuthGate({ children }:{children:React.ReactNode}) {
  const [ok, setOk] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    fetch('/api/auth/check').then(r => setOk(r.ok)).catch(() => setOk(false));
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
