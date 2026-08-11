import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

function starAcademyGame(): Plugin {
  return {
    name: 'star-academy-game',
    transformIndexHtml(html, context) {
      if (!context.path.endsWith('/game.html')) return html
      return html
        .replace('<script src="./support.js"></script>', '')
        .replace('</head>', '<script type="module" src="/src/game/firebase-bridge.ts"></script></head>')
    },
  }
}

export default defineConfig({
  plugins: [react(), starAcademyGame()],
  build: { rollupOptions: { input: { dashboard: resolve(__dirname, 'index.html'), game: resolve(__dirname, 'game.html') } } },
})
