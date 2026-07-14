---
name: edu-game-workflow
description: 巧茹老師的國小教學遊戲四階段工作流：①讀課本教材產出五關 50 題遊戲腳本並等老師審核 ②依定稿腳本產生遊戲說明 Word ③上傳 NotebookLM 整理成國小生聽得懂的重點 ④製作單檔互動遊戲網頁、實測後推上 GitHub 上線。只要使用者要「做教學遊戲」「單元遊戲」「複習遊戲」「闖關遊戲」「平板遊戲」，或提供課本 PDF／教材 Word 要轉成遊戲、要出遊戲腳本、要把某一課做成互動遊戲時，一定要使用此技能——即使對方沒有明講「工作流」或「技能」。此流程不含簡報製作。
---

# 教學遊戲四階段工作流

巧茹老師會用同一套固定規格，為不同單元重複製作教學遊戲。每次會變的只有：教材內容、主題包裝（車站／糖果屋等）、題目。其餘規格、流程、檢查點全部固定——照這份文件走，不要重新發明。

## 全流程總覽

```
教材檔案（PDF/Word）
  → 階段 1　腳本產出 ……………… ⛔ 等老師審核確認
  → 階段 2　遊戲說明 Word
  → 階段 3　NotebookLM 整理重點
  → 階段 4　互動遊戲網頁＋測試
  → GitHub 上線 ………………………… ⛔ commit 訊息等老師 OK
```

兩個 ⛔ 是硬性停止點：腳本沒確認不做遊戲；commit 訊息沒 OK 不推 GitHub。這是老師明定的規矩，目的是讓內容與對外發布都經過她的手。

**此流程不含簡報**：老師已於 2026-07 把「可愛風簡報」從流程中移除。若她另外開口要簡報，當成獨立需求處理，不要自動附贈。

## 固定遊戲規範（每款遊戲都一樣）

- 畫面：橫式滿版 `100dvh/100dvw`、嚴禁出現捲動條、平板優先；直向持機顯示「請把平板轉成橫的」全螢幕提示
- 護眼：低飽和色票（HEX 見 [references/game-spec.md](references/game-spec.md)）、嚴禁高頻閃爍動畫、線條用實體細線
- 隨機：題目順序與選項順序一律用 Fisher-Yates Shuffle，並在腳本與程式碼中明確標註
- 生命：初始 3 顆心、答錯 −1、每過一關 +3、上限 15（設計意圖：全程零錯誤通關剛好 15 顆，最高級獎狀才拿得到）；歸零→鼓勵畫面→本關重來、愛心回 3 顆、已過關卡保留
- 答錯：彈出「知識提示」視窗（顯示該題附的提示文字）＋ 5 秒倒數鎖定，倒數完才出現「再挑戰一次」
- 節奏：過關出現大型「前往下一關」按鈕，嚴禁任何自動跳轉
- 內容：5 大關 × 每關 10 題 = 50 題情境化題目，每題附答錯時顯示的知識提示；題目內容必須全部出自教材，用語符合該年級
- 獎狀：依剩餘愛心 14-15／10-13／5-9／1-4 分四級，獎狀名稱隨主題風格命名；學生先在手寫簽名板簽名，簽完才呈現完整獎狀（含日期）
- 版權：每個程式碼區塊的最末行加上「國小教學教材，巧茹老師設計。」

## 階段 1：腳本產出

1. **讀教材**。PDF 先用 pypdf 抽文字層（課本 PDF 多半有內嵌文字，比 OCR 快得多）；真的抽不到字的掃描檔，把 PDF 用 `source_add` 上傳 NotebookLM，再用 `source_get_content` 取回伺服器端辨識好的文字。
2. **檢查點**（老師的規定）：確認她是否已提供「具體教學主題」「獎狀分級描述」「遊戲風格 1 種＋互動模式 1～5 種」。選單在 [references/menus.md](references/menus.md)。若她只說「先產腳本」沒勾選，依課文內容代選最貼合的風格與模式（例：課文走訪多地→火車環島），並在交付時標明「可隨時更換」；獎狀描述可代擬。
3. **產出腳本**，結構固定三大塊：
   - 全域設定：Layout 參數表、護眼色票 HEX、Fisher-Yates 虛擬碼宣告
   - 五大關卡：每關含站名／對應課文頁碼／學習目標／互動模式與操作說明／10 題完整表格（情境題目、選項、正解、知識提示）
   - 獎勵系統：四級獎狀的名稱、視覺描述、正向激勵文案＋簽名流程
4. **以網頁模式呈現**：腳本寫成 Markdown 檔發布為 Artifact（favicon 對應主題），讓老師在瀏覽器審閱；聊天內附摘要（關卡表、主題選擇理由、待確認事項）。
5. ⛔ **停**。等老師回覆確認或修改意見；修改後重新發布同一個 Artifact。

## 階段 2：遊戲說明 Word

- 觸發 `anthropic-skills:docx` 技能，用 docx（npm）寫產生腳本；`require('docx')` 失敗才 `npm install docx`。
- 內容固定八節：一、遊戲基本資料（表格）；二、遊戲故事；三、怎麼玩（編號步驟）；四、愛心生命規則；五、答錯的時候；六、五大關卡介紹（表格：站名／地點／學習重點／互動玩法）；七、獎狀與簽名（表格＋領獎流程）；八、給老師的小提醒。結尾置中版權行。
- 字型 Microsoft JhengHei，標題用主題色。存到 `games/<英文slug>/<遊戲名>_遊戲說明.docx`（slug 用小寫英文連字號，之後網址會用到）。

## 階段 3：NotebookLM 整理重點

依序呼叫 notebooklm-mcp 工具：

1. `notebook_create`——標題格式「<遊戲名>——遊戲設計（<科目><年級><單元>）」
2. `source_add`——`source_type="file"`、`file_path` 指向 Word 檔、`wait=true`
3. `source_get_content`——確認文字完整可讀（等於端到端驗證 Word 檔）
4. `notebook_query`——請它整理遊戲介紹重點，query 要求：全部用該年級聽得懂的短句、每句不超過 20 字、依「遊戲故事→怎麼玩→愛心規則→答錯怎麼辦→各關卡介紹→獎狀」分節列出
5. 回報筆記本網址與整理出的重點給老師（重點供她口頭介紹遊戲用）

認證失敗時先跑 `nlm login`。

## 階段 4：互動遊戲網頁＋GitHub 上線

1. **實作**：單一 `index.html`、零外部依賴（可離線、可 GitHub Pages），放 `games/<slug>/`。以 `games/hometown-train/index.html` 為黃金範本——版面骨架、色票變數、狀態機、五種互動模式、簽名板、獎狀都有現成寫法。技術細節與測試清單見 [references/game-spec.md](references/game-spec.md)。
2. **測試**：用 `.claude/launch.json` 的 `game-server`（`python -m http.server 8123`）起服務，瀏覽器面板開 `http://localhost:8123/games/<slug>/`，逐項跑 game-spec.md 的測試清單。瀏覽器面板截圖逾時是已知問題：功能改用 `read_page`＋`javascript_tool` 斷言，畫面用 Edge headless 補拍（指令在 game-spec.md）。
3. **Git 範圍**：只 commit 遊戲 `index.html`。Word 檔不入版控——這個 repo 會整個發布到公開的 GitHub Pages，入了版控等於公開供人下載；檔案留在 Google Drive 就好。
4. ⛔ **擬 commit 訊息給老師確認**（訊息結尾加 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`）。
5. OK 後：`git add` → `git commit` → `git push origin main` → **再 `git push origin main:gh-pages`**。最後這步不可省：Kerry repo 的 Pages 是 legacy 模式、部署 gh-pages 分支，只推 main 網站不會更新（repo 裡的 pages.yml workflow 與此設定不符，每次 push 都會紅，屬既知現象）。
6. 背景 curl 輪詢 `https://shiuchiauru.github.io/Kerry/games/<slug>/` 直到 HTTP 200，把上線網址回報給老師。

## 環境備註（踩過的坑）

- repo 位於 Google Drive 同步資料夾內，git 維護任務可能殘留 `.git/packed-refs.lock`；確認當下沒有 git 程序在跑就直接刪掉。
- 本機沒有 LibreOffice／poppler。要看網頁畫面用 Edge headless；要看 Office 檔案畫面用 PowerPoint／Word COM 匯出圖片。
- 拖拉互動用 Pointer Events 實作，`setPointerCapture` 包 try/catch（合成事件與部分裝置會丟例外）。
