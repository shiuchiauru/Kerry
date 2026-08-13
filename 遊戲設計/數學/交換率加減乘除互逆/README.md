# 加減乘除的秘密通道：中低年級互逆關係探索（離線版）

原始教材由高師大王玉珍設計、Gemini Canvas 產生。這裡把兩個年級合併成單一頁面，
並把所有外部 CDN 資源改成本地檔案，沒有網路也能在教室的電腦或平板上直接打開使用。

線上版：<https://math-inverse-tunnel.netlify.app>

## 內容

單一頁面 `index.html`，頂端可切換年級：

| 年級 | 主題 | 直接連結 |
| --- | --- | --- |
| 低年級（一、二年級） | 加與減的秘密通道：加減互逆 | `/`　或 `/?grade=low` |
| 中年級（三、四年級） | 乘與除的秘密通道：乘除互逆 | `/?grade=mid` |

每個年級各有四個階段：動手操作 → 模型探索 → 闖關練習 → 貓頭鷹醫生迷思診斷。
兩個年級各自保留原本的配色（低年級鵝黃、中年級淺綠），切換時整頁配色跟著換。

`?grade=mid` 可以直接加進網址列做書籤，開啟後就停在中年級。

## 檔案

| 檔案 | 說明 |
| --- | --- |
| `index.html` | 教材本體，兩個年級都在裡面 |
| `assets/` | Tailwind、Vue、FontAwesome、字型 |
| `netlify.toml` | 部署設定與舊網址轉址 |

## 怎麼用

- **教室電腦／平板**：把整個資料夾複製過去，直接用瀏覽器打開 `index.html`。
  `assets` 資料夾必須跟 HTML 放在一起，不能只複製 HTML 檔。
  用 `file://` 開啟時年級切換仍然可用，只是網址不會跟著更新。
- **線上版**：整個資料夾就是可直接部署的靜態網站。

## 離線化做了哪些事

1. `cdn.tailwindcss.com` → `assets/tailwind.js`
2. `unpkg.com/vue@3` → `assets/vue.global.prod.js`
3. FontAwesome 6.4.0 → `assets/fontawesome.css` ＋ `assets/webfonts/`
4. Google Fonts → `assets/fonts.css` ＋ `assets/fonts/`
   Noto Sans TC 已依教材實際用到的 634 個字做子集化（181 KB），
   萬一出現子集以外的字，會自動退回系統中文字型（PingFang TC／微軟正黑體）。
5. 字型堆疊補上系統中文字型作為備援。
6. 修掉中年級那份從剪貼簿帶進來的 5,398 個不斷行空格（U+00A0）。
   其中 14 個黏在標籤名稱後面，會讓瀏覽器解析出 `BUTTON␣` 這種假標籤、
   使整頁 Vue 無法啟動；原始檔在瀏覽器直接開啟時是壞的，這裡已修正。

## 合併方式

兩個年級各自仍是獨立的 Vue app，分別掛在 `#app-low` 與 `#app-mid`，
程式碼用 IIFE 包起來，變數不會互相覆蓋，星星數也各自計算。
要單獨修改某個年級時，只要動對應那一段就好，不會影響另一個年級。

## 關於「我的 AI 小老師」

這一關原本要呼叫 Gemini API，金鑰由 Gemini Canvas 執行環境注入，離開 Canvas 就失效。
離線版改成：`GEMINI_API_KEY` 留空時，直接顯示內建的貓頭鷹醫生解說（每個年級三個常見迷思案例各一則），
不需要網路。學生自己輸入題目時，會顯示通用的驗算口訣提醒。

要改回線上即時診斷，在 HTML 中找到對應年級的這一行填入金鑰即可（兩個年級各有一行）：

```js
const GEMINI_API_KEY = "";
```

填了金鑰之後，原本的 Gemini 呼叫流程會照常運作。

## 授權

- 教材內容：高師大王玉珍
- Fredoka、Noto Sans TC：SIL Open Font License 1.1
- Font Awesome Free 6.4.0：圖示 CC BY 4.0、字型 SIL OFL 1.1、程式碼 MIT
- Tailwind CSS、Vue 3：MIT
