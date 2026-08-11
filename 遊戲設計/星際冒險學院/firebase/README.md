# Firebase 設定

本專案使用 Firebase Authentication 的 Google Popup 登入與 Cloud Firestore。

1. 到 Firebase Console 建立專案，新增「Web」應用程式。
2. 將 Firebase SDK 設定填到 `web/.env.local`，欄位名稱參考 `web/.env.example`。
3. Authentication → Sign-in method → Google：啟用並填寫支援電子郵件。
4. Firestore Database → Create database：先以 Production mode 建立。
5. Firestore → Rules：將 `firebase/firestore.rules` 全部貼上後 Publish。
6. Authentication → Settings → Authorized domains：確認 `localhost` 已存在；開發時如以 `127.0.0.1` 開啟，加入 `127.0.0.1`。

Firebase 的 Web API key 可出現在瀏覽器程式碼中；安全性由 Authentication 與 Firestore Rules 控制。不要將 Firebase Admin SDK 金鑰或服務帳戶 JSON 放到 `web/`。

## 資料結構

| 集合 | 誰能讀 | 內容 |
| --- | --- | --- |
| `teachers/{uid}` | 該老師本人 | 教師基本資料 |
| `classrooms/{autoId}` | 該老師本人 | 班級名稱、班級代碼、名冊（座號＋學號＋學習進度） |
| `questionBanks/{autoId}` | 該老師本人 | Boss 題庫 |
| `publicClasses/{班級代碼}` | 知道代碼的任何人 | 學生玩得起來所需的副本：班名、名冊、題庫、任務、商店 |
| `studentProgress/{班級代碼_座號}` | 知道 id 的人／老師可查全班 | 學生的答題成績與任務進度 |
| `taskPhotos/{班級代碼_座號_任務}` | **只有該班老師** | 拍照打卡的照片（縮到長邊 900px 的 JPEG） |

`publicClasses` 讓學生用 `game.html?class=班級代碼` 直接開始，不必登入。規則只開放 `get`（取單一文件）、禁止 `list`，所以不知道代碼就無法把班級掃出來；寫入仍限該班老師本人。

**名冊一律去識別化**：只存座號與學號，不存學生姓名。畫面上以「01 號」這類座號顯示。學生登入時輸入的姓名只留在該裝置的 localStorage，不會上傳。
