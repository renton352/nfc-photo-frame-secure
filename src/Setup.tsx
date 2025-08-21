// src/Setup.tsx （該当部分の差し替え）
import React, { useMemo } from 'react';

export default function Setup() {
  const url = new URL(location.href);
  const char = url.searchParams.get('char') || 'alice';
  const tag  = url.searchParams.get('tag') || '';

  const [ready, setReady] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const start = React.useCallback(async () => {
    if (!tag) {
      setError('NFCタグからアクセスしてください（URLに tag=... が必要です）');
      setReady(false);
      return;
    }
    setError(null);
    const r = await fetch(`/api/setup/start?tag=${encodeURIComponent(tag)}`, {
      method: 'POST', credentials: 'include', cache: 'no-store'
    });
    if (!r.ok) {
      setError('開始に失敗しました。NFCタグをもう一度タッチしてください。');
      setReady(false);
      return;
    }
    setReady(true); // snonce が入ったので60秒だけ有効
  }, [tag]);

  React.useEffect(() => { start(); }, [start]);

  const toFrame = async () => {
    if (!ready) return;
    const r = await fetch(`/api/setup/verify?tag=${encodeURIComponent(tag)}`, {
      method: 'POST', credentials: 'include', cache: 'no-store'
    });
    if (!r.ok) {
      const j = await r.json().catch(()=>({}));
      setError(j?.reason === 'expired'
        ? '有効時間が過ぎました。NFCタグをもう一度タッチしてください。'
        : '認証に失敗しました。NFCタグをもう一度タッチしてください。'
      );
      setReady(false);
      return;
    }
    const q = new URLSearchParams({ char, from: 'setup', tag });
    location.href = `/frame?${q.toString()}`;
  };

  // ...（ UIはそのまま、ボタンの onClick=toFrame / disabled={!ready || !tag}）
}
