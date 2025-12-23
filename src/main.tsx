import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './App.css'
import { ErrorBoundary } from './components/common/ErrorBoundary'

console.log('main.tsx loading');

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Root element not found')
}

console.log('Root element found, rendering React app');

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)

console.log('React app rendered');

