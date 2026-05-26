import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { WebAppProvider } from '@vkruglikov/react-telegram-web-app'
import App from './App'
import './styles/index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <WebAppProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </WebAppProvider>
  </React.StrictMode>
)
