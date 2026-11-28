import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import '../styles/index.css';
import '../styles/theme-kim-tho.css';
import '../styles/guide.css';

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).catch(console.error);
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
