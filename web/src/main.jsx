import React from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import './styles/styles.css';
import { AppProvider } from './lib/store.jsx';
import { I18nProvider } from './lib/i18n.jsx';
import { ToastProvider } from './lib/toast.jsx';
import { App } from './App.jsx';

// We manage scroll position ourselves (see ScrollManager).
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HashRouter>
      <I18nProvider>
        <ToastProvider>
          <AppProvider>
            <App />
          </AppProvider>
        </ToastProvider>
      </I18nProvider>
    </HashRouter>
  </React.StrictMode>
);
