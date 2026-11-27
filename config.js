// =========================================================
// ຕັ້ງຄ່າການເຊື່ອມຕໍ່ Supabase
// ເອົາຄ່າໄດ້ຈາກ: Supabase Dashboard → Project Settings → API Keys
// ໃຊ້ "anon" ຫຼື "publishable" key ເທົ່ານັ້ນ — ຫ້າມໃສ່ service_role / secret key
// =========================================================
window.LAB_CONFIG = {
  SUPABASE_URL: "https://aqqcpviycadgprmuqnyz.supabase.co",
  SUPABASE_KEY: "sb_publishable_-ci59WFH9Q_SeunHunOsjw_suPo3WR9",

  // ໃຊ້ສ້າງ email ພາຍໃນຈາກຊື່ຜູ້ໃຊ້ (ເຊັ່ນ somjai → somjai@lab.local)
  // ຕ້ອງກົງກັບ EMAIL_DOMAIN ໃນ supabase/admin-users/index.ts
  EMAIL_DOMAIN: "lab.local",

  // ຊື່ Edge Function ສຳລັບຈັດການບັນຊີ (ຕາມຊື່ໃນ Supabase → Edge Functions)
  ADMIN_FUNCTION: "hyper-function",
};
