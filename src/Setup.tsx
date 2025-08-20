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

  async function verify() {
    if (!tag) return;
    try {
      await fetch(`/api/setup/verify?tag=${encodeURIComponent(tag)}`, { method: 'POST' });
    } catch {
      alert('認証に失敗しました。NFCタグをもう一度タッチしてください。');
    }
  }
  React.useEffect(() => { verify(); }, []);

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

  const toFrame = () => location.href = `/frame?char=${encodeURIComponent(char)}&from=setup`;

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
          <button onClick={toFrame} className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-lg font-bold">
            キャラフレーム起動
          </button>
        </div>

        <div className="text-xs text-slate-400">
          状態：{isStandalone() ? 'PWAで起動中' : 'ブラウザで起動中'}／キャラ: {char}
        </div>
      </div>
    </div>
  );
}
