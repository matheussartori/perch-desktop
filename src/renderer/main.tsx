/*
 * Renderer entry point. Mounts the React tree into #root under StrictMode and
 * pulls in the global stylesheet (which in turn imports the design tokens).
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles/global.css'

const container = document.getElementById('root')
if (!container) throw new Error('Renderer could not find #root to mount into.')

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
)
