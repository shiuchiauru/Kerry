import { createRoot } from 'react-dom/client'
import GameApp from './GameApp'
import './game.css'

createRoot(document.getElementById('game-root')!).render(<GameApp />)
