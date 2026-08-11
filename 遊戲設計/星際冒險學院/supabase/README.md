# Supabase 設定步驟

1. 建立新的 Supabase 專案。
2. 在 `SQL Editor` 執行 `001_schema.sql`。
3. 到 `Authentication > Providers` 啟用 Google，填入 Google OAuth 的用戶端 ID 與密鑰。
4. 在 `Authentication > URL Configuration` 加入本機網址與正式網站網址，例如 `http://localhost:5173`。
5. 複製 `web/.env.example` 成 `web/.env.local`，填入 Project URL 與 anon key。
6. `service_role` 金鑰只供 Edge Function 使用；不可放入 `web/.env.local` 或 Git。

## 上線前必要檢查

- 以兩個不同 Google 教師帳號登入；帳號 A 必須無法讀取帳號 B 的班級與題庫。
- 以班級加入碼加入學生時，確認不收集真實姓名、Email、電話或生日等非必要資料。
- 驗證教師可以刪除班級與學生資料，並在學期末依學校規範清理紀錄。
