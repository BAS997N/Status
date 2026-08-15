import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import AppDialogProvider from './components/AppDialogProvider.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppDialogProvider>
      <App />
    </AppDialogProvider>
  </StrictMode>,
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/Status/sw.js', {
      scope: '/Status/',
      updateViaCache: 'none',
    }).catch((error) => {
      console.warn('Service worker registration failed:', error);
    });
  });
}
