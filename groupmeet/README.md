# 📖 Group Meet：小排聚會信息

每週小排聚會的 **信息 PDF** 與 **讀經進度（聖經恢復本）**，手機打開就能讀。

- 首頁 `index.html`：本次聚會（分頁：📄 信息 PDF／📖 聖經進度）＋ 往期信息列表（可搜尋）
- 管理 `admin.html`：輸入管理密碼後上傳 PDF、設定讀經進度、修改或刪除

## 功能

| 頁面 | 說明 |
|---|---|
| 📄 信息 | 直接在網頁裡顯示 PDF（手機也可以看），可放大縮小、開新視窗、下載 |
| 📖 聖經進度 | 每一章一個按鈕，點了就在新分頁打開[網上聖經─聖經恢復本](https://www.recoveryversion.com.tw/)的那一章，並打勾「已讀」（記在自己的手機上） |
| 往期信息 | 以前每週的信息都保留，依年份排列，可用標題、書卷、日期搜尋 |
| 管理 | 新增一週時，日期會自動帶「上週＋7 天」，讀經進度會自動接續上週的進度（可以改）；一週可以有好幾段經文；PDF 和讀經進度至少要有一個 |

「本次聚會」＝今天以後最近的一次聚會；如果都已經過了，就顯示最近的一次。

## 資料存放

資料存在 Supabase 專案 **PaulWu722's Project**（與年終愛筵同一個專案）：

- 資料表 `gm_messages`（每週一筆）、`gm_settings`（管理密碼）、`gm_file_tickets`（上傳許可）
- 檔案空間（Storage）bucket `groupmeet`：公開讀取，只收 PDF，單檔上限 50MB
- 訪客不能直接讀寫資料表；上傳和刪除 PDF 一定要有正確的管理密碼

資料庫已經建好了。要在其他 Supabase 專案重建，把 [`supabase/schema.sql`](supabase/schema.sql) 貼到 SQL Editor 執行即可（可重複執行），再把網址和 publishable 金鑰填進 [`config.js`](config.js)。
`config.js` 的兩個值留空時是**示範模式**：資料只存在自己的瀏覽器，密碼 1234。

### 修改管理密碼

Supabase → SQL Editor 執行：

```sql
update public.gm_settings
  set value = encode(sha256(convert_to('新密碼', 'UTF8')), 'hex')
  where key = 'admin_password_sha256';
```

## 讓網站上線（GitHub Pages）

1. GitHub repo → **Settings → Pages** → Source 選 `Deploy from a branch`，選這個分支、資料夾 `/ (root)`。
2. 網址會是 `https://paulwu722.github.io/paulsweb/groupmeet/`（管理頁：`…/groupmeet/admin.html`）。

## 檔案

| 檔案 | 說明 |
|---|---|
| `index.html` / `app.js` | 首頁（PDF 閱讀器使用 pdf.js） |
| `admin.html` / `admin.js` | 管理頁 |
| `api.js` | 資料存取（Supabase／示範模式） |
| `bible.js` | 66 卷書名、章數與恢復本網址 |
| `common.js` / `style.css` | 共用工具與樣式 |
| `config.js` | 設定 |
| `supabase/schema.sql` | 資料庫 |
