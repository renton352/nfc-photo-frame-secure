// オフライン機能なし。更新の即時反映とクライアント引き継ぎだけ行う。
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// fetch は横取りしない（ブラウザ/サーバーのヘッダー制御をそのまま適用）
// もし将来ランタイムキャッシュを入れる場合はここに追加する。
