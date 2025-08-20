import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import Setup from './Setup';
import AuthGate from './AuthGate';
import './index.css';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(console.warn);
  });
}

function Root() {
  const path = location.pathname;
  if (path.startsWith('/setup')) return <Setup />;
  if (path.startsWith('/frame')) return <AuthGate><App /></AuthGate>;
  return <Setup />; // default landing
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><Root /></React.StrictMode>
);
