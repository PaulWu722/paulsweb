# 📋 LINE 簡易活動登記平台

在 LINE 裡就能 **建立活動 → 分享到群組 → 好友一鍵報名 → 主辦人看名單**。

- LIFF：https://liff.line.me/2012412693-a7phfbWa
- 前端：純靜態網頁（GitHub Pages 即可）
- 後端：Google Apps Script + Google 試算表（免費、免架伺服器）

## 功能

| 角色 | 功能 |
| --- | --- |
| 主辦人 | 建立／編輯活動（日期、時間、地點、說明、名額、每人可報人數、截止日、是否需電話）、分享 Flex 訊息給好友或群組、查看報名名單、一鍵複製名單貼到聊天室、關閉／重新開放報名 |
| 參加者 | 點分享卡片直接開啟活動、報名、修改、取消報名 |
| 首頁 | 「我主辦的活動」「我報名的活動」 |

報名時會用 LINE 身分登入，後端以 ID Token 向 LINE 驗證，所以每人每活動只有一筆報名，也只有主辦人看得到名單。

## 檔案

```
index.html   頁面骨架
style.css    樣式（LINE 綠）
app.js       LIFF 前端邏輯
config.js    設定（LIFF ID、GAS 網址）
gas/Code.gs  Google Apps Script 後端
```

## 部署步驟

### 1. 前端放上 GitHub Pages
1. GitHub repo → **Settings → Pages** → Source 選 `Deploy from a branch`，Branch 選要部署的分支 / `root`。
2. 取得網址，例如 `https://paulwu722.github.io/paulsweb/`。

### 2. 設定 LIFF
LINE Developers Console → 你的 LINE Login Channel → **LIFF** → `2012412693-a7phfbWa`：
- **Endpoint URL**：填上一步的 GitHub Pages 網址
- **Size**：Full（建議）
- **Scope**：勾選 `openid`、`profile`（**`openid` 一定要勾**，後端驗證身分用）
- **Scan QR**：可不勾
- 開啟 **shareTargetPicker**（LIFF 分頁最下方 / Channel 設定中的「Share target picker」）

### 3. 建立後端（Google Apps Script）
1. 新增一份 Google 試算表 → **擴充功能 → Apps Script**。
2. 把 `gas/Code.gs` 全部內容貼上並儲存（`CHANNEL_ID` 已填 `2012412693`）。
3. **部署 → 新增部署作業** → 類型選「網頁應用程式」
   - 執行身分：**我**
   - 存取權：**所有人**
4. 授權後複製 Web App 網址（`https://script.google.com/macros/s/……/exec`）。
5. 填到 `config.js` 的 `GAS_URL`，commit & push。

> 之後修改 Code.gs 要「管理部署作業 → 編輯 → 版本選新版本」才會生效。

### 4. 使用
在 LINE 聊天室貼上 `https://liff.line.me/2012412693-a7phfbWa` 點開即可。
建議把這個網址設成官方帳號的 Rich Menu 按鈕。

## 示範模式

`config.js` 的 `GAS_URL` 留空時會進入**示範模式**：資料只存在瀏覽器 localStorage，用來先確認畫面流程。
在電腦上直接開（非 LIFF 網域）時會自動使用測試身分：

```bash
python3 -m http.server 8000   # 打開 http://localhost:8000
```
