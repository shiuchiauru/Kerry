# 新版平台開發說明

新版網站放在 `web/`，原始單機版與來源壓縮檔不會被修改。

## 正式網址

- 教師管理中心：<https://teacherstudy-503912.web.app/>
- 遊戲前台：<https://teacherstudy-503912.web.app/game.html>

部署在 Firebase Hosting，與資料同一個專案，所以 Google 登入的授權網域自動生效。
改完程式點 `部署到雲端.bat`（同步 → build → `firebase deploy --only hosting`）。
`啟動星際冒險學院.bat` 是本機測試用，不影響正式站。

**App Check 目前未通過。** `src/lib/firebase.ts` 已接上 reCAPTCHA v3（site key 讀
`VITE_RECAPTCHA_SITE_KEY`），本機靠偵錯權杖可用，但正式站的權杖交換被 Firebase 回 403，
推測是 Console 的 App Check 尚未正確註冊 reCAPTCHA v3 provider 或密鑰貼錯。
AI Logic 已開啟強制執行，所以 AI 兩處功能目前走替代路徑；Firestore 未強制執行，不受影響。

## 本機啟動

```powershell
cd web
npm install
Copy-Item .env.example .env.local
# 填入 Firebase Web SDK 設定後：
npm run dev
```

- `/`：教師管理中心（React），管理班級與題庫。
- `/game.html`：星際冒險學院遊戲前台（背景整合版）。

## 兩邊如何整合

`web/game.html` 是 `背景整合版/星際冒險學院 背景整合版.html` 的原樣副本，不手動修改。載入時由 `vite.config.ts` 的 `star-academy-game` plugin 做這些替換：

1. `./support.js` → `/src/game/firebase-bridge.ts`（Firebase 橋接，載入後才自行載入 `/game-support.js` 這份原始執行環境）。同時補上 `x-dc{display:none}`：原版 `support.js` 是同步 script，能在畫面畫出來前藏住原始樣板，換成 module 後會延後執行，不補這行會看到 `{{ }}` 佔位符閃一下。
2. 背景圖 `assets/*.png` → `/game-assets/*.png`。
3. 幫登入畫面的教師／家長面板與底部按鈕列加上 `data-login-panel`、`data-login-actions`，讓 `src/game/login-overlay.css` 把它們改成置中對話框——原本面板是接在學生登入卡下面，會把版面往下撐、逼使用者捲動，在 16:9 投影畫面上很難用。提示訊息（toast）也加上 `data-toast` 提到最上層，否則會被對話框遮罩蓋住。
4. 移除教師面板裡「或使用帳號密碼」到「進入指揮中心」那一段。Firebase 只開了 Google 登入，那些欄位填了也沒作用。若之後要啟用 Email／密碼登入，在 Firebase Console → Authentication → Sign-in method 開啟後，拿掉這條替換即可。
5. 移除「加入學生」的姓名欄位（名冊去識別化，見下）。

`src/game/firebase-bridge.ts` 在遊戲程式執行前修補它的原始碼，把假的 Google 帳號選單換成真正的 Firebase Authentication，並把 `state` 同步到 Firestore。

## 同步規則（踩過的坑都在這）

**單向同步。** 登入後只套用第一份快照，之後本地狀態就是準的，只往雲端寫、不再回頭覆蓋。原本每份快照都套用，但存一次要寫多筆文件、每筆都觸發一份快照，其中「只寫到一半」的舊快照可能在寫入結束後才送達，會把剛新增的班級或學生抹掉，還把選取的班級跳回別班。代價是跨裝置不即時，換裝置要重新整理。

**班級代碼是穩定的識別碼。** 隨機產生一次後就固定，改名時透過 `_carryFirebaseClassKey` 沿用同一筆文件與同一組代碼——代碼已經發給學生，不能跟著班名重算。原本代碼是從班名推導的，改名會在雲端多出一筆重複班級，學生連結也失效。

**刪除要同步刪。** `_persistFirebaseData` 會比對本地與 `_firebaseClassIds` / `_firebaseBankIds`，把本地已刪的班級、公開副本與題庫從雲端刪掉，否則下次登入又會冒出來。

**名冊去識別化。** 上傳前經 `_deidentifyRoster` 只留座號、學號與學習進度；讀回時經 `_labelRoster` 用座號補出「01 號」當顯示名稱，畫面各處才不會空白。

## 誰在哪裡做什麼

- **建立與編輯**（班級、學生、題庫、任務、商店）：一律在遊戲前台的指揮中心。教師管理中心只負責檢視與取得學生連結，不再提供新增功能，避免兩處建立資料造成不一致。
- **分享**：教師管理中心的「班級管理」每張卡片都有學生連結與複製按鈕。

## 學生怎麼進入與回傳成績

學生開 `/game.html?class=班級代碼`，`_loadStudentClass` 讀 `publicClasses/{班級代碼}`，不必登入就載入該班的名冊、題庫、任務與商店。

成績回傳走 `studentProgress/{班級代碼}_{座號}`：學生以**匿名登入**取得 uid 後寫入，Firestore 規則要求文件 id 必須等於內容裡的「班級代碼_座號」，因此無法冒名寫到別人那一筆。老師端 `_connectProgress` 以 `teacherId` 訂閱，把進度欄位疊回名冊——只覆蓋成績相關欄位，不動班級成員，所以不會重蹈快照覆蓋本地修改的覆轍；合併期間 `_firebaseHydrating` 為真，也不會反過來觸發教師寫入。

匿名學生的 uid 不能被當成老師，`observeAuth` 會用 `isAnonymous` 擋掉。

拍照打卡的照片走 `taskPhotos/{班級代碼_座號_任務}`。手機原圖動輒 5 MB 以上，Firestore 單筆上限 1 MiB，所以 `_shrinkPhoto` 先縮到長邊 900px 再轉 JPEG（實測 5.8 MB → 11 KB）。照片可能拍到學生筆跡姓名，比成績敏感，規則設成只有該班老師讀得到；老師在名冊的「詳情」面板看縮圖，點縮圖由 `_openPhotoViewer` 疊一層純 DOM 看原尺寸。

**照片一律用 `<img src>` 帶，不能塞進 style 字串。** DC 的樣式解析器以 `;` 分隔屬性，而 data URL 內含 `data:image/jpeg;base64,`，寫成 `background:url(...)` 會在第一個 `;` 被截斷，圖片直接載不出來（放大檢視卻正常，因為那是純 DOM 疊出來的）。原始碼的 `photoStyle`、`upPhotoStyle` 都有這個問題，已一併改掉。

縮圖曾經整片全黑，三個成因都要一起擋：JPEG 沒有透明度所以 PNG／HEIC 的透明區會變黑（先鋪白底）、iPhone 高畫素照片超過 canvas 面積上限會畫出空白（限制總像素在 240 萬以內）、`Image` 解碼不如 `createImageBitmap` 可靠（優先用後者，並可依 EXIF 轉正）。最後再抽樣檢查縮圖是不是整片同色，是的話就改傳原圖。

## 全班學習分析

指揮中心的分析區塊由 `_classAnalytics()` 即時算出，資料來源是名冊、`studentProgress` 與 `taskPhotos`：六張總覽卡（已測驗人數、平均成績、一輪通過率、平均輪數、任務完成率、照片數）、最容易答錯的題目（依 `wrongNums` 分 Boss 統計，對回題目文字）、各任務完成率、需要關注的學生。

各任務完成率需要知道學生完成了「哪幾個」任務，所以 `_studentRecord` 會多傳 `doneTaskIds`；舊資料沒有這個欄位時該區塊會顯示 0%，學生再打一次卡就會補上。

集合結構與權限見 `firebase/README.md`。

遊戲改版後重新產生背景整合版，只要把新檔覆蓋成 `web/game.html` 即可；若遊戲原始碼結構改變導致修補字串對不上，bridge 會直接丟出錯誤，不會靜默失效。

## 遊戲平衡參數（Boss 輪數改在哪）

Boss 補救輪數是 2：第 1 輪原題，答錯後補救 1 輪，仍未通過就轉成「🆘 需老師協助」並記給老師。原始設計是 5 輪，2026-08-11 改為 2 輪。

**輪數的實際來源是 `data-props` 的 `default`，不是程式裡的 `??`。** DC runtime 會把 `data-props` 的 default 灌進 `this.props`（見 `public/game-support.js` 的 `defaults`），所以 `get maxRounds(){ return this.props.maxRounds ?? 5 }` 的 `?? 5` 只是沒有 props 時的退路、平常永遠不會執行——只改 getter 完全沒有效果。同一組參數（`bossMaxHp`、`xpPerLevel`、`perfectBonus`、`maxRounds`）都有這個特性，要改就兩處一起改，並留意 `data-props` 裡各自的 `min`／`max` 範圍。

輪數改動連同畫面上五處寫死「N 輪」的說明文字，是**直接改在遊戲原始碼**上，不走 `vite.config.ts` 的替換——那些替換是為了接上 Firebase 與修版面，屬於整合層；輪數是遊戲規則本身，放進替換會讓原始碼與線上行為對不起來。四份檔案都要一起改，否則會出現「單機版 5 輪、線上 2 輪」：

| 檔案 | 角色 |
| --- | --- |
| `背景整合版/standalone-src.dc.html` | 源頭 |
| `背景整合版/星際冒險學院 背景整合版.html` | 由 `build-background-edition.mjs` 加上背景 CSS 產生 |
| `web/game.html` | 上一份的原樣副本（md5 應相同） |
| `星際冒險學院 單機版.html` | 獨立的離線單機版，不經上面的流程 |

Boss 血量不必跟著調：每題傷害是 `bossMaxHp ÷ 該輪題數` 動態算的，與輪數無關，每輪打滿都剛好把血扣完。

## 架構範圍

- 教師：Google 登入，班級、學生、題庫與 Boss 關卡資料依 `teacherId` 分離。
- 學生：用班級連結進入，不需登入；沒帶代碼時使用內建示範班級與題庫。
- 權限：Firestore 規則（`firebase/firestore.rules`）限制教師只能讀寫自己建立的資料，學生只能取自己那班的公開副本。

## AI：用 Firebase AI Logic 補上 window.claude

遊戲原始碼有兩處呼叫 `window.claude.complete`（答錯後的降階補救題、題目匯入分析），那是原始 Claude 沙箱才有的 API，自架環境沒有。`src/game/ai.ts` 用 Firebase AI Logic 的 Gemini 提供同樣介面的 shim，兩個功能就一起活過來，不必改遊戲自己的邏輯。API key 由 Firebase 代管，不會進原始碼或前端 bundle。

需要在 Firebase Console 啟用 Firebase AI Logic（AI Logic → 開始使用 → 選 **Gemini Developer API**，免付費方案可用）。

Google 會淘汰舊模型——`gemini-2.5-flash` 已對新專案關閉——所以 `MODEL_CANDIDATES` 依序試到通為止，再把可用的模型名記進 localStorage（`starAcademy_aiModel`）。之後模型再被下架時，清掉這個 key 或在清單最前面補上新模型即可。

沒啟用時呼叫會回 `api-not-enabled`，兩處都有退路：

1. **題目匯入**：退回 `questionParser` 的本地解析，支援 `（４）1. 題目？ ①… ②… ③… ④…`、`(A)(B)(C)(D)`、選項換行與六欄 CSV。括號留白代表沒標答案，會暫填第一個選項並在狀態列明講幾題要修。
2. **降階補救題**：退回 `_simplifyQuestion`——每多一輪就刪掉一個錯誤選項並重排順序，難度真的逐輪下降。原版是把同一題原封不動再出一次，還配「先寫下算式」這種只適用數學的提示。

未做 App Check，任何開得了頁面的人都能用掉 AI 額度。班內使用可接受，要對外發布前應加上。

## 已知限制

- 同班學生共用一組班級代碼，所以知道代碼的人可以用任一座號回報成績。班內使用可接受；若要更嚴格，需要每位學生一組個人代碼。
- 跨裝置不即時：老師換裝置要重新整理才看得到最新的班級設定（學生成績則是即時的）。

## 待辦

1. 用兩個教師帳號做資料隔離測試，再部署正式網站。
2. 學生連結目前是區網 IP，換場地會變。要固定網址得先部署（GitHub Pages 或 Firebase Hosting）。
