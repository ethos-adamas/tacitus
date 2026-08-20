import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import initProtocol from './generated/tacitus_protocol'
import './index.css'
import App from './App.tsx'
import { resolveTheme, THEME_KEY } from './preferences'

document.documentElement.dataset.theme = resolveTheme(
  localStorage.getItem(THEME_KEY),
  matchMedia('(prefers-color-scheme: dark)').matches,
)
await initProtocol()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
