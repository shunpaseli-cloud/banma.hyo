import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './styles/theme.css'
// The shell and saved-result view do not wait on weather or load prediction models.
createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>)
