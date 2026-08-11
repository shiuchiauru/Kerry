import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// 登入畫面上教師／家長面板的開頭標籤，只差邊框顏色。
const loginPanelTag = (border: string) =>
  `<div style="width:380px;background:rgba(255,255,255,.07);border:1px solid rgba(${border},.4);`
  + 'border-radius:24px;padding:26px;display:flex;flex-direction:column;gap:14px;animation:popIn .35s ease-out"'

// 指揮中心的「全班學習分析」區塊。資料由 bridge 注入的 _classAnalytics() 算出來。
const card = 'background:rgba(0,0,0,.22);border:1px solid rgba(160,140,255,.25);border-radius:16px;padding:14px 16px'
const track = 'height:9px;background:rgba(0,0,0,.4);border-radius:999px;overflow:hidden'
const rowBox = 'display:flex;flex-direction:column;gap:6px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,.07)'
const analyticsSection = `      <div style="background:rgba(255,255,255,.06);border:1px solid rgba(160,140,255,.3);border-radius:22px;padding:24px;margin-bottom:18px">
        <div style="font-size:17px;font-weight:900;margin-bottom:6px">📊 {{ klass }} 全班學習分析</div>
        <div style="font-size:13px;color:#9a8ad8;margin-bottom:14px">依學生實際作答與打卡結果即時計算，可用來決定下一節課要補強什麼。</div>
        <sc-if value="{{ analytics.empty }}" hint-placeholder-val="{{ false }}">
          <div style="padding:16px;text-align:center;color:#8a80b8;font-size:14px">這個班級還沒有學生，先在下方加入學生。</div>
        </sc-if>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px">
          <sc-for list="{{ analytics.cards }}" as="ac" hint-placeholder-count="6">
            <div style="${card}">
              <div style="font-size:12.5px;color:#b8a8ff;font-weight:700">{{ ac.label }}</div>
              <div style="font-size:24px;font-weight:900;color:#fff;margin-top:4px">{{ ac.value }}</div>
              <div style="font-size:11.5px;color:#8a80b8;margin-top:4px">{{ ac.note }}</div>
            </div>
          </sc-for>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px;margin-top:18px">
          <div style="${card}">
            <div style="font-size:14px;font-weight:900;color:#ff9ac0">❌ 最容易答錯的題目</div>
            <sc-if value="{{ analytics.hasWrong }}" hint-placeholder-val="{{ true }}">
              <sc-for list="{{ analytics.wrongRows }}" as="aw" hint-placeholder-count="3">
                <div style="${rowBox}">
                  <div style="font-size:13px;font-weight:900;color:#e8e2ff">{{ aw.label }}</div>
                  <div style="font-size:12.5px;color:#9a8ad8">{{ aw.text }}</div>
                  <div style="${track}"><div style="{{ aw.bar }}"></div></div>
                  <div style="font-size:12px;color:#ffb347;font-weight:700">{{ aw.pctText }}</div>
                </div>
              </sc-for>
            </sc-if>
            <div style="font-size:12.5px;color:#8a80b8;margin-top:8px">錯誤率高的題目建議整班重講，而不是個別補救。尚無資料代表全班還沒有人測驗。</div>
          </div>
          <div style="${card}">
            <div style="font-size:14px;font-weight:900;color:#7de8a0">✅ 各任務完成率</div>
            <sc-for list="{{ analytics.taskRows }}" as="at" hint-placeholder-count="3">
              <div style="${rowBox}">
                <div style="font-size:13px;font-weight:900;color:#e8e2ff">{{ at.label }}</div>
                <div style="font-size:12.5px;color:#9a8ad8">{{ at.subject }}</div>
                <div style="${track}"><div style="{{ at.bar }}"></div></div>
                <div style="font-size:12px;color:#7de8a0;font-weight:700">{{ at.pctText }}</div>
              </div>
            </sc-for>
            <div style="font-size:12.5px;color:#8a80b8;margin-top:8px">完成率偏低的任務，可能是說明不清楚或難度太高。</div>
          </div>
          <div style="${card}">
            <div style="font-size:14px;font-weight:900;color:#ffb347">🔎 需要關注的學生</div>
            <sc-for list="{{ analytics.watchRows }}" as="an" hint-placeholder-count="2">
              <div style="${rowBox}">
                <div style="font-size:13px;font-weight:900;color:#e8e2ff">{{ an.label }}</div>
                <div style="font-size:12.5px;color:#ffb347">{{ an.reason }}</div>
              </div>
            </sc-for>
            <div style="font-size:12.5px;color:#8a80b8;margin-top:8px">點成員狀況的「詳情」可看該生的答錯題目與打卡照片。</div>
          </div>
        </div>
      </div>
`

// 名冊裡可編輯的座號／學號輸入框樣式。
const rosterFieldStyle = 'width:100%;box-sizing:border-box;background:rgba(0,0,0,.28);'
  + 'border:1px solid rgba(160,140,255,.28);border-radius:8px;padding:6px 8px;'
  + 'color:#c8baff;font-size:14px;font-weight:700;outline:none'

// 提示訊息（showToast）的開頭標籤。
const toastTag =
  '<div style="position:fixed;top:84px;left:50%;transform:translateX(-50%);background:#0e0a2a;'
  + 'border:1px solid rgba(160,140,255,.6);color:#fff;padding:12px 26px;border-radius:999px;z-index:60;'
  + 'font-weight:700;font-size:15px;box-shadow:0 0 24px rgba(140,106,255,.5);animation:slideDown .3s ease-out;'
  + 'display:flex;align-items:center;gap:8px"'

// 教師面板從「或使用帳號密碼」的分隔線到「進入指揮中心」按鈕。
// Firebase 這邊只開了 Google 登入，這段填了也沒作用，反而會誤導老師。
const teacherPasswordLogin =
  /<div style="display:flex;align-items:center;gap:10px"><div style="flex:1;height:1px;background:rgba\(255,255,255,\.15\)"><\/div><span[^>]*>或使用帳號密碼<\/span>[\s\S]*?進入指揮中心<\/button>/

// game.html 是「背景整合版」的原樣副本，不手動修改；只在載入時做這些替換。
function starAcademyGame(): Plugin {
  const rewrites: [string | RegExp, string][] = [
    // 換掉原始執行環境，改由 Firebase 橋接載入（橋接自己會再載 /game-support.js）。
    // 原版的 support.js 是 head 裡的同步 script，能在畫面畫出來前藏起 <x-dc> 原始樣板；
    // 換成 module 後會延後執行，所以這裡先補上同一條樣式，避免樣板連同 {{ }} 佔位符閃一下。
    [
      '<script src="./support.js"></script>',
      '<style>x-dc{display:none!important}</style>'
      + '<script type="module" src="/src/game/firebase-bridge.ts"></script>',
    ],
    // 標記登入畫面的三個區塊，讓 login-overlay.css 能把面板改成置中對話框。
    [loginPanelTag('255,212,94'), `${loginPanelTag('255,212,94')} data-login-panel="teacher"`],
    [loginPanelTag('90,200,120'), `${loginPanelTag('90,200,120')} data-login-panel="parent"`],
    ['<div style="display:flex;gap:14px">', '<div data-login-actions style="display:flex;gap:14px">'],
    // 提示訊息原本 z-index 比遊戲自己的對話框還低，會被蓋住。
    [toastTag, `${toastTag} data-toast`],
    // 拿掉失效的帳號密碼登入，教師面板只留 Google 登入。
    [teacherPasswordLogin, ''],
    // 名冊去識別化：不再輸入也不再儲存姓名，改以座號辨識學生。
    ['加入學生（座號＋學號＋姓名）', '加入學生（座號＋學號）'],
    [/\s*<input value="\{\{ stuName \}\}"[^>]*><\/input>/, ''],
    // 名冊表格的「姓名」欄拿掉，內容只會是座號的重複。整列少一欄，格線也要跟著改。
    // 座號與學號改成可直接編輯的輸入框，欄寬要放寬一點才放得下。
    [
      'grid-template-columns:60px 84px 1fr 1fr 70px 90px 100px 1.2fr 118px',
      'grid-template-columns:78px 108px 1fr 70px 90px 100px 1.1fr 118px',
    ],
    [
      '<div style="padding:12px 8px;border-bottom:1px solid rgba(255,255,255,.08);color:#9a8ad8;font-weight:700">{{ r.sid }}</div>',
      '<div style="padding:8px 6px;border-bottom:1px solid rgba(255,255,255,.08)">'
        + '<input value="{{ r.sid }}" onChange="{{ r.setSid }}" placeholder="座號" style="' + rosterFieldStyle + '"></input></div>',
    ],
    [
      '<div style="padding:12px 8px;border-bottom:1px solid rgba(255,255,255,.08);color:#9a8ad8;font-weight:700">{{ r.snoText }}</div>',
      '<div style="padding:8px 6px;border-bottom:1px solid rgba(255,255,255,.08)">'
        + '<input value="{{ r.snoValue }}" onChange="{{ r.setSno }}" placeholder="學號" style="' + rosterFieldStyle + '"></input></div>',
    ],
    [/\s*<div style="padding:10px 8px;color:#b8a8ff;font-weight:900;border-bottom:1px solid rgba\(160,140,255,\.3\)">姓名<\/div>/, ''],
    [/\s*<div style="padding:12px 8px;border-bottom:1px solid rgba\(255,255,255,\.08\);font-weight:700">\{\{ r\.name \}\}<\/div>/, ''],
    // 指揮中心加一整塊全班學習分析，放在成員狀況前面。
    [
      '      <div style="background:rgba(255,255,255,.06);border:1px solid rgba(160,140,255,.3);border-radius:22px;padding:24px">\n'
        + '        <div style="font-size:17px;font-weight:900;margin-bottom:6px">👨‍🚀 {{ klass }} 艦隊成員狀況</div>',
      analyticsSection
        + '      <div style="background:rgba(255,255,255,.06);border:1px solid rgba(160,140,255,.3);border-radius:22px;padding:24px">\n'
        + '        <div style="font-size:17px;font-weight:900;margin-bottom:6px">👨‍🚀 {{ klass }} 艦隊成員狀況</div>',
    ],
    // 詳情面板加上該生的拍照打卡照片，老師才能確認做得對不對。
    [
      '          <div style="background:rgba(125,232,255,.07);border:1px dashed rgba(125,232,255,.4);border-radius:14px;padding:12px 16px;font-size:14px;color:#9fe4f5;line-height:1.6">💡 {{ detailSuggest }}</div>',
      '          <sc-if value="{{ hasDetailPhotos }}" hint-placeholder-val="{{ false }}">\n'
        + '          <div style="background:rgba(90,200,120,.08);border:1px solid rgba(90,200,120,.35);border-radius:14px;padding:12px 16px;display:flex;flex-direction:column;gap:10px">\n'
        + '            <div style="font-size:13px;font-weight:900;color:#7de8a0">📸 學生上傳的打卡照片</div>\n'
        + '            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:12px">\n'
        + '              <sc-for list="{{ detailPhotos }}" as="dp" hint-placeholder-count="2">\n'
        + '                <div style="display:flex;flex-direction:column;gap:6px">\n'
        + '                  <img src="{{ dp.photo }}" onClick="{{ dp.open }}" style="{{ dp.style }}"></img>\n'
        + '                  <div style="font-size:12.5px;color:#b8a8ff;font-weight:700">{{ dp.title }}</div>\n'
        + '                  <div style="font-size:11.5px;color:#8a80b8">{{ dp.monster }}</div>\n'
        + '                </div>\n'
        + '              </sc-for>\n'
        + '            </div>\n'
        + '          </div>\n'
        + '          </sc-if>\n'
        + '          <div style="background:rgba(125,232,255,.07);border:1px dashed rgba(125,232,255,.4);border-radius:14px;padding:12px 16px;font-size:14px;color:#9fe4f5;line-height:1.6">💡 {{ detailSuggest }}</div>',
    ],
    // 學生端的照片也改成 <img src>，理由同上。
    [
      '<sc-if value="{{ t.hasPhoto }}" hint-placeholder-val="{{ false }}"><div style="{{ t.photoStyle }}"></div></sc-if>',
      '<sc-if value="{{ t.hasPhoto }}" hint-placeholder-val="{{ false }}"><img src="{{ t.photo }}" style="{{ t.photoStyle }}"></img></sc-if>',
    ],
    [
      '      <div style="{{ upPhotoStyle }}"></div>',
      '      <img src="{{ upPhoto }}" style="{{ upPhotoStyle }}"></img>',
    ],
    // 學生登入也不再輸入姓名，只留班級、座號、學號。
    [
      /\s*<div style="display:flex;flex-direction:column;gap:6px">\s*<label[^>]*>姓名<\/label>\s*<input value="\{\{ loginName \}\}"[\s\S]*?<\/input>\s*<\/div>/,
      '',
    ],
  ]

  return {
    name: 'star-academy-game',
    transformIndexHtml: {
      order: 'pre',
      handler(html, context) {
        if (!context.path.endsWith('/game.html')) return html
        let output = html.replaceAll('url("assets/', 'url("/game-assets/')
        for (const [pattern, replacement] of rewrites) {
          const next = output.replace(pattern, replacement)
          if (next === output) {
            throw new Error(`game.html 與預期不符，找不到要替換的片段：${String(pattern).slice(0, 60)}…`)
          }
          output = next
        }
        return output
      },
    },
  }
}

export default defineConfig({
  plugins: [react(), starAcademyGame()],
  build: {
    rollupOptions: {
      input: {
        dashboard: resolve(__dirname, 'index.html'),
        game: resolve(__dirname, 'game.html'),
      },
    },
  },
})
