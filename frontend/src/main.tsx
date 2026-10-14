import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import App from './App.tsx';
import initProtocol from './generated/tacitus_protocol';
import './index.css';
import '@fontsource-variable/archivo/wght.css';
import '@fontsource-variable/jetbrains-mono/wght.css';
import '@fontsource/courier-prime/latin-400.css';
import '@fontsource/vt323/latin-400.css';
import { store } from './application/store/store';
import AppErrorBoundary from './ui/AppErrorBoundary';
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
