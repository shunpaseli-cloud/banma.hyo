import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { loadForecast } from './moisture.js'
import './styles/theme.css'
// 帯広の天気予報(Open-Meteo)を最大4秒待ってから描画。失敗/オフラインでも同梱気象データで動作
Promise.race([loadForecast(), new Promise(r => setTimeout(r, 4000))]).finally(() =>
  createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>))
