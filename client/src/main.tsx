import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { MotionConfig } from 'framer-motion'
import App from './App.tsx'
import { spring } from './utils/motion'
import { listenForUncaughtErrors } from './utils/reportError'

listenForUncaughtErrors()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* One spring for every motion component, and "Reduce Motion" honoured
        everywhere: transforms drop out, opacity cross-fades stay. */}
    <MotionConfig reducedMotion="user" transition={spring}>
      <App />
    </MotionConfig>
  </StrictMode>,
)
