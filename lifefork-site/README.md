# LifeFork（人生岔路 · 選擇模擬）

做一個重大的決定，先跟身邊的人練習怎麼開口，再快轉三年看看會怎樣。
這個資料夾是可以直接放到自己網域上的靜態網站版本（由 Claude artifact 開發版 v0.24 拆出來）。

角色對話由 **Google Gemini** 演出，**使用玩家自己的 Gemini API 金鑰**：網站本身沒有後端，也不會替玩家付 AI 費用。

---

## 資料夾內容

```
lifefork-site/
├── index.html            頁面結構（所有畫面的 HTML）
├── css/style.css         樣式
├── js/
│   ├── ai-gemini.js      AI 介面：金鑰設定、呼叫 Gemini、錯誤處理
│   ├── app.js            遊戲主程式：設定、對話、章節、結局、所有提示詞
│   └── stage3d.js        3D 場景（three.js）：人物、場景、動作、光影
├── assets/models/        人物與髮型模型（.glb）
├── _headers              Cloudflare Pages 的快取設定（其他平台會忽略）
└── README.md
```

想改的東西在哪裡：

| 想改 | 檔案 |
| --- | --- |
| 文字、按鈕、畫面結構 | `index.html` |
| 顏色、字體、版面 | `css/style.css` |
| 角色怎麼說話、提示詞、規則與數值 | `js/app.js`（搜尋 `Prompt(`） |
| 換 AI 模型或 AI 服務商 | `js/ai-gemini.js` |
| 3D 場景、人物動作 | `js/stage3d.js` |

---

## 在自己電腦上跑

因為用了 ES module 和讀取模型檔，**不能直接雙擊 index.html 開啟**，要用一個簡單的本機伺服器：

```bash
cd lifefork-site
python3 -m http.server 8000
```

然後用瀏覽器開 <http://localhost:8000>。

---

## 部署到自己的網域

任何能放靜態網站的服務都可以。以下兩種都免費。

### 方法 A：Cloudflare Pages（推薦）

1. 把整個 `lifefork-site` 資料夾放到 GitHub 的一個 repository（或直接用拖拉上傳）。
2. 登入 Cloudflare → **Workers & Pages** → **Create** → **Pages**。
   - 用 GitHub：選 repository，Build command 留空，Build output directory 填 `/`（若資料夾在 repo 子目錄就填那個子目錄）。
   - 不用 GitHub：選 **Upload assets**，把資料夾拖進去。
3. 部署完成後會拿到 `xxx.pages.dev` 網址。
4. 綁網域：專案頁 → **Custom domains** → **Set up a custom domain**，輸入你的網域，照指示設定 DNS（網域在 Cloudflare 管理的話會自動設好）。

### 方法 B：GitHub Pages

1. 把資料夾內容推到 GitHub repository。
2. repository → **Settings** → **Pages** → Source 選 **Deploy from a branch**，選分支與資料夾。
3. 綁網域：同一頁 **Custom domain** 填你的網域，並到網域商設定 CNAME 指向 `你的帳號.github.io`。

> 兩個平台的介面名稱偶爾會改，以平台當時的說明為準。

---

## 玩家要做的事：設定 Gemini 金鑰

首頁有「AI 設定」區塊：

1. 到 [Google AI Studio](https://aistudio.google.com/apikey)，用 Google 帳號登入，按 **Create API key**。
2. 把金鑰貼到網站，按「儲存並測試」。

說明：

- **金鑰只存在玩家自己的瀏覽器**（勾「記住在這台電腦」用 localStorage，不勾則關分頁就忘記），由瀏覽器直接送到 Google，不經過你的網站。
- **費用與額度算在玩家自己的 Google 帳號**。免費方案每天有次數上限，用完會顯示提示。
- 模式：「省額度」全部用最新的 Flash-Lite 模型；「品質優先」在重要步驟改用 Flash 模型（較耗額度）。模型名稱不寫死，會用金鑰向 Google 查詢可用模型後自動挑選。
- **隱私**：Google 的免費方案可能會用送出的內容改進他們的服務，也可能有人工審閱。網站上已提醒玩家不要輸入真實姓名或敏感資料。

建議提醒玩家（可放在網站上）：在 Google Cloud Console 把金鑰的「應用程式限制」設成只允許你的網域（HTTP referrer），就算金鑰外洩，別人也不能拿去別的地方用。

---

## 已知限制

- 這版的角色提示詞原本是為 Claude 寫的，換成 Gemini 後**對話語氣與品質會有差異**，上線前請實際玩幾輪，必要時調整 `js/app.js` 裡的提示詞。
- Gemini 免費方案的每日次數很少（實際上限以玩家在 Google AI Studio 看到的為準）；一局完整版會呼叫很多次 AI，免費額度可能玩不完一局。5 分鐘版較省。
- 3D 場景需要支援 WebGL 的瀏覽器；舊手機可能會卡，網站會自動降低畫質。
- three.js 由 jsDelivr CDN 載入，玩家需要能連上 `cdn.jsdelivr.net`；字體由 Google Fonts 載入。

---

## 授權與來源

- 人物模型：Quaternius「Universal Base Characters」免費版，CC0 1.0（quaternius.com）。載入時有修改（去五官、調整比例與服裝）。
- 3D 引擎：three.js r160（MIT License），由 jsDelivr 載入。
- 字體：Noto Sans TC / Noto Serif TC（SIL Open Font License），由 Google Fonts 載入。
