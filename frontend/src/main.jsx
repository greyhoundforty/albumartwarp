/**
 * main.jsx — React application entry point.
 *
 * React 18's createRoot API replaces the old ReactDOM.render().
 * StrictMode renders components twice in development to help catch bugs.
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './index.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
