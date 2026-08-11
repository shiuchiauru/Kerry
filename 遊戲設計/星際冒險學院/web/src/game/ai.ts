import { GoogleAIBackend, getAI, getGenerativeModel } from 'firebase/ai'
import { firebaseApp } from '../lib/firebase'

// 遊戲原始碼有兩處呼叫 window.claude.complete（答錯後的補救題、題目匯入分析）。
// 那是原始 Claude 沙箱才有的 API，自架環境沒有，兩處都會失敗退回陽春的替代做法。
// 這裡用 Firebase AI Logic 的 Gemini 補上同樣的介面，兩個功能就一起活過來。
// 走 Firebase 代管，API key 不會出現在原始碼或前端 bundle 裡。
type CompleteArgs = { messages: { role: string; content: string }[]; max_tokens?: number }

declare global {
  interface Window {
    claude?: { complete: (args: CompleteArgs) => Promise<string> }
  }
}

// Google 會淘汰舊模型（gemini-2.5-flash 已對新專案關閉），所以依序試到通為止，
// 再把可用的那個記在 localStorage，之後就不必每次重試。
const MODEL_CANDIDATES = ['gemini-flash-latest', 'gemini-2.5-flash-lite', 'gemini-2.0-flash']
const MODEL_CACHE_KEY = 'starAcademy_aiModel'

export function installAI() {
  if (!firebaseApp) return

  const ai = getAI(firebaseApp, { backend: new GoogleAIBackend() })
  const buildModel = (name: string) => getGenerativeModel(ai, {
    model: name,
    // 遊戲兩處都只要 JSON 陣列，直接請模型輸出純文字，後續由遊戲自己剖析。
    generationConfig: { temperature: 0.7, maxOutputTokens: 4096 },
  })

  const readCached = () => {
    try { return localStorage.getItem(MODEL_CACHE_KEY) } catch { return null }
  }
  const rememberModel = (name: string) => {
    try { localStorage.setItem(MODEL_CACHE_KEY, name) } catch { /* 無痕模式等情況忽略即可 */ }
  }

  window.claude = {
    async complete({ messages }) {
      const prompt = messages.map((m) => m.content).join('\n\n')
      const cached = readCached()
      const names = cached ? [cached, ...MODEL_CANDIDATES.filter((n) => n !== cached)] : MODEL_CANDIDATES

      let lastError: unknown
      for (const name of names) {
        try {
          const result = await buildModel(name).generateContent(prompt)
          rememberModel(name)
          return result.response.text()
        } catch (error) {
          lastError = error
          // 模型不存在或已下架就換下一個；其他錯誤（額度、網路）直接往外拋。
          const message = error instanceof Error ? error.message : String(error)
          if (!/404|no longer available|not found|not supported/i.test(message)) throw error
        }
      }
      throw lastError
    },
  }
}
