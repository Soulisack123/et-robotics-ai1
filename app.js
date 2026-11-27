/* =========================================================
   ລະບົບຈັດການຫ້ອງທົດລອງ — HTML / CSS / JS + Supabase
   - Login ດ້ວຍ Supabase Auth (ຊື່ຜູ້ໃຊ້ → email ພາຍໃນ)
   - ຂໍ້ມູນເກັບໃນ Supabase (Postgres) ໃຊ້ຮ່ວມກັນທຸກເຄື່ອງ
   - ສິດ admin / member ກວດຢູ່ຝັ່ງ server ດ້ວຍ Row Level Security
   ========================================================= */

// ກັນບໍ່ໃຫ້ເວັບອື່ນເອົາໜ້ານີ້ໄປຊ້ອນໃນ iframe (clickjacking) — ໃຊ້ແທນ header ທີ່ GitHub Pages ຕັ້ງບໍ່ໄດ້
if (window.top !== window.self) { document.documentElement.style.display = "none"; window.top.location = window.self.location; }

const CFG = window.LAB_CONFIG;
const EQUIP_STATUS = ["ພ້ອມໃຊ້", "ຖືກຢືມ", "ເປ່ເພ", "ກຳລັງສ້ອມແປງ"];
const TASK_STATUS = ["ຕ້ອງເຮັດ", "ກຳລັງເຮັດ", "ສຳເລັດແລ້ວ"];
const TASK_COLOR = ["#94a3b8", "#f59e0b", "#10b981"];
const PRIORITY = ["ສູງ", "ກາງ", "ຕ່ຳ"];
const ROLES = { admin: "ຜູ້ດູແລລະບົບ (Admin)", member: "ສະມາຊິກ" };
const AV_COLORS = ["#6366f1", "#ec4899", "#f59e0b", "#10b981", "#0ea5e9", "#8b5cf6", "#ef4444", "#14b8a6"];
const NONE = "— ບໍ່ລະບຸ —";
const MIN_PW = 6;

let data = { members: [], equipment: [], tasks: [], history: [], categories: [] };
let me = null;          // profile ຂອງຜູ້ໃຊ້ທີ່ login ຢູ່
let myEmail = "";       // email ຈິງຂອງບັນຊີ (ໃຊ້ຕອນປ່ຽນລະຫັດ)
let channel = null;     // realtime

/* =========================================================
   Supabase client
   "ຈື່ຂ້ອຍໄວ້" → ເກັບ session ໃນ localStorage, ບໍ່ດັ່ງນັ້ນເກັບໃນ sessionStorage
   ========================================================= */
const REMEMBER_KEY = "labRemember";
const authStore = () => (localStorage.getItem(REMEMBER_KEY) === "1" ? localStorage : sessionStorage);
if (!window.supabase) {
  const el = document.getElementById("loginError");
  el.textContent = "ໂຫຼດ Supabase library ບໍ່ໄດ້ — ກວດການເຊື່ອມຕໍ່ອິນເຕີເນັດ ແລ້ວລອງໃໝ່";
  el.classList.add("show");
  document.getElementById("loginBtn").disabled = true;
  throw new Error("supabase-js not loaded");
}
const sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storage: {
      getItem: k => authStore().getItem(k),
      setItem: (k, v) => authStore().setItem(k, v),
      removeItem: k => { localStorage.removeItem(k); sessionStorage.removeItem(k); },
    },
  },
});
// ພິມໄດ້ທັງ "admin" ແລະ "admin@lab.local"
const toEmail = username => {
  const u = username.trim().toLowerCase();
  return u.includes("@") ? u : `${u}@${CFG.EMAIL_DOMAIN}`;
};

/* =========================================================
   Helper
   ========================================================= */
const $ = sel => document.querySelector(sel);
function localISO(d) { return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
function offsetDate(days) { const d = new Date(); d.setDate(d.getDate() + days); return localISO(d); }
function today() { return localISO(new Date()); }
function esc(s) { return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function memberName(id) { return data.members.find(m => m.id === id)?.name || NONE; }
function avColor(id) {
  if (!id) return "#94a3b8";
  let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AV_COLORS[h % AV_COLORS.length];
}
// ຕົວອັກສອນທຳອິດ (ຂ້າມສະຫຼະທີ່ຂຽນກ່ອນພະຍັນຊະນະ ເຊັ່ນ ເ ແ ໂ ໃ ໄ ຂອງລາວ/ໄທ)
function initial(name) {
  const s = (name || "?").trim().replace(/^[\u0EC0-\u0EC4\u0E40-\u0E44]+/, "");
  return s.charAt(0) || (name || "?").trim().charAt(0);
}
const nullIfEmpty = v => (v === "" || v == null ? null : v);

const LAO_MONTHS = ["ມັງກອນ", "ກຸມພາ", "ມີນາ", "ເມສາ", "ພຶດສະພາ", "ມິຖຸນາ", "ກໍລະກົດ", "ສິງຫາ", "ກັນຍາ", "ຕຸລາ", "ພະຈິກ", "ທັນວາ"];
const LAO_DAYS = ["ວັນອາທິດ", "ວັນຈັນ", "ວັນອັງຄານ", "ວັນພຸດ", "ວັນພະຫັດ", "ວັນສຸກ", "ວັນເສົາ"];
const pad = n => String(n).padStart(2, "0");
function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00");
  return `${d.getDate()} ${LAO_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
function fmtTime(iso) {
  const d = new Date(iso);
  return `${d.getDate()} ${LAO_MONTHS[d.getMonth()]} · ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fmtLong(d) { return `${LAO_DAYS[d.getDay()]} ທີ ${d.getDate()} ${LAO_MONTHS[d.getMonth()]} ${d.getFullYear()}`; }

let toastTimer;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
}
/* ---------- Popup ແຈ້ງວ່າສຳເລັດ ---------- */
const POP_KINDS = {
  add:    { icon: "check", color: "#10b981" },
  save:   { icon: "check", color: "#4f46e5" },
  delete: { icon: "trash", color: "#e11d48" },
  done:   { icon: "party", color: "#f59e0b" },
};
function popKind(title) {
  if (/ລຶບ/.test(title)) return "delete";
  if (/ວຽກນີ້ສຳເລັດ/.test(title)) return "done";
  if (/ເພີ່ມ|ມອບໝາຍ|ສ້າງ|ຢືມ/.test(title)) return "add";
  return "save";
}
let popTimer;
function success(title, detail = "", kind = popKind(title)) {
  const k = POP_KINDS[kind] || POP_KINDS.save;
  const icon = k.icon === "check"
    ? `<svg viewBox="0 0 52 52"><circle cx="26" cy="26" r="24"/><path d="M15 27 l7 7 l15 -15"/></svg>`
    : k.icon === "trash" ? `<span class="pe">🗑️</span>` : `<span class="pe">🎉</span>`;
  const el = $("#successPop");
  el.style.setProperty("--pc", k.color);
  el.innerHTML = `<div class="sp-card" role="status">
      <div class="sp-icon">${icon}</div>
      <div class="sp-title">${esc(title)}</div>
      ${detail ? `<div class="sp-detail">${esc(detail)}</div>` : ""}
      <div class="sp-bar"><span></span></div>
    </div>`;
  el.classList.remove("show"); void el.offsetWidth;
  el.classList.add("show");
  if (kind === "done") confetti(el.querySelector(".sp-card"));
  clearTimeout(popTimer);
  popTimer = setTimeout(() => el.classList.remove("show"), 2000);
}
function confetti(host) {
  const colors = ["#f59e0b", "#10b981", "#6366f1", "#ec4899", "#0ea5e9"];
  for (let i = 0; i < 24; i++) {
    const c = document.createElement("i");
    c.className = "cf";
    c.style.background = colors[i % colors.length];
    c.style.left = 50 + (Math.random() * 60 - 30) + "%";
    c.style.setProperty("--dx", (Math.random() * 260 - 130) + "px");
    c.style.setProperty("--dy", (-80 - Math.random() * 120) + "px");
    c.style.setProperty("--r", (Math.random() * 720 - 360) + "deg");
    c.style.animationDelay = Math.random() * 0.15 + "s";
    host.appendChild(c);
  }
}

function busy(on) { document.body.classList.toggle("busy", on); }

// ແປ error ຈາກ Supabase ໃຫ້ອ່ານງ່າຍ
function errText(error) {
  const m = error?.message || String(error);
  if (/row-level security|permission denied/i.test(m)) return "ທ່ານບໍ່ມີສິດເຮັດລາຍການນີ້";
  if (/Failed to fetch|NetworkError/i.test(m)) return "ເຊື່ອມຕໍ່ server ບໍ່ໄດ້ — ກວດອິນເຕີເນັດ";
  if (/task_updates/i.test(m)) return "ຍັງບໍ່ໄດ້ແລ່ນ supabase/05_task_updates.sql ໃນ SQL Editor";
  if (/progress|update_task_progress|PGRST202/i.test(m)) return "ຍັງບໍ່ໄດ້ແລ່ນ supabase/03_member_progress.sql ໃນ SQL Editor";
  if (/image_path|categor/i.test(m) && /does not exist|Could not find/i.test(m)) return "ຍັງບໍ່ໄດ້ແລ່ນ supabase/02_images_categories.sql ໃນ SQL Editor";
  return m;
}

/* =========================================================
   ອ່ານ / ຂຽນ ຂໍ້ມູນ
   ========================================================= */
let warnedMigration = false;
async function refresh() {
  const [p, e, t, h, c] = await Promise.all([
    sb.from("profiles").select("*").order("created_at"),
    sb.from("equipment").select("*").order("code"),
    sb.from("tasks").select("*").order("created_at"),
    sb.from("history").select("*").order("time", { ascending: false }).limit(30),
    sb.from("categories").select("*").order("name"),
  ]);
  const err = p.error || e.error || t.error || h.error;
  if (err) { toast("❌ " + errText(err)); return; }
  if (c.error && !warnedMigration) { warnedMigration = true; toast("⚠️ ຍັງບໍ່ໄດ້ແລ່ນ 02_images_categories.sql ໃນ Supabase"); }
  data = { members: p.data, equipment: e.data, tasks: t.data, history: h.data, categories: c.error ? [] : c.data };
  renderAll();
}

async function log(text) {
  await sb.from("history").insert({ actor: me.id, text: String(text).slice(0, 500) });
}

// ແລ່ນຄຳສັ່ງ → ບັນທຶກປະຫວັດ → ໂຫຼດໃໝ່ → ແຈ້ງເຕືອນ
async function run(promise, okMsg, logText) {
  busy(true);
  try {
    const { error } = await promise;
    if (error) { toast("❌ " + errText(error)); return false; }
    if (logText) await log(logText);
    await refresh();
    if (okMsg) success(okMsg, logText || "");
    return true;
  } finally { busy(false); }
}

// ເອີ້ນ Edge Function admin-users (ສະເພາະ admin)
async function adminUsers(body) {
  busy(true);
  try {
    const { data: res, error } = await sb.functions.invoke(CFG.ADMIN_FUNCTION || "admin-users", { body });
    if (error) {
      let msg = error.message;
      try { msg = (await error.context.json()).error || msg; } catch (_) {}
      if (/Failed to send|not found/i.test(msg)) msg = `ບໍ່ພົບ Edge Function “${CFG.ADMIN_FUNCTION || "admin-users"}” — ກວດຊື່ໃນ config.js`;
      return modalErr(msg);
    }
    return res;
  } finally { busy(false); }
}

function subscribeRealtime() {
  let timer;
  channel = sb.channel("lab-changes")
    .on("postgres_changes", { event: "*", schema: "public" }, () => {
      clearTimeout(timer);
      timer = setTimeout(refresh, 300);
    })
    .subscribe(status => {
      const el = $("#syncState");
      const ok = status === "SUBSCRIBED";
      el.textContent = ok ? "● ອັບເດດອັດຕະໂນມັດ" : "● ບໍ່ໄດ້ເຊື່ອມຕໍ່ realtime";
      el.classList.toggle("off", !ok);
    });
}

/* =========================================================
   ສິດການໃຊ້ງານ (ກວດຢູ່ໜ້າເວັບເພື່ອເຊື່ອງປຸ່ມ — server ກວດຊ້ຳດ້ວຍ RLS)
   ========================================================= */
const isAdmin = () => me?.sys_role === "admin";
const canEditTask = t => isAdmin() || t.assignee === me.id;
const canReturn = e => isAdmin() || e.borrower === me.id;
function deny() { toast("⛔ ທ່ານບໍ່ມີສິດເຮັດລາຍການນີ້"); return false; }

/* =========================================================
   Login / Logout
   ========================================================= */
$("#togglePass").addEventListener("click", () => {
  const p = $("#loginPass");
  p.type = p.type === "password" ? "text" : "password";
});

function loginError(msg) {
  const err = $("#loginError");
  err.classList.remove("show"); void err.offsetWidth;
  err.textContent = msg;
  err.classList.add("show");
}

$("#loginForm").addEventListener("submit", async e => {
  e.preventDefault();
  $("#loginError").classList.remove("show");
  const username = $("#loginUser").value.trim().toLowerCase();
  const password = $("#loginPass").value;
  localStorage.setItem(REMEMBER_KEY, $("#loginRemember").checked ? "1" : "0");

  const btn = $("#loginBtn");
  btn.disabled = true; btn.textContent = "ກຳລັງເຂົ້າສູ່ລະບົບ...";
  try {
    const { data: auth, error } = await sb.auth.signInWithPassword({ email: toEmail(username), password });
    if (error) {
      loginError(/invalid login|invalid_credentials/i.test(error.message) ? "ຊື່ຜູ້ໃຊ້ ຫຼື ລະຫັດຜ່ານບໍ່ຖືກຕ້ອງ" : errText(error));
      $("#loginPass").select();
      return;
    }
    $("#loginPass").value = "";
    await enterApp(auth.user);
    if (me) toast(`ຍິນດີຕ້ອນຮັບ, ${me.name} 👋`);
  } finally {
    btn.disabled = false; btn.textContent = "ເຂົ້າສູ່ລະບົບ";
  }
});

async function enterApp(user) {
  busy(true);
  try {
    me = { id: user.id };
    myEmail = user.email;
    await refresh();
    me = data.members.find(m => m.id === user.id);
    if (!me) {
      await sb.auth.signOut();
      loginError("ບັນຊີນີ້ບໍ່ມີຂໍ້ມູນໃນລະບົບ (ກວດວ່າແລ່ນ schema.sql ແລ້ວ)");
      return;
    }
    currentPerson = isAdmin() ? "all" : me.id;
    document.body.classList.remove("logged-out");
    document.body.classList.add("logged-in");
    goPage("dashboard");
    renderAll();
    if (!channel) subscribeRealtime();
  } finally { busy(false); }
}

async function logout() {
  closeModal();
  if (channel) { await sb.removeChannel(channel); channel = null; }
  await sb.auth.signOut();
  me = null;
  data = { members: [], equipment: [], tasks: [], history: [], categories: [] };
  document.body.classList.remove("logged-in", "is-admin");
  document.body.classList.add("logged-out");
  $("#loginUser").focus();
}
$("#logoutBtn").addEventListener("click", () => { if (confirm("ອອກຈາກລະບົບແທ້ບໍ່?")) logout(); });

/* ---------- ປ່ຽນລະຫັດຜ່ານຂອງຕົນເອງ ---------- */
function openChangePw() {
  openModal("ປ່ຽນລະຫັດຜ່ານ",
    field("ລະຫັດຜ່ານປັດຈຸບັນ", "old", "", "password", 'required autocomplete="current-password"') +
    field("ລະຫັດຜ່ານໃໝ່", "pw1", "", "password", `required minlength="${MIN_PW}" autocomplete="new-password"`, `ຢ່າງໜ້ອຍ ${MIN_PW} ຕົວ`) +
    field("ຢືນຢັນລະຫັດຜ່ານໃໝ່", "pw2", "", "password", `required minlength="${MIN_PW}" autocomplete="new-password"`),
    async fd => {
      if (fd.pw1 !== fd.pw2) return modalErr("ລະຫັດຜ່ານໃໝ່ບໍ່ກົງກັນ");
      busy(true);
      try {
        const check = await sb.auth.signInWithPassword({ email: myEmail, password: fd.old });
        if (check.error) return modalErr("ລະຫັດຜ່ານປັດຈຸບັນບໍ່ຖືກຕ້ອງ");
        const { error } = await sb.auth.updateUser({ password: fd.pw1 });
        if (error) return modalErr(errText(error));
        await sb.rpc("clear_must_change");
      } finally { busy(false); }
      await log("ປ່ຽນລະຫັດຜ່ານ");
      await refresh();
      success("ປ່ຽນລະຫັດຜ່ານສຳເລັດແລ້ວ", "", "save");
    });
}
$("#changePwBtn").addEventListener("click", openChangePw);
$("#noticeChangePw").addEventListener("click", e => { e.preventDefault(); openChangePw(); });

/* =========================================================
   ເມນູ
   ========================================================= */
const ADMIN_PAGES = ["categories", "members"];
function goPage(page) {
  if (!isAdmin() && ADMIN_PAGES.includes(page)) page = "dashboard";
  document.querySelectorAll(".nav-item").forEach(b => b.classList.toggle("active", b.dataset.page === page));
  document.querySelectorAll(".page").forEach(p => p.classList.toggle("active", p.id === page));
  window.scrollTo(0, 0);
}
document.querySelectorAll(".nav-item").forEach(btn => btn.addEventListener("click", () => goPage(btn.dataset.page)));

/* =========================================================
   Modal
   ========================================================= */
let modalSubmit = null;
function openModal(title, html, onSubmit, opts = {}) {
  $("#modalTitle").textContent = title;
  $("#modalBody").innerHTML = html;
  $("#modalError").classList.remove("show");
  modalSubmit = onSubmit;
  const form = $("#modalForm");
  form.classList.toggle("wide", !!opts.wide);
  form.querySelector("button[type=submit]").style.display = opts.viewOnly ? "none" : "";
  $("#modalCancel").textContent = opts.viewOnly ? "ປິດ" : "ຍົກເລີກ";
  $("#modalBg").classList.add("show");
  setTimeout(() => $("#modalBody").querySelector("input:not([type=hidden]):not([disabled]), select, textarea")?.focus(), 50);
}
function closeModal() { $("#modalBg").classList.remove("show"); modalSubmit = null; }
function modalErr(msg) {
  const el = $("#modalError");
  el.classList.remove("show"); void el.offsetWidth;
  el.textContent = msg; el.classList.add("show");
  return false;
}
$("#modalCancel").addEventListener("click", closeModal);
$("#modalX").addEventListener("click", closeModal);
$("#modalBg").addEventListener("mousedown", e => { if (e.target.id === "modalBg") closeModal(); });
document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });
$("#modalForm").addEventListener("submit", async e => {
  e.preventDefault();
  const fd = Object.fromEntries(new FormData(e.target).entries());
  if (!modalSubmit) return;
  const submitBtn = e.target.querySelector("button[type=submit]");
  submitBtn.disabled = true;
  try {
    const result = await modalSubmit(fd);
    if (result !== false) closeModal();
  } finally { submitBtn.disabled = false; }
});

function field(label, name, value = "", type = "text", extra = "", hint = "") {
  return `<div class="field"><label>${label}</label><input type="${type}" name="${name}" value="${esc(value)}" ${extra}>${hint ? `<div class="hint">${hint}</div>` : ""}</div>`;
}
function selectField(label, name, options, value, extra = "") {
  const opts = options.map(o => {
    const [v, t] = Array.isArray(o) ? o : [o, o];
    return `<option value="${esc(v)}" ${v === value ? "selected" : ""}>${esc(t)}</option>`;
  }).join("");
  return `<div class="field"><label>${label}</label><select name="${name}" ${extra}>${opts}</select></div>`;
}
function memberOptions(withEmpty = true) {
  const list = data.members.map(m => [m.id, m.name]);
  return withEmpty ? [["", NONE], ...list] : list;
}

/* =========================================================
   1) ອຸປະກອນ (ມີຮູບ)
   ========================================================= */
const BUCKET = "equipment-images";
const NO_CAT = "— ບໍ່ມີໝວດ —";
let equipView = localStorage.getItem("labEquipView") || "cards";

$("#equipFilterStatus").innerHTML = `<option value="">ທຸກສະຖານະ</option>` + EQUIP_STATUS.map(s => `<option>${s}</option>`).join("");

// ຮັບສະເພາະຊື່ໄຟລ໌ທີ່ລະບົບສ້າງເອງ (uuid.jpg) ເພື່ອກັນການແຊກໂຄ້ດຜ່ານ URL ຮູບ
const SAFE_IMG = /^[0-9a-f-]{36}\.jpg$/i;
const imgUrl = path => (path && SAFE_IMG.test(path) ? sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl : "");
// ຮັບສະເພາະສີແບບ #rrggbb
const safeColor = (c, fb = "#64748b") => (/^#[0-9a-f]{6}$/i.test(c || "") ? c : fb);
const catOf = name => data.categories.find(c => c.name === name);
function catChip(name) {
  if (!name) return `<span class="muted">—</span>`;
  const c = safeColor(catOf(name)?.color);
  return `<span class="cat-chip" style="color:${c};background:${c}1f">${esc(name)}</span>`;
}

// ຍໍ້ຮູບໃຫ້ກວ້າງບໍ່ເກີນ 1200px ແລະ ແປງເປັນ JPEG ກ່ອນອັບໂຫຼດ (ປະຢັດພື້ນທີ່)
async function resizeImage(file, max = 1200, quality = 0.85) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return new Promise(res => canvas.toBlob(res, "image/jpeg", quality));
}
async function uploadImage(file) {
  const blob = await resizeImage(file);
  const path = `${crypto.randomUUID()}.jpg`;
  const { error } = await sb.storage.from(BUCKET).upload(path, blob, { contentType: "image/jpeg" });
  if (error) throw error;
  return path;
}
async function removeImage(path) {
  if (path) await sb.storage.from(BUCKET).remove([path]);
}

function equipForm(eq = {}) {
  const statusOpts = EQUIP_STATUS.filter(s => s !== EQUIP_STATUS[1] || eq.status === EQUIP_STATUS[1]);
  const catOpts = [["", NO_CAT], ...data.categories.map(c => [c.name, c.name])];
  const url = imgUrl(eq.image_path);
  return `
    <div class="field">
      <label>ຮູບອຸປະກອນ</label>
      <label class="img-drop" id="imgDrop">
        <div class="pv ${url ? "has" : ""}" id="imgPv" style="${url ? `background-image:url('${url}')` : ""}">📷</div>
        <div class="txt"><b>ກົດເພື່ອເລືອກຮູບ ຫຼື ລາກຮູບມາວາງ</b>JPG / PNG / WEBP · ລະບົບຈະຍໍ້ຂະໜາດໃຫ້ອັດຕະໂນມັດ</div>
        <input type="file" name="image" id="imgInput" accept="image/*" hidden>
      </label>
      ${url ? `<label class="img-remove"><input type="checkbox" name="removeImage" id="imgRemove"> ລຶບຮູບນີ້ອອກ</label>` : ""}
    </div>
    <div class="row">
      ${field("ລະຫັດ", "code", eq.code, "text", "required")}
      ${field("ຈຳນວນ", "qty", eq.qty ?? 1, "number", 'min="0" required')}
    </div>
    ${field("ຊື່ອຸປະກອນ", "name", eq.name, "text", "required")}
    <div class="row">
      ${selectField("ໝວດໝູ່", "category", catOpts, eq.category || "")}
      ${field("ບ່ອນເກັບ", "location", eq.location)}
    </div>
    ${isAdmin() && !data.categories.length ? `<div class="hint" style="margin:-6px 0 12px">ຍັງບໍ່ມີໝວດໝູ່ — ເພີ່ມໄດ້ທີ່ເມນູ “ໝວດໝູ່”</div>` : ""}
    ${selectField("ສະຖານະ", "status", statusOpts, eq.status || EQUIP_STATUS[0])}
    <div class="field"><label>ໝາຍເຫດ</label><textarea name="note" rows="2">${esc(eq.note)}</textarea></div>`;
}

// ສະແດງຕົວຢ່າງຮູບທັນທີເມື່ອເລືອກ / ລາກວາງ
function wireImageField() {
  const input = $("#imgInput"), pv = $("#imgPv"), drop = $("#imgDrop");
  const show = file => {
    if (!file || !file.type.startsWith("image/")) return;
    pv.style.backgroundImage = `url('${URL.createObjectURL(file)}')`;
    pv.classList.add("has");
    if ($("#imgRemove")) $("#imgRemove").checked = false;
  };
  input.addEventListener("change", () => show(input.files[0]));
  drop.addEventListener("dragover", e => { e.preventDefault(); drop.classList.add("over"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("over"));
  drop.addEventListener("drop", e => {
    e.preventDefault(); drop.classList.remove("over");
    const f = e.dataTransfer.files[0];
    if (!f) return;
    const dt = new DataTransfer(); dt.items.add(f); input.files = dt.files;
    show(f);
  });
}

const equipRow = fd => ({
  code: fd.code.trim(), name: fd.name.trim(), category: nullIfEmpty(fd.category), qty: +fd.qty,
  location: fd.location.trim(), status: fd.status, note: fd.note.trim(),
});
const hasFile = f => f instanceof File && f.size > 0;

function nextCode() {
  const nums = data.equipment.map(e => parseInt((e.code || "").replace(/\D/g, ""), 10)).filter(n => !isNaN(n));
  return "EQ-" + String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, "0");
}

$("#addEquipBtn").addEventListener("click", () => {
  if (!isAdmin()) return deny();
  openModal("ເພີ່ມອຸປະກອນໃໝ່", equipForm({ code: nextCode() }), async fd => {
    const row = equipRow(fd);
    if (hasFile(fd.image)) {
      busy(true);
      try { row.image_path = await uploadImage(fd.image); }
      catch (err) { busy(false); return modalErr("ອັບໂຫຼດຮູບບໍ່ສຳເລັດ: " + errText(err)); }
    }
    const ok = await run(sb.from("equipment").insert(row), "ເພີ່ມສຳເລັດແລ້ວ", `ເພີ່ມອຸປະກອນ "${row.name}"`);
    if (!ok) { await removeImage(row.image_path); return false; }
  });
  wireImageField();
});

function editEquip(id) {
  if (!isAdmin()) return deny();
  const eq = data.equipment.find(e => e.id === id);
  openModal("ແກ້ໄຂອຸປະກອນ", equipForm(eq), async fd => {
    const row = equipRow(fd);
    if (row.status !== EQUIP_STATUS[1]) Object.assign(row, { borrower: null, return_due: null, borrowed_at: null });
    const oldPath = eq.image_path;
    if (hasFile(fd.image)) {
      busy(true);
      try { row.image_path = await uploadImage(fd.image); }
      catch (err) { busy(false); return modalErr("ອັບໂຫຼດຮູບບໍ່ສຳເລັດ: " + errText(err)); }
    } else if (fd.removeImage) {
      row.image_path = null;
    }
    const ok = await run(sb.from("equipment").update(row).eq("id", id), "ບັນທຶກສຳເລັດແລ້ວ", `ແກ້ໄຂອຸປະກອນ "${row.name}"`);
    if (!ok) { if (row.image_path && row.image_path !== oldPath) await removeImage(row.image_path); return false; }
    if ("image_path" in row && oldPath && row.image_path !== oldPath) await removeImage(oldPath);
  });
  wireImageField();
}

async function deleteEquip(id) {
  if (!isAdmin()) return deny();
  const eq = data.equipment.find(e => e.id === id);
  if (!confirm(`ລຶບ "${eq.name}" ແທ້ບໍ່?`)) return;
  const ok = await run(sb.from("equipment").delete().eq("id", id), "ລຶບສຳເລັດແລ້ວ", `ລຶບອຸປະກອນ "${eq.name}"`);
  if (ok) await removeImage(eq.image_path);
}

function borrowEquip(id) {
  const eq = data.equipment.find(e => e.id === id);
  if (eq.status !== EQUIP_STATUS[0]) return;
  // Admin ເລືອກຜູ້ຢືມໄດ້, ສະມາຊິກຢືມໃນນາມຕົນເອງເທົ່ານັ້ນ
  const who = isAdmin()
    ? selectField("ຜູ້ຢືມ", "borrower", memberOptions(false), me.id)
    : `<div class="field"><label>ຜູ້ຢືມ</label><input value="${esc(me.name)}" disabled></div>`;
  openModal(`ຢືມ: ${eq.name}`, who + field("ກຳນົດສົ່ງຄືນ", "returnDue", offsetDate(7), "date", `min="${today()}" required`), fd => {
    const borrower = isAdmin() ? fd.borrower : me.id;
    return run(sb.rpc("borrow_equipment", { p_id: id, p_borrower: borrower, p_due: fd.returnDue }),
      "ຢືມສຳເລັດແລ້ວ", `${memberName(borrower)} ຢືມ "${eq.name}"`);
  });
}

function returnEquip(id) {
  const eq = data.equipment.find(e => e.id === id);
  if (!canReturn(eq)) return deny();
  run(sb.rpc("return_equipment", { p_id: id }), "ສົ່ງຄືນສຳເລັດແລ້ວ", `${memberName(eq.borrower)} ສົ່ງຄືນ "${eq.name}"`);
}

/* ---------- Lightbox ເບິ່ງຮູບໃຫຍ່ ---------- */
function openImage(id) {
  const eq = data.equipment.find(e => e.id === id);
  if (!eq?.image_path) return;
  $("#lightboxImg").src = imgUrl(eq.image_path);
  $("#lightboxCap").textContent = `${eq.code} · ${eq.name}`;
  $("#lightbox").classList.add("show");
}
$("#lightbox").addEventListener("click", () => $("#lightbox").classList.remove("show"));
document.addEventListener("keydown", e => { if (e.key === "Escape") $("#lightbox").classList.remove("show"); });

/* ---------- ສະແດງຜົນ ---------- */
["#equipSearch", "#equipFilterStatus", "#equipFilterCat"].forEach(s => $(s).addEventListener("input", renderEquipment));

// ---- ແທັບ: ທັງໝົດ / ກຳລັງຖືກຢືມ ----
let equipTab = "all";
document.querySelectorAll("#equipTabs .seg-b").forEach(b => b.addEventListener("click", () => {
  equipTab = b.dataset.tab;
  renderEquipment();
}));
function showBorrowed() {
  equipTab = "borrowed";
  $("#equipSearch").value = "";
  $("#equipFilterCat").value = "";
  goPage("equipment");
  renderEquipment();
}
const daysBetween = (fromISO, toISO) => Math.round((new Date(toISO + "T00:00") - new Date(fromISO + "T00:00")) / 86400000);
function dueInfo(e) {
  if (!e.return_due) return { cls: "ok", txt: "ບໍ່ໄດ້ກຳນົດວັນຄືນ", d: 9999 };
  const d = daysBetween(today(), e.return_due);
  if (d < 0) return { cls: "late", txt: `ເກີນກຳນົດ ${-d} ມື້`, d };
  if (d === 0) return { cls: "warn", txt: "ຕ້ອງຄືນມື້ນີ້", d };
  if (d === 1) return { cls: "warn", txt: "ຄືນມື້ອື່ນ", d };
  if (d <= 2) return { cls: "warn", txt: `ອີກ ${d} ມື້`, d };
  return { cls: "ok", txt: `ອີກ ${d} ມື້`, d };
}

function renderBorrowed(list) {
  const items = list.filter(e => e.status === EQUIP_STATUS[1])
    .map(e => ({ e, due: dueInfo(e) }))
    .sort((a, b) => a.due.d - b.due.d);
  const people = [...new Set(items.map(x => x.e.borrower || ""))];
  const late = items.filter(x => x.due.cls === "late").length;
  const soon = items.filter(x => x.due.cls === "warn").length;

  const summary = `<div class="bsum">
    <div class="bs"><b>${items.length}</b><span>ລາຍການທີ່ຖືກຢືມ</span></div>
    <div class="bs"><b>${people.length}</b><span>ຄົນທີ່ຢືມຢູ່</span></div>
    <div class="bs ${late ? "u-late" : ""}"><b>${late}</b><span>ເກີນກຳນົດ</span></div>
    <div class="bs ${soon ? "u-warn" : ""}"><b>${soon}</b><span>ໃກ້ຮອດກຳນົດ (≤ 2 ມື້)</span></div>
  </div>`;
  if (!items.length) {
    $("#equipBorrowed").innerHTML = summary + `<div class="b-empty">🎉 ບໍ່ມີອຸປະກອນຖືກຢືມ — ທຸກຢ່າງຢູ່ໃນຫ້ອງ</div>`;
    return;
  }
  // ຈັດກຸ່ມຕາມຜູ້ຢືມ: ຂອງຂ້ອຍກ່ອນ, ຈາກນັ້ນກຸ່ມທີ່ດ່ວນທີ່ສຸດ
  const groups = people.map(pid => ({ pid, rows: items.filter(x => (x.e.borrower || "") === pid) }))
    .sort((a, b) => (b.pid === me.id) - (a.pid === me.id) || a.rows[0].due.d - b.rows[0].due.d);

  $("#equipBorrowed").innerHTML = summary + groups.map(g => {
    const m = data.members.find(x => x.id === g.pid);
    const gLate = g.rows.filter(x => x.due.cls === "late").length;
    return `<div class="bgroup">
      <div class="bg-head">
        <span class="mini-av" style="background:${avColor(g.pid)}">${esc(initial(memberName(g.pid)))}</span>
        <div><div class="nm">${esc(memberName(g.pid))}${g.pid === me.id ? " (ຂ້ອຍ)" : ""}</div><div class="sm">${esc(m?.role_title || "")}</div></div>
        <span class="bg-count">${g.rows.length} ລາຍການ</span>
        ${gLate ? `<span class="bg-late">⚠ ເກີນກຳນົດ ${gLate}</span>` : ""}
      </div>
      <div class="bgrid">${g.rows.map(({ e, due }) => {
        const url = imgUrl(e.image_path);
        const since = e.borrowed_at ? daysBetween(localISO(new Date(e.borrowed_at)), today()) : null;
        return `<div class="bcard u-${due.cls}">
          <div class="b-img">${url ? `<img src="${url}" alt="${esc(e.name)}" loading="lazy" onclick="openImage('${e.id}')">` : `<span class="ph">🧪</span>`}</div>
          <div class="b-body">
            <div class="b-top"><span class="code">${esc(e.code)}</span>${catChip(e.category)}</div>
            <div class="nm">${esc(e.name)}</div>
            <div class="b-meta">📦 ${esc(e.qty)} ຊິ້ນ${e.location ? ` · 📍 ${esc(e.location)}` : ""}</div>
            <div class="b-dates">
              <div><span>ຢືມວັນທີ</span><b>${e.borrowed_at ? fmtDate(localISO(new Date(e.borrowed_at))) : "—"}</b>${since != null ? `<i>${since === 0 ? "ມື້ນີ້" : `${since} ມື້ກ່ອນ`}</i>` : ""}</div>
              <div><span>ກຳນົດຄືນ</span><b>${e.return_due ? fmtDate(e.return_due) : "—"}</b></div>
            </div>
            <div class="b-foot">
              <span class="due-chip ${due.cls}">${due.cls === "late" ? "⚠ " : "⏰ "}${due.txt}</span>
              ${canReturn(e) ? `<button class="btn small ok" onclick="returnEquip('${e.id}')">↩ ສົ່ງຄືນ</button>` : ""}
            </div>
          </div>
        </div>`;
      }).join("")}</div>
    </div>`;
  }).join("");
}
document.querySelectorAll(".vt").forEach(b => b.addEventListener("click", () => {
  equipView = b.dataset.view;
  localStorage.setItem("labEquipView", equipView);
  renderEquipment();
}));

function equipActions(e, big = false) {
  const si = EQUIP_STATUS.indexOf(e.status);
  const cls = big ? "btn small grow" : "btn small";
  let action = "";
  if (si === 1 && canReturn(e)) action = `<button class="${cls} ok" onclick="returnEquip('${e.id}')">↩ ສົ່ງຄືນ</button>`;
  if (si === 0) action = `<button class="${cls} info" onclick="borrowEquip('${e.id}')">ຢືມ</button>`;
  const adminBtns = isAdmin() ? `
      <button class="btn small ghost icon-btn" title="ແກ້ໄຂ" onclick="editEquip('${e.id}')">✏️</button>
      <button class="btn small danger icon-btn" title="ລຶບ" onclick="deleteEquip('${e.id}')">🗑</button>` : "";
  return action + adminBtns;
}

function renderEquipment() {
  const catSel = $("#equipFilterCat");
  const cur = catSel.value;
  catSel.innerHTML = `<option value="">ທຸກໝວດ</option><option value="__none" ${cur === "__none" ? "selected" : ""}>${NO_CAT}</option>` +
    data.categories.map(c => `<option ${c.name === cur ? "selected" : ""}>${esc(c.name)}</option>`).join("");

  document.querySelectorAll(".vt").forEach(b => b.classList.toggle("active", b.dataset.view === equipView));
  const q = $("#equipSearch").value.trim().toLowerCase();
  const st = $("#equipFilterStatus").value;
  const cat = catSel.value;

  const rows = data.equipment.filter(e =>
    (!q || [e.code, e.name, e.location, e.note, e.category].join(" ").toLowerCase().includes(q)) &&
    (!st || e.status === st) &&
    (!cat || (cat === "__none" ? !e.category : e.category === cat)));

  const lateOf = e => e.status === EQUIP_STATUS[1] && e.return_due && e.return_due < today();

  // ---- ແທັບ ----
  const borrowedN = data.equipment.filter(e => e.status === EQUIP_STATUS[1]).length;
  $("#tabAllN").textContent = data.equipment.length;
  $("#tabBorN").textContent = borrowedN;
  $("#tabBorN").classList.toggle("hot", data.equipment.some(lateOf));
  document.querySelectorAll("#equipTabs .seg-b").forEach(b => b.classList.toggle("active", b.dataset.tab === equipTab));
  const isBor = equipTab === "borrowed";
  $("#equipFilterStatus").style.display = isBor ? "none" : "";
  document.querySelector(".view-toggle").style.display = isBor ? "none" : "";
  $("#equipBorrowed").style.display = isBor ? "block" : "none";
  if (isBor) {
    $("#equipGrid").style.display = "none";
    $("#equipTableCard").style.display = "none";
    const base = data.equipment.filter(e =>
      (!q || [e.code, e.name, e.location, e.note, e.category, memberName(e.borrower)].join(" ").toLowerCase().includes(q)) &&
      (!cat || (cat === "__none" ? !e.category : e.category === cat)));
    renderBorrowed(base);
    return;
  }

  // ---- ມຸມມອງບັດ ----
  $("#equipGrid").style.display = equipView === "cards" && rows.length ? "grid" : "none";
  $("#equipTableCard").style.display = equipView === "table" || !rows.length ? "block" : "none";
  $("#equipTableCard .table-wrap").style.display = equipView === "table" && rows.length ? "block" : "none";

  $("#equipGrid").innerHTML = equipView !== "cards" ? "" : rows.map(e => {
    const si = EQUIP_STATUS.indexOf(e.status);
    const late = lateOf(e);
    const url = imgUrl(e.image_path);
    return `<div class="eq-card">
      <div class="eq-img">
        ${url ? `<img src="${url}" alt="${esc(e.name)}" loading="lazy" onclick="openImage('${e.id}')">` : `<span class="ph">🧪</span>`}
        <span class="code">${esc(e.code)}</span>
        <span class="badge st-${si}">${esc(e.status)}</span>
      </div>
      <div class="eq-body">
        <div class="nm">${esc(e.name)}</div>
        <div>${catChip(e.category)}</div>
        <div class="info"><span>📦 ${esc(e.qty)} ຊິ້ນ</span>${e.location ? `<span>📍 ${esc(e.location)}</span>` : ""}</div>
        ${e.note ? `<div class="muted">${esc(e.note)}</div>` : ""}
        ${e.borrower ? `<div class="bw ${late ? "late" : ""}">👤 ${esc(memberName(e.borrower))}${e.return_due ? ` · ຄືນ ${fmtDate(e.return_due)}${late ? " (ເກີນກຳນົດ)" : ""}` : ""}</div>` : ""}
        <div class="eq-actions">${equipActions(e, true)}</div>
      </div>
    </div>`;
  }).join("");

  // ---- ມຸມມອງຕາຕະລາງ ----
  $("#equipTable").innerHTML = equipView !== "table" ? "" : rows.map(e => {
    const si = EQUIP_STATUS.indexOf(e.status);
    const late = lateOf(e);
    const url = imgUrl(e.image_path);
    const borrower = e.borrower
      ? `<div><b>${esc(memberName(e.borrower))}</b>${e.return_due ? `<div class="muted ${late ? "late" : ""}">ຄືນ ${fmtDate(e.return_due)}${late ? " · ເກີນກຳນົດ" : ""}</div>` : ""}</div>`
      : `<span class="muted">—</span>`;
    return `<tr>
      <td>${url ? `<img class="thumb" src="${url}" alt="" loading="lazy" onclick="openImage('${e.id}')">` : `<span class="thumb ph">🧪</span>`}</td>
      <td><span class="code">${esc(e.code)}</span></td>
      <td><b>${esc(e.name)}</b>${e.note ? `<div class="muted">${esc(e.note)}</div>` : ""}</td>
      <td>${catChip(e.category)}</td>
      <td>${esc(e.qty)}</td>
      <td>${esc(e.location) || `<span class="muted">—</span>`}</td>
      <td><span class="badge st-${si}">${esc(e.status)}</span></td>
      <td>${borrower}</td>
      <td class="actions">${equipActions(e)}</td>
    </tr>`;
  }).join("");

  const empty = $("#equipEmpty");
  empty.style.display = rows.length ? "none" : "block";
  empty.textContent = data.equipment.length ? "ບໍ່ພົບອຸປະກອນທີ່ຄົ້ນຫາ"
    : isAdmin() ? "ຍັງບໍ່ມີອຸປະກອນ — ກົດ “＋ ເພີ່ມອຸປະກອນ” ເພື່ອເລີ່ມ" : "ຍັງບໍ່ມີອຸປະກອນ";
}

/* =========================================================
   ໝວດໝູ່
   ========================================================= */
const CAT_COLORS = ["#6366f1", "#8b5cf6", "#ec4899", "#ef4444", "#f59e0b", "#10b981", "#14b8a6", "#0ea5e9", "#64748b"];

function catForm(c = {}) {
  const color = safeColor(c.color, CAT_COLORS[data.categories.length % CAT_COLORS.length]);
  return `
    ${field("ຊື່ໝວດໝູ່", "name", c.name, "text", 'required maxlength="60"')}
    <div class="field">
      <label>ສີ</label>
      <div class="swatches" id="swatches">
        ${CAT_COLORS.map(x => `<button type="button" class="sw ${x === color ? "on" : ""}" style="background:${x}" data-c="${x}"></button>`).join("")}
        <input type="color" name="color" id="catColor" value="${esc(color)}" title="ເລືອກສີເອງ">
      </div>
    </div>
    <div class="field"><label>ຄຳອະທິບາຍ</label><textarea name="description" rows="2" placeholder="ເຊັ່ນ ເຄື່ອງແກ້ວ, ສານເຄມີ...">${esc(c.description)}</textarea></div>`;
}
function wireSwatches() {
  const input = $("#catColor");
  document.querySelectorAll("#swatches .sw").forEach(b => b.addEventListener("click", () => {
    input.value = b.dataset.c;
    document.querySelectorAll("#swatches .sw").forEach(x => x.classList.toggle("on", x === b));
  }));
  input.addEventListener("input", () => document.querySelectorAll("#swatches .sw").forEach(x => x.classList.remove("on")));
}
const catRow = fd => ({ name: fd.name.trim(), color: fd.color, description: fd.description.trim() });
const dupCat = (name, exceptId) => data.categories.some(c => c.id !== exceptId && c.name.toLowerCase() === name.toLowerCase());

$("#addCatBtn").addEventListener("click", () => {
  if (!isAdmin()) return deny();
  openModal("ເພີ່ມໝວດໝູ່", catForm(), fd => {
    const row = catRow(fd);
    if (dupCat(row.name)) return modalErr("ມີໝວດໝູ່ຊື່ນີ້ແລ້ວ");
    return run(sb.from("categories").insert(row), "ເພີ່ມສຳເລັດແລ້ວ", `ເພີ່ມໝວດໝູ່ "${row.name}"`);
  });
  wireSwatches();
});

function editCat(id) {
  if (!isAdmin()) return deny();
  const c = data.categories.find(x => x.id === id);
  openModal("ແກ້ໄຂໝວດໝູ່", catForm(c), fd => {
    const row = catRow(fd);
    if (dupCat(row.name, id)) return modalErr("ມີໝວດໝູ່ຊື່ນີ້ແລ້ວ");
    // ປ່ຽນຊື່ແລ້ວ ອຸປະກອນໃນໝວດນີ້ຈະປ່ຽນຕາມອັດຕະໂນມັດ (ON UPDATE CASCADE)
    return run(sb.from("categories").update(row).eq("id", id), "ບັນທຶກສຳເລັດແລ້ວ",
      c.name !== row.name ? `ປ່ຽນຊື່ໝວດໝູ່ "${c.name}" → "${row.name}"` : `ແກ້ໄຂໝວດໝູ່ "${row.name}"`);
  });
  wireSwatches();
}

function deleteCat(id) {
  if (!isAdmin()) return deny();
  const c = data.categories.find(x => x.id === id);
  const n = data.equipment.filter(e => e.category === c.name).length;
  const msg = n ? `ລຶບໝວດໝູ່ "${c.name}"?\nອຸປະກອນ ${n} ຊິ້ນໃນໝວດນີ້ຈະກາຍເປັນ "ບໍ່ມີໝວດ" (ອຸປະກອນບໍ່ຖືກລຶບ)` : `ລຶບໝວດໝູ່ "${c.name}" ແທ້ບໍ່?`;
  if (!confirm(msg)) return;
  run(sb.from("categories").delete().eq("id", id), "ລຶບສຳເລັດແລ້ວ", `ລຶບໝວດໝູ່ "${c.name}"`);
}

function viewCategory(name) {
  $("#equipSearch").value = "";
  $("#equipFilterStatus").value = "";
  renderEquipment();
  $("#equipFilterCat").value = name || "__none";
  renderEquipment();
  goPage("equipment");
}

function renderCategories() {
  const stat = list => EQUIP_STATUS.map((s, i) => [i, list.filter(e => e.status === s).length]);
  const BAR = ["#10b981", "#2563eb", "#e11d48", "#d97706"];
  const card = (c, list) => {
    const color = safeColor(c?.color, "#94a3b8");
    const name = c?.name || "";
    const bars = list.length ? stat(list).filter(([, n]) => n).map(([i, n]) =>
      `<span style="width:${(n / list.length) * 100}%;background:${BAR[i]}" title="${EQUIP_STATUS[i]}: ${n}"></span>`).join("") : "";
    return `<div class="cat-card" style="--c:${color}">
      <div class="top">
        <div class="ic">${esc(initial(name || "?"))}</div>
        <div><div class="nm">${c ? esc(name) : NO_CAT}</div><div class="cnt">${list.length} ລາຍການ · ${list.reduce((s, e) => s + (+e.qty || 0), 0)} ຊິ້ນ</div></div>
      </div>
      <div class="desc">${c ? esc(c.description || "") : "ອຸປະກອນທີ່ຍັງບໍ່ໄດ້ຈັດໝວດ"}</div>
      <div class="bar">${bars}</div>
      <div class="acts">
        <button class="btn small primary" data-cat="${esc(name)}" onclick="viewCategory(this.dataset.cat)">ເບິ່ງອຸປະກອນ</button>
        ${c && isAdmin() ? `
          <button class="btn small ghost icon-btn" title="ແກ້ໄຂ" onclick="editCat('${c.id}')">✏️</button>
          <button class="btn small danger icon-btn" title="ລຶບ" onclick="deleteCat('${c.id}')">🗑</button>` : ""}
      </div>
    </div>`;
  };
  const uncategorized = data.equipment.filter(e => !e.category);
  const html = data.categories.map(c => card(c, data.equipment.filter(e => e.category === c.name))).join("")
    + (uncategorized.length ? card(null, uncategorized) : "");
  $("#catGrid").innerHTML = html || `<div class="cat-empty">ຍັງບໍ່ມີໝວດໝູ່${isAdmin() ? " — ກົດ “＋ ເພີ່ມໝວດໝູ່” ເພື່ອເລີ່ມ" : ""}</div>`;
}

/* =========================================================
   2) ໜ້າວຽກ
   - Admin: ເຫັນທຸກຄົນ, ສ້າງ / ມອບໝາຍ / ແກ້ໄຂ / ລຶບ
   - ສະມາຊິກ: ເຫັນສະເພາະວຽກຂອງຕົນເອງ, ອັບເດດ ສະຖານະ / % / ບັນທຶກ
   ========================================================= */
let currentPerson = "all";

$("#board").innerHTML = TASK_STATUS.map((s, i) => `
  <div class="column" data-status="${s}">
    <div class="col-head">
      <h3><span class="dot" style="background:${TASK_COLOR[i]}"></span>${s}</h3>
      <span class="count">0</span>
    </div>
    <div class="cards"></div>
  </div>`).join("");

const canUpdateProgress = t => isAdmin() || t.assignee === me.id;
const progressOf = t => (t.status === TASK_STATUS[2] ? 100 : t.progress || 0);
function pline(t) {
  const p = progressOf(t);
  return `<div class="pline"><div class="pbar ${p === 100 ? "done" : ""}"><span style="width:${p}%"></span></div><b>${p}%</b></div>`;
}
function timeAgo(iso) {
  if (!iso) return "";
  const m = Math.round((Date.now() - new Date(iso)) / 60000);
  if (m < 1) return "ຫາກໍ່ນີ້";
  if (m < 60) return `${m} ນາທີກ່ອນ`;
  if (m < 60 * 24) return `${Math.round(m / 60)} ຊົ່ວໂມງກ່ອນ`;
  return fmtTime(iso);
}

// ---- ຟອມຂອງ Admin (ສ້າງ / ແກ້ໄຂວຽກ) ----
function taskForm(t = {}) {
  const defAssignee = t.assignee ?? (currentPerson !== "all" ? currentPerson : "");
  return `
    ${field("ຊື່ວຽກ", "title", t.title, "text", "required")}
    <div class="field"><label>ລາຍລະອຽດ</label><textarea name="detail" rows="3">${esc(t.detail)}</textarea></div>
    <div class="row">
      ${selectField("ມອບໃຫ້", "assignee", memberOptions(), defAssignee)}
      ${field("ກຳນົດສົ່ງ", "due", t.due, "date")}
    </div>
    <div class="row">
      ${selectField("ຄວາມສຳຄັນ", "priority", PRIORITY, t.priority || PRIORITY[1])}
      ${selectField("ສະຖານະ", "status", TASK_STATUS, t.status || TASK_STATUS[0])}
    </div>
    ${t.id ? progressFields(t) : ""}`;
}
const taskRow = fd => ({
  title: fd.title.trim(), detail: fd.detail.trim(), assignee: nullIfEmpty(fd.assignee),
  due: nullIfEmpty(fd.due), priority: fd.priority, status: fd.status,
});

// ---- ຊ່ອງ % ຄວາມຄືບໜ້າ + ບັນທຶກ ----
function progressFields(t) {
  const p = progressOf(t);
  return `
    <div class="field">
      <label>ຄວາມຄືບໜ້າ</label>
      <div class="range-row"><input type="range" name="progress" id="pgRange" min="0" max="100" step="5" value="${p}"><output id="pgOut">${p}%</output></div>
      <div class="quick-pct">${[0, 25, 50, 75, 100].map(v => `<button type="button" data-v="${v}">${v}%</button>`).join("")}</div>
    </div>
    <div class="field"><label>ບັນທຶກລ່າສຸດ</label><textarea name="progress_note" rows="3" placeholder="ເຊັ່ນ ເຮັດຂັ້ນຕອນທີ 2 ແລ້ວ, ລໍຖ້າສານເຄມີ...">${esc(t.progress_note)}</textarea></div>`;
}
function wireProgress(base = null) {
  const r = $("#pgRange"), o = $("#pgOut"), st = $("#modalForm [name=status]"), dl = $("#pgDelta");
  if (!r) return;
  const showDelta = () => {
    if (!dl || base == null) return;
    const d = +r.value - base;
    dl.textContent = d ? `${d > 0 ? "+" : ""}${d}% ຮອບນີ້` : "";
    dl.classList.toggle("neg", d < 0);
  };
  const sync = () => {
    o.textContent = r.value + "%";
    showDelta();
    if (!st) return;
    if (+r.value === 100) st.value = TASK_STATUS[2];
    else if (+r.value > 0 && st.value !== TASK_STATUS[1]) st.value = TASK_STATUS[1];
    else if (+r.value === 0 && st.value === TASK_STATUS[2]) st.value = TASK_STATUS[0];
  };
  r.addEventListener("input", sync);
  document.querySelectorAll(".quick-pct button").forEach(b => b.addEventListener("click", () => {
    r.value = b.dataset.add ? Math.min(100, +r.value + +b.dataset.add) : b.dataset.v; sync();
  }));
  st?.addEventListener("change", () => {
    if (st.value === TASK_STATUS[2]) r.value = 100;
    else if (+r.value === 100) r.value = st.value === TASK_STATUS[0] ? 0 : 90;
    o.textContent = r.value + "%";
    showDelta();
  });
}

$("#addTaskBtn").addEventListener("click", () => {
  if (!isAdmin()) return deny();
  openModal("ມອບໝາຍວຽກໃໝ່", taskForm(), fd => {
    const row = { ...taskRow(fd), created_by: me.id, progress: fd.status === TASK_STATUS[2] ? 100 : 0 };
    return run(sb.from("tasks").insert(row), "ມອບໝາຍວຽກສຳເລັດແລ້ວ", `ມອບວຽກ "${row.title}" ໃຫ້ ${memberName(row.assignee)}`);
  });
});

function editTask(id) {
  if (!isAdmin()) return deny();
  const t = data.tasks.find(x => x.id === id);
  openModal("ແກ້ໄຂວຽກ", taskForm(t), fd => {
    const row = { ...taskRow(fd), progress: fd.status === TASK_STATUS[2] ? 100 : +fd.progress, progress_note: fd.progress_note.trim() };
    return run(sb.from("tasks").update(row).eq("id", id), "ບັນທຶກສຳເລັດແລ້ວ", `ແກ້ໄຂວຽກ "${row.title}"`);
  });
  wireProgress();
}

// ---- ສະມາຊິກ (ແລະ admin) ອັບເດດຄວາມຄືບໜ້າ ----
function updateProgress(id) {
  const t = data.tasks.find(x => x.id === id);
  if (!canUpdateProgress(t)) return deny();
  const cur = progressOf(t);
  openModal("ບັນທຶກຄວາມຄືບໜ້າຮອບນີ້", `
    <div class="task-info"><div class="t">${esc(t.title)}</div>${t.detail ? `<div class="d">${esc(t.detail)}</div>` : ""}
      ${t.due ? `<div class="d">📅 ກຳນົດສົ່ງ ${fmtDate(t.due)}</div>` : ""}
      <div class="d" style="margin-top:6px">ຕອນນີ້: <b>${cur}%</b> · ${esc(t.status)}</div></div>
    ${selectField("ສະຖານະ", "status", TASK_STATUS, t.status)}
    <div class="field">
      <label>ຄວາມຄືບໜ້າ <span class="delta" id="pgDelta"></span></label>
      <div class="range-row"><input type="range" name="progress" id="pgRange" min="0" max="100" step="5" value="${cur}"><output id="pgOut">${cur}%</output></div>
      <div class="quick-pct">${[10, 25, 50, 75, 100].map(v => `<button type="button" data-v="${v}">${v}%</button>`).join("")}
        <button type="button" data-add="10">+10%</button></div>
    </div>
    <div class="field"><label>ສິ່ງທີ່ເຮັດໃນຮອບນີ້</label>
      <textarea name="round_note" rows="4" maxlength="2000" placeholder="ເຊັ່ນ&#10;- ເກັບຕົວຢ່າງດິນເພີ່ມ 5 ຕົວຢ່າງ&#10;- ລ້າງເຄື່ອງແກ້ວ&#10;- ບັນຫາ: ລໍຖ້າສານເຄມີ"></textarea></div>
    <div class="recent" id="recentLog"><div class="muted">ກຳລັງໂຫຼດປະຫວັດ...</div></div>`, fd => {
    const pct = fd.status === TASK_STATUS[2] ? 100 : +fd.progress;
    const note = fd.round_note.trim();
    return run(sb.rpc("update_task_progress", { p_id: id, p_status: fd.status, p_progress: pct, p_note: note }),
      pct === 100 ? "ວຽກນີ້ສຳເລັດແລ້ວ!" : "ບັນທຶກສຳເລັດແລ້ວ",
      `"${t.title}" ${cur}% → ${pct}%${note ? ` · ${note.split("\n")[0]}` : ""}`);
  });
  wireProgress(cur);
  loadLog(id).then(rows => {
    const el = $("#recentLog");
    if (!el) return;
    if (rows.error) { el.innerHTML = `<div class="muted">${esc(rows.error)}</div>`; return; }
    const recent = rows.filter(r => r.kind === "update").slice(0, 3);
    el.innerHTML = recent.length
      ? `<div class="recent-h">ຮອບກ່ອນໆ <a href="#" onclick="event.preventDefault(); openTaskLog('${t.id}')">ເບິ່ງທັງໝົດ (${rows.length}) →</a></div>` + recent.map(logItem).join("")
      : `<div class="muted">ຍັງບໍ່ມີການບັນທຶກ — ນີ້ແມ່ນຮອບທຳອິດ</div>`;
  });
}

// ---- ປະຫວັດຄວາມຄືບໜ້າ (timeline) ----
async function loadLog(taskId) {
  const { data: rows, error } = await sb.from("task_updates").select("*").eq("task_id", taskId)
    .order("created_at", { ascending: false }).limit(200);
  return error ? { error: errText(error), filter: () => [] } : rows;
}
function dayLabel(iso) {
  const d = localISO(new Date(iso));
  if (d === today()) return "ມື້ນີ້";
  if (d === offsetDate(-1)) return "ມື້ວານ";
  return fmtLong(new Date(iso));
}
function logItem(r) {
  const si = TASK_STATUS.indexOf(r.status);
  const d = new Date(r.created_at);
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (r.kind === "create") {
    return `<div class="tl-item k-create"><span class="tl-dot"></span><div class="tl-body">
      <div class="tl-head"><b>${esc(memberName(r.author))}</b> ມອບໝາຍວຽກ <span class="muted">· ${time}</span></div></div></div>`;
  }
  const delta = r.prev_progress == null ? null : r.progress - r.prev_progress;
  const dTxt = delta == null || delta === 0 ? "" : `<span class="delta ${delta < 0 ? "neg" : ""}">${delta > 0 ? "+" : ""}${delta}%</span>`;
  return `<div class="tl-item"><span class="tl-dot" style="background:${TASK_COLOR[si] || "#94a3b8"}"></span><div class="tl-body">
    <div class="tl-head"><b>${esc(memberName(r.author))}</b> <span class="muted">· ${time}</span></div>
    <div class="tl-chg"><span class="pill s${si}">${esc(r.status)}</span>
      <span>${r.prev_progress ?? 0}% → <b>${r.progress}%</b></span> ${dTxt}</div>
    <div class="pline mini"><div class="pbar ${r.progress === 100 ? "done" : ""}"><span style="width:${r.progress}%"></span></div></div>
    ${r.note ? `<div class="tl-note">${esc(r.note)}</div>` : ""}
  </div></div>`;
}
async function openTaskLog(id) {
  const t = data.tasks.find(x => x.id === id);
  if (!t) return;
  openModal("📜 ປະຫວັດຄວາມຄືບໜ້າ", `
    <div class="task-info"><div class="t">${esc(t.title)}</div>
      <div class="d">👤 ${esc(memberName(t.assignee))}${t.due ? ` · 📅 ${fmtDate(t.due)}` : ""} · ${esc(t.status)}</div>
      ${pline(t)}</div>
    <div class="tl" id="tlBody"><div class="muted">ກຳລັງໂຫຼດ...</div></div>`, null, { viewOnly: true, wide: true });
  const rows = await loadLog(id);
  const el = $("#tlBody");
  if (!el) return;
  if (rows.error) { el.innerHTML = `<div class="muted">${esc(rows.error)}</div>`; return; }
  const rounds = rows.filter(r => r.kind === "update").length;
  let html = `<div class="tl-sum">ທັງໝົດ <b>${rounds}</b> ຮອບ${rows.length ? ` · ເລີ່ມ ${fmtDate(localISO(new Date(rows[rows.length - 1].created_at)))}` : ""}</div>`;
  let last = "";
  for (const r of rows) {
    const day = dayLabel(r.created_at);
    if (day !== last) { html += `<div class="tl-day">${day}</div>`; last = day; }
    html += logItem(r);
  }
  el.innerHTML = rows.length ? html : `<div class="muted">ຍັງບໍ່ມີປະຫວັດ</div>`;
}

function deleteTask(id) {
  if (!isAdmin()) return deny();
  const t = data.tasks.find(x => x.id === id);
  if (!confirm(`ລຶບວຽກ "${t.title}" ແທ້ບໍ່?`)) return;
  run(sb.from("tasks").delete().eq("id", id), "ລຶບສຳເລັດແລ້ວ", `ລຶບວຽກ "${t.title}"`);
}

// ລາກບັດ / ກົດ ◀ ▶ → ປ່ຽນສະຖານະຜ່ານ update_task_progress (ໃຊ້ໄດ້ທັງ admin ແລະ ເຈົ້າຂອງວຽກ)
function moveTask(id, status) {
  const t = data.tasks.find(x => x.id === id);
  if (!t || t.status === status) return;
  if (!canUpdateProgress(t)) return deny();
  let pct = t.progress || 0;
  if (status === TASK_STATUS[2]) pct = 100;
  else if (t.status === TASK_STATUS[2]) pct = status === TASK_STATUS[0] ? 0 : 90;
  t.status = status; t.progress = pct;    // ອັບເດດໜ້າຈໍທັນທີ
  renderTasks();
  run(sb.rpc("update_task_progress", { p_id: id, p_status: status, p_progress: pct, p_note: null }),
    status === TASK_STATUS[2] ? "ວຽກນີ້ສຳເລັດແລ້ວ!" : `ຍ້າຍໄປ “${status}” ສຳເລັດແລ້ວ`, `ວຽກ "${t.title}" → ${status}`);
}

function renderPersonBar() {
  if (!isAdmin()) { $("#personBar").innerHTML = ""; return; }
  const people = [["all", "ທຸກຄົນ"], ...data.members.map(m => [m.id, m.id === me.id ? m.name + " (ຂ້ອຍ)" : m.name]), ["", "ບໍ່ລະບຸ"]];
  $("#personBar").innerHTML = people.map(([id, name]) => {
    if (id === "" && !data.tasks.some(t => !t.assignee)) return "";
    const n = data.tasks.filter(t => (id === "all" || (t.assignee || "") === id) && t.status !== TASK_STATUS[2]).length;
    const av = id === "all" ? "👥" : initial(name);
    const bg = id === "all" ? "#475569" : avColor(id);
    return `<button class="chip ${currentPerson === id ? "active" : ""}" onclick="selectPerson('${id}')">
      <span class="mini-av" style="background:${bg}">${esc(av)}</span>${esc(name)}<span class="n">${n}</span>
    </button>`;
  }).join("");
}
function selectPerson(id) { currentPerson = id; renderTasks(); }

function renderTasks() {
  $("#tasksSub").textContent = isAdmin()
    ? "ເລືອກຊື່ເພື່ອເບິ່ງວຽກຂອງແຕ່ລະຄົນ · ລາກບັດເພື່ອປ່ຽນສະຖານະ"
    : "ວຽກທີ່ໄດ້ຮັບມອບໝາຍ · ກົດ “ອັບເດດຄວາມຄືບໜ້າ” ຫຼື ລາກບັດເພື່ອປ່ຽນສະຖານະ";
  if (!isAdmin()) currentPerson = me.id;
  if (currentPerson !== "all" && currentPerson !== "" && !data.members.some(m => m.id === currentPerson)) currentPerson = "all";
  renderPersonBar();
  const list = data.tasks
    .filter(t => currentPerson === "all" || (t.assignee || "") === currentPerson)
    .sort((a, b) => (PRIORITY.indexOf(a.priority) - PRIORITY.indexOf(b.priority)) || (a.due || "9").localeCompare(b.due || "9"));

  document.querySelectorAll(".column").forEach(col => {
    const status = col.dataset.status;
    const items = list.filter(t => t.status === status);
    col.querySelector(".count").textContent = items.length;
    col.querySelector(".cards").innerHTML = items.map(t => {
      const pi = PRIORITY.indexOf(t.priority);
      const idx = TASK_STATUS.indexOf(t.status);
      const late = t.due && t.due < today() && idx !== 2;
      const can = canUpdateProgress(t);
      const arrows = can ? `
        ${idx > 0 ? `<button class="btn small ghost icon-btn" title="ຖອຍຫຼັງ" onclick="moveTask('${t.id}','${TASK_STATUS[idx - 1]}')">◀</button>` : ""}
        ${idx < 2 ? `<button class="btn small ghost icon-btn" title="ຕໍ່ໄປ" onclick="moveTask('${t.id}','${TASK_STATUS[idx + 1]}')">▶</button>` : ""}` : "";
      const adminBtns = isAdmin() ? `
        <button class="btn small ghost icon-btn" title="ແກ້ໄຂ" onclick="editTask('${t.id}')">✏️</button>
        <button class="btn small danger icon-btn" title="ລຶບ" onclick="deleteTask('${t.id}')">🗑</button>` : "";
      const updater = t.updated_by && t.updated_at && t.updated_at !== t.created_at
        ? `<div class="upd">🔄 ${esc(memberName(t.updated_by))} · ${timeAgo(t.updated_at)}</div>` : "";
      return `<div class="task p${pi} ${can ? "" : "locked"}" draggable="${can}" data-id="${t.id}">
        <div class="title">${esc(t.title)}</div>
        ${t.detail ? `<div class="detail">${esc(t.detail)}</div>` : ""}
        <div class="meta">
          <span class="badge pr-${pi}">${esc(t.priority)}</span>
          ${t.due ? `<span class="${late ? "late" : ""}">📅 ${fmtDate(t.due)}${late ? " · ເກີນກຳນົດ" : ""}</span>` : ""}
        </div>
        ${pline(t)}
        ${t.progress_note ? `<div class="note">💬 ${esc(t.progress_note)}</div>` : ""}
        ${updater}
        <div class="foot">
          <span class="who"><span class="mini-av" style="background:${avColor(t.assignee)}">${esc(initial(memberName(t.assignee)))}</span>${esc(memberName(t.assignee))}</span>
          <span class="task-actions">${arrows}${adminBtns}</span>
        </div>
        <div class="card-btns">
          ${can && idx !== 2 ? `<button class="btn small info" onclick="updateProgress('${t.id}')">📝 ບັນທຶກຄວາມຄືບໜ້າ</button>` : ""}
          <button class="btn small ghost" onclick="openTaskLog('${t.id}')">📜 ປະຫວັດ</button>
        </div>
      </div>`;
    }).join("") || `<div class="col-empty">ບໍ່ມີວຽກ</div>`;
  });
}

// ລາກວາງບັດວຽກ
document.addEventListener("dragstart", e => {
  const card = e.target.closest?.(".task");
  if (!card) return;
  e.dataTransfer.setData("text/plain", card.dataset.id);
  card.classList.add("dragging");
});
document.addEventListener("dragend", e => e.target.closest?.(".task")?.classList.remove("dragging"));
document.querySelectorAll(".column").forEach(col => {
  col.addEventListener("dragover", e => { e.preventDefault(); col.classList.add("drag-over"); });
  col.addEventListener("dragleave", e => { if (!col.contains(e.relatedTarget)) col.classList.remove("drag-over"); });
  col.addEventListener("drop", e => {
    e.preventDefault();
    col.classList.remove("drag-over");
    moveTask(e.dataTransfer.getData("text/plain"), col.dataset.status);
  });
});


/* =========================================================
   ສະມາຊິກ + ບັນຊີຜູ້ໃຊ້ (Admin ສ້າງ/ແກ້ໄຂ ຜ່ານ Edge Function)
   ========================================================= */
function memberForm(m = {}) {
  const isNew = !m.id;
  return `
    ${field("ຊື່", "name", m.name, "text", "required")}
    ${field("ຕຳແໜ່ງ / ບົດບາດ", "role_title", m.role_title, "text", 'placeholder="ເຊັ່ນ ນັກສຶກສາ ປະລິນຍາໂທ"')}
    <div class="row">
      ${field("ຊື່ຜູ້ໃຊ້ (Username)", "username", m.username, "text", 'required pattern="[A-Za-z0-9_.]{3,}" autocomplete="off"', "a-z, 0-9, _ . ຢ່າງໜ້ອຍ 3 ຕົວ")}
      ${selectField("ສິດໃນລະບົບ", "sys_role", Object.entries(ROLES), m.sys_role || "member", m.id && m.id === me.id ? "disabled" : "")}
    </div>
    ${field(isNew ? "ລະຫັດຜ່ານ" : "ຕັ້ງລະຫັດຜ່ານໃໝ່", "password", "", "password",
      `${isNew ? "required" : ""} minlength="${MIN_PW}" autocomplete="new-password"`,
      isNew ? `ຢ່າງໜ້ອຍ ${MIN_PW} ຕົວ · ຜູ້ໃຊ້ຈະຖືກແນະນຳໃຫ້ປ່ຽນເມື່ອເຂົ້າລະບົບ` : "ປ່ອຍວ່າງໄວ້ ຖ້າບໍ່ຕ້ອງການປ່ຽນ")}`;
}

$("#addMemberBtn").addEventListener("click", () => {
  if (!isAdmin()) return deny();
  openModal("ສ້າງບັນຊີສະມາຊິກໃໝ່", memberForm(), async fd => {
    const res = await adminUsers({ action: "create", ...fd });
    if (!res) return false;
    await log(`ສ້າງບັນຊີ "${fd.name}" (${fd.username.toLowerCase()})`);
    await refresh();
    success("ສ້າງບັນຊີສຳເລັດແລ້ວ", `${fd.name} (@${fd.username.toLowerCase()})`, "add");
  });
});

function editMember(id) {
  if (!isAdmin()) return deny();
  const m = data.members.find(x => x.id === id);
  openModal("ແກ້ໄຂສະມາຊິກ", memberForm(m), async fd => {
    const res = await adminUsers({ action: "update", id, sys_role: m.sys_role, ...fd });
    if (!res) return false;
    await log(`ແກ້ໄຂບັນຊີ "${fd.name}"${fd.password ? " (ຣີເຊັດລະຫັດຜ່ານ)" : ""}`);
    await refresh();
    success("ບັນທຶກສຳເລັດແລ້ວ", `ແກ້ໄຂບັນຊີ "${fd.name}"`, "save");
  });
}

async function deleteMember(id) {
  if (!isAdmin()) return deny();
  const m = data.members.find(x => x.id === id);
  if (m.id === me.id) { alert("ບໍ່ສາມາດລຶບບັນຊີຂອງຕົນເອງໄດ້"); return; }
  if (!confirm(`ລຶບສະມາຊິກ "${m.name}"? ບັນຊີນີ້ຈະເຂົ້າລະບົບບໍ່ໄດ້ອີກ ແລະ ວຽກຂອງຄົນນີ້ຈະປ່ຽນເປັນ "ບໍ່ລະບຸ"`)) return;
  const res = await adminUsers({ action: "delete", id });
  if (!res) { toast("❌ " + $("#modalError").textContent); return; }
  await log(`ລຶບສະມາຊິກ "${m.name}"`);
  await refresh();
  success("ລຶບສຳເລັດແລ້ວ", `ລຶບສະມາຊິກ "${m.name}"`, "delete");
}

function viewMemberTasks(id) {
  currentPerson = id;
  renderTasks();
  goPage("tasks");
}

function renderMembers() {
  $("#membersSub").textContent = isAdmin()
    ? "ສ້າງບັນຊີ, ກຳນົດສິດ ແລະ ຣີເຊັດລະຫັດຜ່ານໃຫ້ສະມາຊິກ"
    : "ລາຍຊື່ຄົນໃນທີມ ແລະ ວຽກຂອງແຕ່ລະຄົນ";
  $("#memberGrid").innerHTML = data.members.map(m => {
    const mine = data.tasks.filter(t => t.assignee === m.id);
    const open = mine.filter(t => t.status !== TASK_STATUS[2]).length;
    const borrowed = data.equipment.filter(e => e.borrower === m.id).length;
    return `<div class="member ${m.id === me.id ? "me" : ""}">
      <div class="avatar" style="background:${avColor(m.id)}">${esc(initial(m.name))}</div>
      <div class="name">${esc(m.name)}${m.id === me.id ? " (ຂ້ອຍ)" : ""}</div>
      <div class="role">${esc(m.role_title || "—")}</div>
      <span class="role-badge role-${m.sys_role}">${m.sys_role === "admin" ? "Admin" : "ສະມາຊິກ"}</span>
      ${isAdmin() ? `<div class="uname">@${esc(m.username)}</div>` : ""}
      <div class="mstats">
        <div><b>${open}</b><span>ວຽກຄ້າງ</span></div>
        <div><b>${mine.length - open}</b><span>ສຳເລັດ</span></div>
        <div><b>${borrowed}</b><span>ຢືມຢູ່</span></div>
      </div>
      <div class="m-actions">
        <button class="btn small primary" onclick="viewMemberTasks('${m.id}')">ເບິ່ງໜ້າວຽກ</button>
        ${isAdmin() ? `
          <button class="btn small ghost icon-btn" title="ແກ້ໄຂ / ຣີເຊັດລະຫັດ" onclick="editMember('${m.id}')">✏️</button>
          ${m.id !== me.id ? `<button class="btn small danger icon-btn" title="ລຶບ" onclick="deleteMember('${m.id}')">🗑</button>` : ""}` : ""}
      </div>
    </div>`;
  }).join("") || `<p class="muted">ຍັງບໍ່ມີສະມາຊິກ</p>`;
}

/* =========================================================
   ພາບລວມ
   ========================================================= */
function renderDashboard() {
  $("#helloText").textContent = `ສະບາຍດີ, ${me.name} 👋`;
  $("#todayText").textContent = "ມື້ນີ້ " + fmtLong(new Date());
  $("#defaultPwNotice").hidden = !me.must_change;
  $("#historyTitle").textContent = isAdmin() ? "🕘 ປະຫວັດລ່າສຸດ" : "🕘 ປະຫວັດຂອງຂ້ອຍ";

  const eq = data.equipment;
  // ສະມາຊິກໄດ້ຮັບສະເພາະວຽກຂອງຕົນເອງຈາກ server ຢູ່ແລ້ວ
  const openTasks = data.tasks.filter(t => t.status !== TASK_STATUS[2]);
  const lateTasks = openTasks.filter(t => t.due && t.due < today());
  const stats = [
    ["🧪", "c-indigo", "ອຸປະກອນທັງໝົດ", eq.length],
    ["✅", "c-green", "ພ້ອມໃຊ້", eq.filter(e => e.status === EQUIP_STATUS[0]).length],
    ["📤", "c-blue", "ຖືກຢືມ", eq.filter(e => e.status === EQUIP_STATUS[1]).length],
    ["🔧", "c-amber", "ເປ່ເພ / ສ້ອມແປງ", eq.filter(e => e.status === EQUIP_STATUS[2] || e.status === EQUIP_STATUS[3]).length],
    ["📋", "c-indigo", isAdmin() ? "ວຽກຄ້າງທັງໝົດ" : "ວຽກຄ້າງຂອງຂ້ອຍ", openTasks.length],
    ["⚠️", "c-red", "ວຽກເກີນກຳນົດ", lateTasks.length],
  ];
  $("#stats").innerHTML = stats.map(([ic, c, l, n], i) =>
    `<div class="stat ${i === 2 ? "click" : ""}" ${i === 2 ? `onclick="showBorrowed()" title="ເບິ່ງອຸປະກອນທີ່ຖືກຢືມ"` : ""}><div class="s-ic ${c}">${ic}</div><div><div class="num">${n}</div><div class="label">${l}</div></div></div>`).join("");

  if (isAdmin()) renderTeamProgress(); else renderMyTasks();

  const borrowed = eq.filter(e => e.status === EQUIP_STATUS[1]);
  $("#borrowedList").innerHTML = borrowed.sort((a, b) => dueInfo(a).d - dueInfo(b).d).slice(0, 6).map(e => {
    const url = imgUrl(e.image_path), due = dueInfo(e);
    return `<li class="b-li" onclick="showBorrowed()">
      <span class="b-li-l">${url ? `<img class="thumb sm" src="${url}" alt="">` : `<span class="thumb sm ph">🧪</span>`}
        <span><b>${esc(e.name)}</b><br><span class="muted">👤 ${esc(memberName(e.borrower))}</span></span></span>
      <span class="due-chip ${due.cls}">${due.txt}</span></li>`;
  }).join("") + (borrowed.length > 6 ? `<li class="b-more" onclick="showBorrowed()">ເບິ່ງທັງໝົດ ${borrowed.length} ລາຍການ →</li>` : "")
    || `<li class="empty-li">ບໍ່ມີອຸປະກອນທີ່ຖືກຢືມ</li>`;

  const soon = openTasks.filter(t => t.due && t.due <= offsetDate(3)).sort((a, b) => a.due.localeCompare(b.due));
  $("#dueList").innerHTML = soon.map(t => {
    const late = t.due < today();
    return `<li><span><b>${esc(t.title)}</b>${isAdmin() ? ` · ${esc(memberName(t.assignee))}` : ""}</span><span class="badge ${late ? "st-2" : "st-3"}">${fmtDate(t.due)}</span></li>`;
  }).join("") || `<li class="empty-li">ບໍ່ມີວຽກໃກ້ຮອດກຳນົດ 👍</li>`;

  // ຊື່ຜູ້ເຮັດມາຈາກ actor (ກວດຢູ່ server) ບໍ່ແມ່ນຈາກຂໍ້ຄວາມ → ປອມຊື່ຄົນອື່ນບໍ່ໄດ້
  $("#historyList").innerHTML = data.history.slice(0, 10).map(h => {
    const who = h.actor ? memberName(h.actor) : "";
    const text = who && h.text.startsWith(who + ": ") ? h.text.slice(who.length + 2) : h.text;
    return `<li><span>${who ? `<b>${esc(who)}</b> · ` : ""}${esc(text)}</span><span class="muted">${fmtTime(h.time)}</span></li>`;
  }).join("")
    || `<li class="empty-li">ຍັງບໍ່ມີປະຫວັດ</li>`;
}

// Admin: ສະຫຼຸບຄວາມຄືບໜ້າຂອງແຕ່ລະຄົນ
function renderTeamProgress() {
  const people = data.members.filter(m => data.tasks.some(t => t.assignee === m.id));
  $("#teamProgress").innerHTML = people.map(m => {
    const mine = data.tasks.filter(t => t.assignee === m.id);
    const open = mine.filter(t => t.status !== TASK_STATUS[2]);
    const done = mine.length - open.length;
    const late = open.filter(t => t.due && t.due < today()).length;
    const avg = Math.round(mine.reduce((s, t) => s + progressOf(t), 0) / mine.length);
    const last = mine.filter(t => t.updated_by === m.id).sort((a, b) => (b.updated_at || "").localeCompare(a.updated_at || ""))[0];
    return `<div class="tm" onclick="selectPerson('${m.id}'); goPage('tasks')">
      <div class="hd"><span class="mini-av" style="background:${avColor(m.id)}">${esc(initial(m.name))}</span>
        <div><div class="nm">${esc(m.name)}</div><div class="sm">${esc(m.role_title || "")}</div></div></div>
      <div class="pline"><div class="pbar ${avg === 100 ? "done" : ""}"><span style="width:${avg}%"></span></div><b>${avg}%</b></div>
      <div class="chips"><span>ຄ້າງ ${open.length}</span><span>ສຳເລັດ ${done}</span>${late ? `<span class="lt">ເກີນກຳນົດ ${late}</span>` : ""}</div>
      <div class="last">${last ? `🔄 ${timeAgo(last.updated_at)} · ${esc(last.title)} → ${progressOf(last)}%` : "ຍັງບໍ່ມີການອັບເດດ"}</div>
    </div>`;
  }).join("") || `<p class="muted">ຍັງບໍ່ມີວຽກທີ່ມອບໝາຍ — ໄປທີ່ໜ້າວຽກເພື່ອມອບໝາຍວຽກ</p>`;
}

// ສະມາຊິກ: ລາຍການວຽກຂອງຕົນເອງ
function renderMyTasks() {
  const list = data.tasks.filter(t => t.status !== TASK_STATUS[2])
    .sort((a, b) => (a.due || "9").localeCompare(b.due || "9"));
  $("#myTasks").innerHTML = list.map(t => {
    const late = t.due && t.due < today();
    return `<div class="mt">
      <div><div class="t">${esc(t.title)}</div><div class="d ${late ? "late" : ""}">${t.status}${t.due ? ` · 📅 ${fmtDate(t.due)}${late ? " ເກີນກຳນົດ" : ""}` : ""}</div></div>
      ${pline(t)}
      <span class="mt-btns"><button class="btn small info" onclick="updateProgress('${t.id}')">📝 ບັນທຶກ</button>
      <button class="btn small ghost icon-btn" title="ປະຫວັດ" onclick="openTaskLog('${t.id}')">📜</button></span>
    </div>`;
  }).join("") || `<p class="muted">ບໍ່ມີວຽກຄ້າງ 🎉</p>`;
}


function renderUserBox() {
  $("#meAvatar").textContent = initial(me.name);
  $("#meAvatar").style.background = avColor(me.id);
  $("#meName").textContent = me.name;
  $("#meRole").textContent = me.sys_role === "admin" ? "Admin" : "ສະມາຊິກ";
}

/* ---------- ສຳຮອງຂໍ້ມູນ (Admin) ---------- */
$("#exportBtn").addEventListener("click", () => {
  if (!isAdmin()) return deny();
  const backup = { exportedAt: new Date().toISOString(), ...data };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `lab-backup-${today()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  success("ສຳຮອງຂໍ້ມູນສຳເລັດແລ້ວ", `lab-backup-${today()}.json`, "save");
});

/* =========================================================
   ເລີ່ມຕົ້ນ
   ========================================================= */
function renderAll() {
  if (!me?.username) return;           // ຍັງບໍ່ໄດ້ login ຄົບ
  const fresh = data.members.find(m => m.id === me.id);
  if (!fresh) { logout(); toast("ບັນຊີຂອງທ່ານຖືກລຶບອອກຈາກລະບົບ"); return; }
  me = fresh;
  document.body.classList.toggle("is-admin", isAdmin());
  const active = document.querySelector(".page.active")?.id;
  if (!isAdmin() && ADMIN_PAGES.includes(active)) goPage("dashboard");
  renderUserBox();
  renderDashboard();
  renderEquipment();
  renderCategories();
  renderTasks();
  renderMembers();
}

(async function init() {
  if (!CFG?.SUPABASE_KEY || CFG.SUPABASE_KEY.startsWith("PASTE_")) {
    loginError("ຍັງບໍ່ໄດ້ໃສ່ Supabase key ໃນໄຟລ໌ config.js");
    $("#loginBtn").disabled = true;
    return;
  }
  const { data: { session } } = await sb.auth.getSession();
  if (session) await enterApp(session.user);
  else $("#loginUser").focus();
})();
