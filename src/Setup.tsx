import React, { useMemo } from 'react';

function isiOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
         (navigator.platform === 'MacIntel' && (navigator as any).maxTouchPoints > 1);
}
function isStandalone() {
  // @ts-ignore
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;
}

export default function Setup() {
  const url = new URL(window.location.href);
  const char = url.searchParams.get('char') || 'alice';
  const tag  = url.searchParams.get('tag');

  const [ready, setReady] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const verify = React.useCallback(async () => {
    if (!tag) { setReady(true); return; }
    try {
      setError(null);
      const res = await fetch(`/api/setup/verify?tag=${encodeURIComponent(tag)}`, {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store'
      });
      if (!res.ok) throw new Error('verify failed');
      // Cookie反映を安定させるため、ほんの少し待つ
      await new Promise(r => setTimeout(r, 150));
      setReady(true);
    } catch {
      setError('認証に失敗しました。NFCタグをもう一度タッチしてください。');
      setReady(false);
    }
  }, [tag]);

  React.useEffect(() => { verify(); }, [verify]);

  const guide = useMemo(() => isiOS() ? (
    <ol className="list-decimal pl-6 space-y-2">
      <li>右上の <b>共有</b> をタップ</li>
      <li><b>ホーム画面に追加</b> を選択</li>
      <li>追加した <b>アプリアイコン</b> から次回起動</li>
    </ol>
  ) : (
    <ol className="list-decimal pl-6 space-y-2">
      <li>ブラウザのメニューから <b>ホーム画面に追加</b>（またはインストール）</li>
      <li>追加後は <b>アイコン</b> から起動</li>
    </ol>
  ), []);

  const toFrame = async () => {
    if (!ready) { await verify(); }
    if (!ready) return; // それでも未準備なら中断
    location.href = `/frame?char=${encodeURIComponent(char)}&from=setup`;
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white grid place-items-center p-6">
      <div className="max-w-md w-full space-y-6">
        <h1 className="text-2xl font-bold">初期設定（1回だけ）</h1>
        <p className="text-slate-300">PWAにすると次回からアイコンをタップするだけでフレームが即起動します。</p>

        <div className="bg-white/5 rounded-xl p-4 space-y-3">
          <div className="text-sm font-semibold text-slate-200">PWA化の手順</div>
          {guide}
        </div>

        <div className="bg-white/5 rounded-xl p-4 space-y-3">
          <div className="text-sm font-semibold text-slate-200">まずはブラウザで試す</div>
          <button
            onClick={toFrame}
            disabled={!ready}
            className={`w-full py-3 rounded-xl text-lg font-bold ${ready ? 'bg-emerald-500 hover:bg-emerald-400' : 'bg-emerald-500/50 cursor-not-allowed'}`}
          >
            {ready ? 'キャラフレーム起動' : '認証中…'}
          </button>
          {error && <p className="text-red-300 text-sm mt-2">{error}</p>}
        </div>

        <div className="text-xs text-slate-400">
          状態：{isStandalone() ? 'PWAで起動中' : 'ブラウザで起動中'}／キャラ: {char}
        </div>
      </div>
    </div>
  );
}
