// ===== 網站設定（只需要改這個檔案） =====
window.APP_CONFIG = {
  // Supabase 連線資訊（Supabase 後台 → Project Settings → API）
  // 兩個都留空 = 示範模式（資料只存在自己的瀏覽器，方便預覽）。
  SUPABASE_URL: 'https://gserdnkovlwfdgcaguqe.supabase.co',
  // publishable 金鑰：本來就是給網站公開使用的（不是 secret / service_role 金鑰）
  SUPABASE_KEY: 'sb_publishable_OkPLiqg_-Jnu1ywt8j-o0A_R_BFyIZN',

  // 單位名稱（用於「複製名單文字」的第一行）
  ORG_NAME: '台中市召會-十七會所(霧峰小區)',

  // 活動資訊：留空的項目不會顯示
  EVENT: {
    date: '12/20（日）',
    time: '早上 9:30–12:00',
    place: '祥鶴日本料理店',
    address: '413臺中市霧峰區中正里林森路784號',
  },
};
