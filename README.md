# 📋 LINE 簡易活動登記平台

在 LINE 裡就能 **建立活動 → 分享到群組 → 好友一鍵報名 → 主辦人看名單**。

- LIFF：https://liff.line.me/2012523033-BncNNabf
- 前端：純靜態網頁（GitHub Pages 即可）
- 後端：**Supabase**（Postgres + Edge Function，推薦）或 Google Apps Script + 試算表，二擇一

## 功能

| 角色 | 功能 |
| --- | --- |
| 主辦人 | 建立活動（開始／結束時間、地點、Google 地圖連結、名額、登記截止、說明、圖片、按鈕文字）、8 種圖卡色調＋即時預覽、從過去的活動套用、自訂登記問題（所屬大區、會所、我可以預備、同行人數、飲食需求、自訂）、活動前提醒（7 天／24 小時／1 小時）、發送到 LINE 群組、完整名單（含電話）、複製接龍、停止／重新開放登記 |
| 參加者 | 點圖卡開啟活動、登記／修改／取消、看接龍名單、個人資料自動帶入 |
| 首頁 | 新活動／已發布／已登記 分頁、安裝到手機桌面、我的個人資料 |

## 檔案

```
index.html   頁面骨架
style.css    樣式（LINE 綠）
app.js       LIFF 前端邏輯
config.js    設定（LIFF ID、後端網址）
supabase/
  migrations/…_init.sql   資料表、權限、報名函式（防超賣）
  functions/api/index.ts  Edge Function：驗證 LINE 身分＋處理所有 API
  config.toml             讓 function 不檢查 Supabase JWT（改用 LINE 驗證）
gas/Code.gs  （替代方案）Google Apps Script 後端
```

## 部署步驟

### 1. 前端放上 GitHub Pages
1. GitHub repo → **Settings → Pages** → Source 選 `Deploy from a branch`，Branch 選要部署的分支 / `root`。
2. 取得網址，例如 `https://paulwu722.github.io/paulsweb/`。

### 2. 設定 LIFF
LINE Developers Console → 你的 LINE Login Channel → **LIFF** → `2012523033-BncNNabf`：
- **Endpoint URL**：填上一步的 GitHub Pages 網址
- **Size**：Full（建議）
- **Scope**：勾選 `openid`、`profile`（**`openid` 一定要勾**，後端驗證身分用）
- **Scan QR**：可不勾
- 開啟 **shareTargetPicker**（LIFF 分頁最下方 / Channel 設定中的「Share target picker」）

### 3A. 建立後端：Supabase（推薦）

**用網頁介面（不用裝任何東西）**
1. Supabase Dashboard → **SQL Editor** → 依序貼上並 Run：
   - `supabase/migrations/20261110000000_init.sql`
   - `supabase/migrations/20261110020000_v2_features.sql`（v2 新功能；可重複執行）
2. **Edge Functions → Deploy a new function → Via Editor**，名稱填 `api`，貼上 `supabase/functions/api/index.ts` → Deploy。
3. 打開這個 function 的 **Details / Settings**，把 **Enforce JWT Verification（Verify JWT）關掉** → Save。
   （身分驗證由 function 自己向 LINE 確認，不需要 Supabase 的 JWT）
4. Project Settings → **API** 複製 Project URL（`https://xxxx.supabase.co`），填到 `config.js` 的 `SUPABASE_URL`，commit & push。

**或用 Supabase CLI**
```bash
supabase login
supabase link --project-ref <你的 project ref>
supabase db push                       # 建立資料表
supabase functions deploy api          # config.toml 已設定 verify_jwt = false
```

- `SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY` 是 Edge Function 內建環境變數，不用自己設。
- 若 LINE Channel ID 不是 `2012523033`，到 Edge Functions → Secrets 新增 `LINE_CHANNEL_ID`。
- 資料可直接在 **Table Editor** 查看 `events`、`registrations`，也能匯出 CSV。
- 資料表有開 RLS 且沒有任何 policy，前端拿 anon key 也讀不到，所有存取都必須經過 function。

### 3C. 活動前提醒（選用）
提醒是用 LINE 官方帳號推播給已登記的人，需要：
1. 在**同一個 Provider** 下建立 **Messaging API** channel（LINE 官方帳號），取得 **Channel access token（long-lived）**。
2. LINE Login channel → **Basic settings** → **Linked LINE Official Account** 選這個官方帳號；LIFF 的 **Add friend option** 設為 **On (Normal)**，登記者開啟時會被邀請加好友（沒加好友收不到推播）。
3. Supabase → Edge Functions → **Secrets** 新增：
   - `LINE_CHANNEL_ACCESS_TOKEN`：上面的 token
   - `CRON_SECRET`：自己取一串亂碼
4. 部署 `supabase/functions/reminders/index.ts`（名稱 `reminders`，**Verify JWT 關掉**）。
5. SQL Editor 執行 `supabase/cron.sql`（先把 `<你的 CRON_SECRET>` 換掉），之後每 10 分鐘檢查一次。

> 官方帳號免費方案每月有推播則數上限，人多時請留意。

### 3B. 建立後端：Google Apps Script（替代方案，僅支援 v1 基本功能）
1. 新增一份 Google 試算表 → **擴充功能 → Apps Script**。
2. 把 `gas/Code.gs` 全部內容貼上並儲存（`CHANNEL_ID` 已填 `2012523033`）。
3. **部署 → 新增部署作業** → 類型選「網頁應用程式」
   - 執行身分：**我**
   - 存取權：**所有人**
4. 授權後複製 Web App 網址（`https://script.google.com/macros/s/……/exec`）。
5. 填到 `config.js` 的 `GAS_URL`（`SUPABASE_URL` 保持空白），commit & push。

> 之後修改 Code.gs 要「管理部署作業 → 編輯 → 版本選新版本」才會生效。

### 4. 使用
在 LINE 聊天室貼上 `https://liff.line.me/2012523033-BncNNabf` 點開即可。
建議把這個網址設成官方帳號的 Rich Menu 按鈕。

## 示範模式

`config.js` 的 `SUPABASE_URL`、`GAS_URL` 都留空時會進入**示範模式**：資料只存在瀏覽器 localStorage，用來先確認畫面流程。
在電腦上直接開（非 LIFF 網域）時會自動使用測試身分：

```bash
python3 -m http.server 8000   # 打開 http://localhost:8000
```
