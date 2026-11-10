// ===== 網站設定（只需要改這個檔案） =====
window.APP_CONFIG = {
  // Supabase 連線資訊（Supabase 後台 → Project Settings → API）
  // 兩個都留空 = 示範模式（資料只存在自己的瀏覽器，方便預覽）。
  SUPABASE_URL: '',  // 例如 'https://abcdefghijkl.supabase.co'
  SUPABASE_KEY: '',  // anon public 金鑰（eyJ... 開頭）或 publishable 金鑰（sb_publishable_ 開頭）

  // 活動資訊：留空的項目不會顯示
  EVENT: {
    date: '12/20（日）',
    time: '早上 9:30–12:00',
    place: '祥鶴日本料理店',
    address: '413臺中市霧峰區中正里林森路784號',
  },
};
