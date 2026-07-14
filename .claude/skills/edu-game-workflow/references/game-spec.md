# 遊戲技術規範與測試清單

黃金範本：`games/hometown-train/index.html`（社會 3 下 6-2《家鄉故事小火車》，已完整實測）。做新遊戲時先讀它，沿用骨架換內容與主題皮膚，比從零寫穩得多。

## 護眼色票（低飽和，可依主題微調色相、不可提高飽和度）

| 角色 | 範本 HEX | 說明 |
|------|----------|------|
| 背景主色 | `#F7F3E9` | 奶油米白 |
| 區塊底色 | `#E4EDE4` | 淡霧綠 |
| 主題色 | `#C97B63` | 主按鈕、主角元素 |
| 輔助色 | `#7FA3B5` | 次按鈕、資訊 |
| 強調色 | `#E3C878` | 星星、獎勵 |
| 文字色 | `#4A3F35` | 深可可棕（不用純黑） |
| 正確回饋 | `#8FAF87` | 苔蘚綠 |
| 錯誤回饋 | `#D9A382` | 陶土橘（不用刺眼大紅） |
| 卡片底 | `#FFFDF7` | 暖白 |
| 線條 | `#C9BBA8` | 實體細線 1.5px |

## 版面骨架

- `html,body { overflow:hidden }`，body 高度寫兩行做舊機退場：`height:100vh; height:100dvh;`
- CSS Grid 三列：狀態列 10% ＋ 遊戲舞臺 82% ＋ 路線進度列 8%
- 狀態列常駐：目前站名｜第 X 關・第 Y／10 題｜❤×N｜靜音鈕
- 基準字級 `clamp(16px, 2.2vh + 0.4vw, 30px)`；觸控目標最小 48×48px
- 直向提示：`@media (orientation: portrait)` 顯示全螢幕 overlay
- `@media (prefers-reduced-motion: reduce)` 關閉所有動畫

## 核心邏輯

```text
function fisherYatesShuffle(array):
    for i from array.length - 1 down to 1:
        j = randomInteger(0, i)
        swap(array[i], array[j])
    return array
// 每關開始：題目順序洗牌；每題顯示：選項順序洗牌
```

- 狀態物件：`{ level, qIndex, hearts, order, locked, sigData, started }`
- 答對：星星動畫＋輕音效，750ms 後自動下一題；答完 10 題進過關畫面（+3 心，上限 15）
- 答錯：hearts−1 → 知識提示視窗 → `setInterval` 倒數 5 → 顯示「再挑戰一次」→ 同題重出（選項重洗）；若 hearts==0，按鈕改導向「休息一下」畫面（本關重來、回 3 心）
- `state.locked` 防連點：回饋播放期間吞掉所有輸入
- 音效用 Web Audio 現做（sine 短音），附靜音鈕；不用外部音檔

## 互動模式實作備忘

- **四選一**：2×2 grid 大按鈕（主題化外觀，如行李箱）
- **拖拉分類**：卡片 `touch-action:none`，pointerdown/move/up 移動 `transform`；放開時用 zone 的 `getBoundingClientRect()` 命中判定；沒中→彈回原位不扣分；`setPointerCapture` 包 try/catch
- **泡泡點戳**：4 顆泡泡緩慢上下漂（4.5s alternate，禁快閃），點中正確→縮小消失動畫再進下一題
- **釣魚**：魚身 ellipse＋CSS 三角尾，緩慢左右游；點中正確→上釣飛出動畫
- **排序**：上方火車頭＋N 個虛線空位，下方洗牌後的車廂按鈕；依序點選填入，填滿自動判定
- 混合關（如探究關）：每題帶 `type` 欄位（sort/classify/choice），render 時分流

## 結局流程

終點結算（剩餘愛心＋獎級預告）→ 簽名板（canvas 2x 解析度、pointer 畫線、清除重寫）→ `toDataURL` 存簽名 → 獎狀畫面（四級各自邊框配色與獎章、簽名合成在「小車長：」欄、自動帶完成日期、可截圖）→ 再玩一次（`location.reload()`）

分級判定：`h>=14 金 / h>=10 銀 / h>=5 銅 / 其餘 木`。過完末關必先 +3，所以結算時愛心最少 4，四級皆可達。

## 測試清單（上線前逐項）

1. 每種互動模式至少實測一題答對（進度前進、愛心不變）
2. 答錯全流程：−1 心 → 提示文字正確 → 倒數期間無「再挑戰」鈕 → 倒數完出現 → 同題選項重洗
3. 拖拉：拖到空白處彈回不扣分；拖到錯誤區算答錯
4. 愛心歸零：休息畫面 → 重挑本關回 3 心、qIndex 歸零
5. 過關：+3 心（驗上限 15）、大按鈕文字（末關改「前往終點結算」）、無自動跳轉
6. 獎級邊界：15/14→金、13/10→銀、9/5→銅、4/1→木
7. 簽名：空白簽名不可通過；簽名出現在獎狀、日期正確
8. `scrollHeight==clientHeight`（無捲動）；直向出現轉向提示；靜音鈕切換
9. 起始畫面頂欄顯示中性標題（未開始不顯示第 X 關）

## 測試工具備忘

- 服務：`.claude/launch.json` → `game-server`（`python -m http.server 8123`）；瀏覽器面板不吃 `file://`
- 面板截圖逾時（已知）：功能斷言用 `javascript_tool`（多次呼叫時外層包 IIFE，避免 const 重複宣告）＋`read_page`；拖拉用合成 PointerEvent 觸發
- 視覺截圖：`msedge --headless --disable-gpu --screenshot="out.png" --window-size=1180,820 --virtual-time-budget=4000 <url>`（Edge 在 `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`）
