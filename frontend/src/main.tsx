import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import App from './App.tsx';
import initProtocol from './generated/tacitus_protocol';
import './index.css';
import { resolveTheme, THEME_KEY } from './preferences';
import { store } from './store';
import AppErrorBoundary from './ui/AppErrorBoundary';

document.documentElement.dataset.theme = resolveTheme(
  localStorage.getItem(THEME_KEY),
  matchMedia('(prefers-color-scheme: dark)').matches,
);
await initProtocol();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <Provider store={store}>
        <App />
      </Provider>
    </AppErrorBoundary>
  </StrictMode>,
);
