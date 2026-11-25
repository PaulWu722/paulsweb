# paulsweb

召會服事用的網站集合，用 GitHub Pages 從 `main` 分支發布：`https://paulwu722.github.io/paulsweb/`

| 資料夾 | 網站 | 網址 |
| --- | --- | --- |
| `/` | 入口頁（列出所有網站；從 LINE 開啟會自動轉到活動登記） | `/paulsweb/` |
| `event/` | 簡易活動登記＋小排福音代禱牆（LINE LIFF） | `/paulsweb/event/` |
| `aiyan/` | 年終愛筵報名＋桌次管理 | `/paulsweb/aiyan/` |
| `kaizhan/` | 南三照顧區・開展週配搭回條＋統計 | `/paulsweb/kaizhan/` |
| `huifang/` | 我的回訪（製作中） | `/paulsweb/huifang/` |

各網站的說明在各自資料夾的 `README.md`。
所有網站共用同一個 Supabase 專案，資料表各自分開：`event` 用 `events`／`registrations`／`profiles`／`prayer_entries`，`aiyan` 用 `feast_*`，`kaizhan` 用 `kz_responses`。

## 修改網站
直接改 `main` 上對應資料夾的檔案，push 後約 1～2 分鐘 GitHub Pages 就會更新。

## LINE LIFF（event）
LIFF `2012523033-BncNNabf` 的 Endpoint URL 建議設為 `https://paulwu722.github.io/paulsweb/event/`。
若還設在 `/paulsweb/`，入口頁也會自動把 LINE 進來的人轉到 `event/`。
