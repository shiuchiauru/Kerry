import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

function serveGameBridge(): Plugin {
  return {
    name: 'serve-game-firebase-bridge',
    configureServer(server) {
      server.middlewares.use('/game-firebase-bridge.js', (_request, response) => {
        response.statusCode = 200
        response.setHeader('Content-Type', 'application/javascript; charset=utf-8')
        response.end('import "/src/game/firebase-bridge.ts"')
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), serveGameBridge()],
  build: {
    rollupOptions: {
      input: {
        dashboard: resolve(__dirname, 'index.html'),
        gameBridge: resolve(__dirname, 'src/game/firebase-bridge.ts'),
      },
      output: {
        entryFileNames: (chunk) => chunk.name === 'gameBridge'
          ? 'game-firebase-bridge.js'
          : 'assets/[name]-[hash].js',
      },
    },
  },
})
