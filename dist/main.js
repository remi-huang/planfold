/* Planfold 1.0 prototype — black & white build. Generated from src/*.js */
"use strict";
const obsidian = require("obsidian");
const { Plugin, ItemView, Notice, PluginSettingTab, Modal, TFile, TFolder, MarkdownRenderer, setIcon, moment } = obsidian;

const VIEW_TYPE = "planfold-main-view";
const CAL_VIEW_TYPE = "planfold-calendar";
const WEEK_VIEW_TYPE = "planfold-week";

/* ---------- language ---------- */
let LANG = "en";
const L = (en, zh) => (LANG === "zh" && zh != null ? zh : en);
const guessLang = () => {
  try { const l = (window.localStorage.getItem("language") || navigator.language || "").toLowerCase(); return l.startsWith("zh") ? "zh" : "en"; }
  catch (e) { return "en"; }
};

/* ---------- license (same keys as 0.21.0 and Tally) ---------- */
const LICENSE_PUB = { kty: "EC", crv: "P-256", x: "jPxjTHj7snGHvlhQPjFTetc5jVidntsI6nK_V54SRtk", y: "z5j7tzWJ8lSMiwIgVHHOLHpnQYKnir2xnKevwAAO5Fo" };
const REVOKED = [];
const b64uDec = (s) => { s = s.replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "="; const bin = atob(s); return Uint8Array.from(bin, (c) => c.charCodeAt(0)); };
async function verifyLicense(key) {
  try {
    const m = String(key || "").replace(/\s+/g, "").match(/^(?:PLANFOLD|TALLY)-([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/);
    if (!m) return null;
    const data = b64uDec(m[1]), sig = b64uDec(m[2]);
    const k = await crypto.subtle.importKey("jwk", LICENSE_PUB, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    if (!(await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, k, sig, data))) return null;
    const p = JSON.parse(new TextDecoder().decode(data));
    if (!p || !["planfold", "tally"].includes(p.p) || REVOKED.includes(p.i)) return null;
    return p;
  } catch (e) { return null; }
}

/* ---------- moods ---------- */
const MOOD_KEY = "mood";
/* Moods have no words at all: five dots, light to dark. What each shade means is up to the person. */

/* ---------- templates ---------- */
const TPL_DEFAULT = {
  en: {
    day: [["main", "Main thing", "The one thing that mattered today"], ["joy", "A small joy", "Even a tiny one"], ["better", "Do better tomorrow", "Just one thing"], ["free", "Free write", "Write whatever comes to mind"]],
    week: [["goal", "Goal", "What matters most this week?", ["Try next week", "🧪 Try next week"]], ["review", "Review", "What happened, and what will you carry forward?", ["Keep", "Problems", "✅ Keep", "⚠️ Problems"]]],
    month: [["goal", "Goal", "What matters most this month?", ["Next month"]], ["review", "Review", "What happened, and what pattern do you notice?", ["What worked", "What changed"]]],
    year: [["goal", "Goal", "What matters most this year?", ["Next year"]], ["review", "Review", "What defined this year, and what will you carry forward?", ["This year was about", "Proud of"]]],
  },
  zh: {
    day: [["main", "今天最重要的事", "今天真正重要的一件事"], ["joy", "一件小确幸", "哪怕很小"], ["better", "明天可以更好", "只写一件"], ["free", "随手写", "想到什么写什么"]],
    week: [["goal", "目标", "这周最重要的是什么？", ["下周试试", "🧪 下周尝试"]], ["review", "回顾", "这周发生了什么，要带走什么？", ["保持", "问题", "✅ 保持", "⚠️ 问题"]]],
    month: [["goal", "目标", "这个月最重要的是什么？", ["下个月"]], ["review", "回顾", "这个月发生了什么，看到了什么模式？", ["做得好的", "有什么变化"]]],
    year: [["goal", "目标", "这一年最重要的是什么？", ["明年"]], ["review", "回顾", "什么定义了这一年，要带走什么？", ["这一年关于", "骄傲的事"]]],
  },
};
/* Headings written by 0.21.0 — still read */
const LEGACY_LABELS = {
  day: { joy: ["🌼 A small joy", "🌼 一件快乐的小事"], better: ["🌱 Do better tomorrow", "🌱 明天想做得更好的一件事"], free: ["✍️ Free write", "✍️ 随便写", "Free write", "随手写"] },
  week: { keep: ["✅ Keep", "✅ 保持"], problems: ["⚠️ Problems", "⚠️ 问题"], try: ["🧪 Try next week", "🧪 下周尝试"] },
  month: {}, year: {},
};
/* frontmatter keys written by 0.21.0 — shown when the section is empty */
const LEGACY_FM = { day: { joy: "joy", better: "better" }, week: { keep: "keep", problems: "problems", try: "try" }, month: {}, year: {} };
const TODO_LABELS = ["To do", "待办", "✅ To do", "🎯 This week", "🎯 Month goals", "🎯 Year goals", "This week", "Month goals", "Year goals", "本周", "月目标", "年目标"];
const defaultTemplates = (lang) => {
  const src = TPL_DEFAULT[lang] || TPL_DEFAULT.en, out = {};
  // week, month and year notes start blank: you add your own sections (the old Goal / Review names are still recognised)
  for (const s of Object.keys(src)) out[s] = s === "day" ? src[s].map(([id, label, hint, prev]) => ({ id, label, hint, prev: prev || [] })) : [];
  return out;
};
const SCOPES = ["day", "week", "month", "year"];
/** Every name a default section has had, in both languages — so switching language never hides what's already written */
const defaultLabels = (scope, id) => {
  const out = [];
  for (const lang of Object.keys(TPL_DEFAULT)) for (const [fid, label, , prev] of TPL_DEFAULT[lang][scope] || []) if (fid === id) out.push(label, ...(prev || []));
  return out;
};

/* ---------- settings ---------- */
const DEFAULTS = {
  language: "", setupDone: false, license: "",
  folder: "Planfold", dailySource: "obsidian", dailyFolder: "", dailyFormat: "YYYY-MM-DD",
  quickCaptureField: "free", quickCaptureTimestamp: true,
  weekFolder: "", weekFormat: "GGGG-[W]WW", monthFolder: "", monthFormat: "YYYY-MM", yearFolder: "", yearFormat: "YYYY",
  oldNotes: "ask", oldNoteSkip: [], templates: null, askMood: true,
  periodNoteTemplateVersion: 0, periodTemplateBackupV1: null,
  tabOrder: ["home", "planner", "review"], startTab: "home", openOnStartup: true, displayName: "",
  calendarSidebarAdded: false, homeHidden: [], homeLayout: null, homeLayoutVersion: 0, explorerShortcuts: false, explorerCollapsed: {}, fourfoldLook: false, homePalette: "theme", ignoreFolders: [], weekStart: "monday", timeFormat: "",
  homePinnedPaths: [], homeProjects: [], homeRecentPaths: [], homeRecentTimes: {}, homeActivity: {}, homeActivityTimes: {},
  migratedFrom: "",
};

/* What you opened and edited, by day: changes all the time and only describes this device, so it lives in this
   device's local storage — not in data.json, which syncs (iCloud) and also holds your license, templates and habits. */
const LOCAL_KEYS = ["homeRecentPaths", "homeRecentTimes", "homeActivity", "homeActivityTimes"];

/* ---------- Home layout ---------- */
const HOME_LAYOUT_VERSION = 11;
/* min: the narrowest a card may be dragged (out of 12 columns); sizes: what the width button cycles through;
   tall: spans two rows, so two cards can stack beside it */
const HOME_WIDGETS = {
  today: { label: () => L("To-do", "待办"), min: 4, sizes: [6, 8, 12], tall: true },
  habits: { label: () => L("Habits", "习惯"), min: 3, sizes: [3, 4, 6, 12] },
  capture: { label: () => L("Quick note", "随手记"), min: 3, sizes: [3, 4, 6, 12] },
};
const homeSpanOk = (id, span) => Number.isInteger(span) && span >= HOME_WIDGETS[id].min && span <= 12;
/* The most important thing leads (HIG: "place the most important items near the top and leading side"):
   to-do on the left; habits and quick note are independent cards beside it. Time and mood are page context,
   so they stay in the top bar rather than pretending to be a movable card. */
const defaultHomeLayout = () => ({
  version: HOME_LAYOUT_VERSION,
  items: [
    { id: "today", span: 8, visible: true },
    { id: "habits", span: 4, visible: true },
    { id: "capture", span: 4, visible: true },
  ],
});
function normalizeHomeLayout(saved, legacyHidden = []) {
  const base = defaultHomeLayout();
  let source = saved && Array.isArray(saved.items) ? saved.items.filter(Boolean) : [];
  const keepShown = (from) => base.items.forEach((item) => { if (item.id === "today" && from.has(item.id)) item.visible = from.get(item.id); });
  if (!source.length) {
    keepShown(new Map([["today", !new Set(legacyHidden || []).has("today")]]));
    return base;
  }
  // proto.48: left = time, mood, habits (a column), quick note; middle = to-do; the calendar stays in the sidebar
  if (Number(saved.version || 0) < 8) {
    keepShown(new Map(source.map((x) => [x.id, x.visible !== false])));
    return base;
  }
  // RC5: the old "moment" card bundled habits + quick note. Split it into two real cards while
  // keeping its order, width and visibility. Time + mood remain the fixed context bar above Home.
  if (Number(saved.version || 0) < 11) {
    const expanded = [];
    for (const item of source) {
      if (item.id !== "moment") { expanded.push(item); continue; }
      expanded.push({ id: "habits", span: item.span, visible: item.visible !== false });
      expanded.push({ id: "capture", span: item.span, visible: item.visible !== false });
    }
    source = expanded;
  }
  const defaults = new Map(base.items.map((item) => [item.id, item])), seen = new Set(), items = [];
  for (const raw of source) {
    const def = defaults.get(raw.id);
    if (!def || seen.has(raw.id)) continue;
    seen.add(raw.id);
    const requested = Number(raw.span);
    items.push({ id: raw.id, span: homeSpanOk(raw.id, requested) ? requested : def.span, visible: raw.visible !== false });
  }
  for (const item of base.items) if (!seen.has(item.id)) items.push(Object.assign({}, item));
  // proto.57: to-do moves to the leading side (once; later rearranging is kept)
  if (Number(saved.version || 0) < 9) {
    const t = items.findIndex((x) => x.id === "today"), m = items.findIndex((x) => x.id === "habits");
    if (t > m && m >= 0) items.splice(m, 0, items.splice(t, 1)[0]);
  }
  return { version: HOME_LAYOUT_VERSION, items };
}

/* ---------- small helpers ---------- */
const pad = (n) => String(n).padStart(2, "0");
/* First day of a calendar row. Not startOf("week"): that follows moment's locale (zh-cn starts on Monday). */
const rowStartOf = (m, sunday) => (sunday ? moment(m).startOf("day").subtract(moment(m).day(), "day") : moment(m).startOf("isoWeek"));
/* 12/24-hour clock: Settings → Language & calendar, or automatic (24 h in Chinese) */
let TIME24 = null;
const use24 = () => (TIME24 == null ? LANG === "zh" : TIME24);
/* Notes saved on Windows (or by some sync tools) use \r\n — read and write them as \n */
const lf = (t) => String(t || "").replace(/\r\n?/g, "\n");
const DKEY = "YYYY-MM-DD";
/* The day's most important to-do is written as "- [ ] ⭐ text" — readable in any Markdown app */
const STAR_RE = /^⭐\uFE0F?\s*/;
/* "09:00-10:30 text", also "13:30-15:30下午…" typed without the space (but "9:00 3 videos" keeps its 3) */
const TIME_RE = /^(\d{1,2}[:：]\d{2}(?:\s*[-–—~～至]\s*\d{1,2}[:：]\d{2})?)(?:\s+|(?=[^\d\s:：\-–—~～至]))(.+)$/;
const norm = (t) => String(t || "").replace(/[\p{Extended_Pictographic}️‍]/gu, "").replace(/^#+\s*/, "").trim().toLowerCase();
const clean = (p) => String(p || "").replace(/^\/+|\/+$/g, "");
const basenameOf = (p) => String(p).split("/").pop().replace(/\.md$/, "");
const parentOf = (p) => { const a = String(p).split("/"); a.pop(); return a.join("/"); };
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

function bodyStart(ls) {
  if (ls[0] !== "---") return 0;
  for (let i = 1; i < ls.length; i++) if (ls[i] === "---") return i + 1;
  return 0;
}
/** Every "## heading" with its range and checklist items */
function parseSections(text) {
  const ls = lf(text).split("\n");
  const out = [];
  let cur = null, inCode = false;
  for (let i = bodyStart(ls); i < ls.length; i++) {
    if (/^```/.test(ls[i])) inCode = !inCode;
    if (inCode) { if (cur) cur.lines.push(i); continue; }
    const h = ls[i].match(/^(#{1,2})\s+(.*)$/);
    if (h) {
      if (cur) cur.end = i;
      cur = h[1].length === 2 ? { title: h[2].trim(), line: i, end: ls.length, items: [], lines: [] } : null;
      if (cur) out.push(cur);
      continue;
    }
    if (!cur) continue;
    cur.lines.push(i);
    const t = ls[i].match(/^\s*[-*] \[([ xX])\]\s?(.*)$/);
    if (t && t[2].trim()) {
      const raw = t[2].trim(), star = STAR_RE.test(raw), body = raw.replace(STAR_RE, ""), tm = body.match(TIME_RE);
      cur.items.push({ line: i, raw: ls[i], done: t[1] !== " ", star, text: tm ? tm[2] : body, time: tm ? tm[1].replace(/：/g, ":") : "", full: raw, plain: body });
    }
  }
  return { ls, sections: out };
}
const sectionText = (parsed, sec, end) => {
  if (!sec) return "";
  const out = [];
  let inRecap = false;
  const stop = end == null ? sec.end : end;
  for (let i = sec.line + 1; i < stop; i++) {
    const line = parsed.ls[i];
    if (!inRecap && /^```planner-recap\s*$/.test(line)) { inRecap = true; continue; }
    if (inRecap) { if (/^```\s*$/.test(line)) inRecap = false; continue; }
    out.push(line);
  }
  return out.join("\n").trim();
};
const firstLine = (t) => (String(t || "").split("\n").map((x) => x.replace(/^[-*>#\s]+/, "").trim()).find(Boolean) || "");
const plain = (t) => String(t || "").replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, a, b) => b || a).replace(/[*_`]/g, "");

/* =====================================================================
   Plugin: data layer
   ===================================================================== */
class PlanfoldPlugin extends Plugin {
  async onload() {
    await this.loadSettings();
    this.license = await verifyLicense(this.settings.license);
    this.dayCache = new Map();
    this.registerView(VIEW_TYPE, (leaf) => new PlanfoldView(leaf, this));
    this.registerView(CAL_VIEW_TYPE, (leaf) => new PlanfoldCalendarView(leaf, this));
    this.registerView(WEEK_VIEW_TYPE, (leaf) => new PlanfoldWeekView(leaf, this));
    this.addCommand({ id: "open-calendar", name: "Open calendar in the sidebar", icon: "calendar-days", callback: () => this.openCalendar(true) });
    this.addRibbonIcon("layout-dashboard", "Planfold", () => this.openView());
    this.addCommand({ id: "open", name: "Open home", callback: () => this.openView() });
    this.addCommand({ id: "open-today", name: "Open today's daily note", callback: async () => this.openFile(await this.ensureNote("day", moment())) });
    this.addCommand({ id: "quick-capture", name: "Quick capture to today", icon: "mic", callback: () => new QuickCaptureModal(this.app, this).open() });
    this.addCommand({ id: "setup-mobile-capture", name: "Set up mobile quick capture", icon: "smartphone", callback: () => new MobileCaptureSetupModal(this.app, this).open() });
    this.registerObsidianProtocolHandler("planfold-capture", async (params) => {
      // any web page can open obsidian:// links: take plain text only, and not a whole book of it
      const text = String((params && params.text) || "").trim().slice(0, 5000);
      if (text) {
        await this.appendQuickCapture(text);
        new Notice(L("Saved to today's note", "已保存到今日日记"));
      } else new QuickCaptureModal(this.app, this).open();
    });
    this.addSettingTab(new PlanfoldSettingTab(this.app, this));

    // 0.21.0 put a ```planner-recap``` block in daily notes. Keep rendering it (read-only) unless the old plugin still does.
    const oldOn = this.app.plugins && this.app.plugins.enabledPlugins && this.app.plugins.enabledPlugins.has && this.app.plugins.enabledPlugins.has("planner");
    if (!oldOn) this.registerMarkdownCodeBlockProcessor("planner-recap", (src, el, ctx) => this.renderRecapBlock(el, ctx));

    this.registerEvent(this.app.workspace.on("file-open", (f) => this.rememberFile(f, true)));
    this.registerEvent(this.app.vault.on("modify", (f) => { this.rememberFile(f, false); this.dayCache.delete(f.path); this.changed(f); }));
    this.registerEvent(this.app.vault.on("create", (f) => this.changed(f)));
    this.registerEvent(this.app.vault.on("rename", (f, oldPath) => this.onRename(f, oldPath)));
    this.registerEvent(this.app.vault.on("delete", (f) => this.onDelete(f)));
    this.registerEvent(this.app.metadataCache.on("changed", (f) => { this.dayCache.delete(f.path); this.changed(f); }));
    // proto.31: Pinned and Recent sit at the top of Obsidian's file explorer
    this.registerEvent(this.app.workspace.on("file-menu", (menu, file) => {
      if (!(file instanceof TFile) || file.extension !== "md") return;
      const on = (this.settings.homePinnedPaths || []).includes(file.path);
      menu.addItem((i) => i.setTitle(on ? L("Unpin", "取消置顶") : L("Pin", "置顶")).setIcon(on ? "pin-off" : "pin").onClick(() => this.togglePin(file)));
    }));
    this.addCommand({ id: "toggle-pin", name: "Pin or unpin the current note", icon: "pin", checkCallback: (checking) => {
      const f = this.app.workspace.getActiveFile();
      if (!f || f.extension !== "md") return false;
      if (!checking) this.togglePin(f);
      return true;
    } });
    this.registerEvent(this.app.workspace.on("file-open", () => this.refreshExplorer()));
    this.registerEvent(this.app.workspace.on("layout-change", () => this.refreshExplorer()));
    this.register(() => { clearTimeout(this._explorerT); this.unmountExplorer(); document.body.removeClass("planfold-look"); });
    this.applyLook();
    this.app.workspace.onLayoutReady(async () => {
      this.mountExplorer();
      if (this.settings.migratedFrom) await this.importFields();
      // proto.44: the week calendar moves from Home to the right sidebar — put it there once; after that, where you keep it is up to you
      if (!this.settings.calendarSidebarAdded) { this.settings.calendarSidebarAdded = true; await this.saveSettings(); this.openCalendar(false); }
      if (!this.settings.setupDone) { this.openView().then(() => new OnboardingModal(this.app, this).open()); return; }
      if (this.settings.openOnStartup) this.openView();
    });
  }
  onunload() { if (this._saveTimer) { clearTimeout(this._saveTimer); this._saveTimer = null; this.saveLocal(); } }

  async loadSettings() {
    let data = await this.loadData();
    if (!data) data = (await this.importTally()) || (await this.importOld());
    this.settings = Object.assign({}, DEFAULTS, data || {});
    // Recent/activity come from this device. The first time, take what an older version kept in data.json.
    const local = this.loadLocal();
    if (local) for (const k of LOCAL_KEYS) if (local[k] != null) this.settings[k] = local[k];
    if (!local && data && LOCAL_KEYS.some((k) => k in data)) { this.saveLocal(); this._migrateLocal = true; }
    if (!data || !["home", "planner", "review"].includes(data.startTab)) this.settings.startTab = (this.settings.tabOrder || ["home"])[0];
    this.settings.tabOrder = [...new Set([...(this.settings.tabOrder || []), "home", "planner", "review"])].filter((x) => ["home", "planner", "review"].includes(x));
    for (const k of ["homePinnedPaths", "homeProjects", "homeRecentPaths", "oldNoteSkip", "ignoreFolders", "homeHidden"]) if (!Array.isArray(this.settings[k])) this.settings[k] = [];
    if (!this.settings.explorerCollapsed || typeof this.settings.explorerCollapsed !== "object") this.settings.explorerCollapsed = {};
    for (const k of ["homeRecentTimes", "homeActivity", "homeActivityTimes"]) if (!this.settings[k] || typeof this.settings[k] !== "object") this.settings[k] = {};
    const previousHomeLayout = this.settings.homeLayout;
    this.settings.homeLayout = normalizeHomeLayout(previousHomeLayout, this.settings.homeHidden);
    this.settings.homeLayoutVersion = HOME_LAYOUT_VERSION;
    if (!previousHomeLayout || previousHomeLayout.version !== HOME_LAYOUT_VERSION) this._migrateHomeLayout = true;
    LANG = this.settings.language || guessLang();
    if (!this.settings.templates) this.settings.templates = defaultTemplates(LANG);
    if ((this.settings.periodNoteTemplateVersion || 0) < 1) {
      const next = defaultTemplates(LANG);
      this.settings.periodTemplateBackupV1 = {
        week: this.settings.templates.week || [],
        month: this.settings.templates.month || [],
        year: this.settings.templates.year || [],
      };
      for (const scope of ["week", "month", "year"]) this.settings.templates[scope] = next[scope];
      this.settings.periodNoteTemplateVersion = 1;
      await this.writeData();
    }
    // proto.55: week / month / year templates start blank. Only untouched defaults (Goal + Review) are cleared;
    // anything already written in a note keeps showing (see the planner's "written sections").
    if ((this.settings.periodNoteTemplateVersion || 0) < 2) {
      const T = this.settings.templates;
      this.settings.periodTemplateBackupV2 = { week: T.week || [], month: T.month || [], year: T.year || [] };
      for (const scope of ["week", "month", "year"]) {
        const ids = (T[scope] || []).map((f) => f.id).join(",");
        if (ids === "goal,review" || ids === "") T[scope] = [];
      }
      this.settings.periodNoteTemplateVersion = 2;
      await this.writeData();
    }
    if (this._migrateLocal || this._migrateHomeLayout) {
      this._migrateLocal = false; this._migrateHomeLayout = false;
      await this.writeData();
    } // local lists move off data.json; Home receives the current layout schema
  }
  /** First load of `planfold`: take every setting from Remi's earlier build (id `tally`, author Remi).
      Another community plugin also uses the id `tally`, so the author is checked before anything is read. */
  async importTally() {
    try {
      const ad = this.app.vault.adapter, d = `${this.app.vault.configDir}/plugins/tally`;
      if (!(await ad.exists(`${d}/manifest.json`)) || !(await ad.exists(`${d}/data.json`))) return null;
      const man = JSON.parse(await ad.read(`${d}/manifest.json`));
      if (man.id !== "tally" || man.author !== "Remi") return null;
      const o = JSON.parse(await ad.read(`${d}/data.json`));
      return o && typeof o === "object" ? Object.assign(o, { migratedFromTally: true }) : null;
    } catch (e) { console.error("Planfold: import from Tally failed", e); }
    return null;
  }
  /** First load of `planfold`: bring over what 0.21.0 (id `planner`, any folder name) saved. */
  async importOld() {
    try {
      const ad = this.app.vault.adapter, base = `${this.app.vault.configDir}/plugins`;
      let dirs = [`${base}/planner`];
      try { const l = await ad.list(base); dirs = [...dirs, ...(l.folders || [])]; } catch (e) {}
      for (const d of dirs) {
        if (!(await ad.exists(`${d}/manifest.json`)) || !(await ad.exists(`${d}/data.json`))) continue;
        const man = JSON.parse(await ad.read(`${d}/manifest.json`));
        if (man.id !== "planner") continue;
        const o = JSON.parse(await ad.read(`${d}/data.json`));
        const keep = ["license", "folder", "dailySource", "dailyFolder", "dailyFormat", "openOnStartup", "homePinnedPaths", "homeProjects", "homeRecentPaths", "homeRecentTimes", "homeActivity", "homeActivityTimes"];
        const out = { migratedFrom: "planner" };
        for (const k of keep) if (o[k] != null) out[k] = o[k];
        if (o.lang) out.language = o.lang;
        if (o.homeDisplayName) out.displayName = o.homeDisplayName;
        return out;
      }
    } catch (e) { console.error("Planfold: import from 0.21.0 failed", e); }
    return null;
  }
  /** 0.21.0 kept its daily/weekly fields in <folder>/Fields.md and wrote answers as properties. Map them onto the new template. */
  async importFields() {
    const S = this.settings;
    if (S.fieldsImported || S.templatesEdited) return;
    S.fieldsImported = true;
    try {
      const path = `${this.dir()}/Fields.md`;
      if (!(await this.app.vault.adapter.exists(path))) return;
      const known = { day: { "main-thing": "main", main: "main", joy: "joy", better: "better" }, week: { keep: "keep", problems: "problems", try: "try" } };
      for (const l of (await this.app.vault.adapter.read(path)).split("\n")) {
        if (!/^\s*\|/.test(l)) continue;
        const c = l.trim().replace(/^\||\|$/g, "").split("|").map((x) => x.trim());
        const type = (c[0] || "").toLowerCase(), key = c[1], label = (c[2] || key || "").replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, "").trim();
        if (!(type in known) || !key || key === "rating" || (c[4] || "").toLowerCase() === "off") continue;
        if (type === "week" && S.periodNoteTemplateVersion >= 1) continue;
        const list = S.templates[type];
        const id = known[type][key];
        const hit = id && list.find((f) => f.id === id);
        if (hit) { hit.fmKey = key; continue; }
        if (list.some((f) => f.fmKey === key || f.id === key)) continue;
        const at = type === "day" ? Math.max(0, list.findIndex((f) => f.id === "free")) : list.length;
        list.splice(at, 0, { id: key, label, hint: c[3] || "", prev: [], fmKey: key });
      }
    } catch (e) { console.error("Planfold: Fields.md import failed", e); }
    await this.saveSettings();
  }
  async saveSettings() { clearTimeout(this._saveTimer); this._saveTimer = null; this.saveLocal(); await this.writeData(); }
  /** data.json: everything except the per-device lists */
  writeData() { const out = Object.assign({}, this.settings); for (const k of LOCAL_KEYS) delete out[k]; return this.saveData(out); }
  loadLocal() {
    try {
      // per vault, per device; "tally-local" is where the earlier Tally build kept the same lists
      if (this.app.loadLocalStorage) return this.app.loadLocalStorage("planfold-local") || this.app.loadLocalStorage("tally-local");
      const t = window.localStorage.getItem("planfold-local") || window.localStorage.getItem("tally-local"); return t ? JSON.parse(t) : null;
    } catch (e) { return null; }
  }
  saveLocal() {
    const o = {}; for (const k of LOCAL_KEYS) o[k] = this.settings[k];
    try { if (this.app.saveLocalStorage) this.app.saveLocalStorage("planfold-local", o); else window.localStorage.setItem("planfold-local", JSON.stringify(o)); }
    catch (e) { console.error("Planfold: couldn't save recent notes", e); }
  }
  /** Recent/activity change on every open and every autosave: batch them (at most every 5 s), on this device only */
  queueSave() { if (this._saveTimer) return; this._saveTimer = setTimeout(() => { this._saveTimer = null; this.saveLocal(); }, 5000); }

  /* ---------- views ---------- */
  async openView(tab, opts) {
    let leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0];
    if (!leaf) { leaf = this.app.workspace.getLeaf("tab"); await leaf.setViewState({ type: VIEW_TYPE, active: true }); }
    this.app.workspace.revealLeaf(leaf);
    const v = leaf.view;
    if (v instanceof PlanfoldView && tab) v.go(tab, opts);
    return v;
  }
  async openCalendar(reveal) {
    let leaf = this.app.workspace.getLeavesOfType(CAL_VIEW_TYPE)[0];
    if (!leaf) { const ws = this.app.workspace; leaf = ws.getRightLeaf ? ws.getRightLeaf(false) : null; if (!leaf) return; await leaf.setViewState({ type: CAL_VIEW_TYPE, active: !!reveal }); }
    if (reveal) this.app.workspace.revealLeaf(leaf);
  }
  async openWeekCalendar() {
    let leaf = this.app.workspace.getLeavesOfType(WEEK_VIEW_TYPE)[0];
    if (!leaf) { leaf = this.app.workspace.getLeaf("tab"); await leaf.setViewState({ type: WEEK_VIEW_TYPE, active: true }); }
    this.app.workspace.revealLeaf(leaf);
  }
  views() { return [VIEW_TYPE, CAL_VIEW_TYPE, WEEK_VIEW_TYPE].flatMap((t) => this.app.workspace.getLeavesOfType(t)).map((l) => l.view).filter((v) => v instanceof PlanfoldView); }
  changed(f) {
    if (!(f instanceof TFile)) return;
    clearTimeout(this._chg);
    this._chg = setTimeout(() => this.views().forEach((v) => v.softRefresh()), 300);
  }
  refreshAll() { this.views().forEach((v) => v.render()); }
  async openFile(file, newTab) { if (file) await this.app.workspace.getLeaf(newTab ? "tab" : false).openFile(file); }

  /* ---------- paths ---------- */
  dir() { return clean(this.settings.folder) || "Planfold"; }
  dailyOpts() {
    if (this.settings.dailySource === "custom") return { folder: clean(this.settings.dailyFolder), format: this.settings.dailyFormat || DKEY, template: "" };
    const dn = this.app.internalPlugins && this.app.internalPlugins.getPluginById && this.app.internalPlugins.getPluginById("daily-notes");
    const o = (dn && dn.instance && dn.instance.options) || {};
    return { folder: clean(o.folder), format: o.format || DKEY, template: (o.template || "").trim() };
  }
  scopeFolder(scope) {
    const s = this.settings, name = { week: "Week", month: "Month", year: "Year" }[scope];
    return clean(s[scope + "Folder"]) || `${this.dir()}/${name}`;
  }
  scopeFormat(scope) { return this.settings[scope + "Format"] || { week: "GGGG-[W]WW", month: "YYYY-MM", year: "YYYY" }[scope]; }
  start(scope, m) { const x = moment(m); return scope === "day" ? x.startOf("day") : scope === "week" ? x.startOf("isoWeek") : x.startOf(scope); }
  pathFor(scope, m) {
    if (scope === "day") { const o = this.dailyOpts(); return `${o.folder ? o.folder + "/" : ""}${moment(m).format(o.format)}.md`; }
    const f = this.scopeFolder(scope);
    return `${f ? f + "/" : ""}${moment(m).format(this.scopeFormat(scope))}.md`;
  }
  fileFor(scope, m) { const f = this.app.vault.getAbstractFileByPath(this.pathFor(scope, m)); return f instanceof TFile ? f : null; }
  todoLabel() { return L("To do", "待办"); }
  planfoldBlock(scope) {
    const out = [`## ${this.todoLabel()}`, ""];
    for (const f of this.settings.templates[scope] || []) out.push(`## ${f.label}`, "");
    return out.join("\n");
  }
  async ensureFolder(path) {
    let cur = "";
    for (const p of clean(path).split("/").filter(Boolean)) { cur = cur ? `${cur}/${p}` : p; if (!this.app.vault.getAbstractFileByPath(cur)) await this.app.vault.createFolder(cur).catch(() => {}); }
  }
  /** The note for this period, created if needed. Two quick taps on a day with no note yet (mood, then a habit)
      share one creation instead of racing — the second used to fail with "file already exists". */
  async ensureNote(scope, m) {
    const ex = this.fileFor(scope, m);
    if (ex) return ex;
    const path = this.pathFor(scope, m);
    this._creating = this._creating || new Map();
    if (!this._creating.has(path)) this._creating.set(path, this.createNote(scope, m, path).finally(() => this._creating.delete(path)));
    return this._creating.get(path);
  }
  async createNote(scope, m, path) {
    let body = "";
    if (scope === "day") {
      const o = this.dailyOpts();
      if (o.template) {
        const tp = this.app.vault.getAbstractFileByPath(o.template.endsWith(".md") ? o.template : o.template + ".md");
        if (tp instanceof TFile) body = (await this.app.vault.read(tp))
          .replace(/\{\{\s*date\s*(?::([^}]+))?\}\}/g, (_, f) => moment(m).format(f ? f.trim() : o.format))
          .replace(/\{\{\s*title\s*\}\}/g, moment(m).format(o.format))
          .replace(/\{\{\s*time\s*(?::([^}]+))?\}\}/g, (_, f) => moment().format(f ? f.trim() : "HH:mm"));
      }
      body = body.replace(/\s*$/, "") + (body.trim() ? "\n\n" : "") + this.planfoldBlock("day") + "\n";
    } else {
      const s = this.start(scope, m);
      const fm = scope === "week"
        ? `type: planfold-week\nweek: ${s.format("GGGG-[W]WW")}\nstart: ${s.format(DKEY)}\nend: ${s.clone().add(6, "day").format(DKEY)}`
        : scope === "month" ? `type: planfold-month\nmonth: ${s.format("YYYY-MM")}` : `type: planfold-year\nyear: ${s.format("YYYY")}`;
      body = `---\n${fm}\n---\n\n${this.planfoldBlock(scope)}\n`;
    }
    await this.ensureFolder(parentOf(path));
    try { return await this.app.vault.create(path, body); }
    catch (e) { const f = this.app.vault.getAbstractFileByPath(path); if (f instanceof TFile) return f; throw e; }
  }

  /* ---------- reading notes ---------- */
  fieldLabels(scope, f) { return [f.label, ...(f.prev || []), ...defaultLabels(scope, f.id), ...((LEGACY_LABELS[scope] || {})[f.id] || [])].map(norm); }
  findField(parsed, scope, f) { const ls = this.fieldLabels(scope, f); return parsed.sections.find((s) => ls.includes(norm(s.title))); }
  findTodo(parsed) { const ls = TODO_LABELS.map(norm).concat([norm(this.todoLabel())]); return parsed.sections.find((s) => ls.includes(norm(s.title))); }
  /** A field's text: its section up to the next # / ## heading — a heading you add yourself below it stays yours.
      Falls back to a 0.21.0 property, and for Free write to 0.21.0's loose lines. */
  fieldValue(parsed, fm, scope, f) {
    const sec = this.findField(parsed, scope, f);
    let v = sectionText(parsed, sec);
    const lk = f.fmKey || (LEGACY_FM[scope] || {})[f.id];
    if (!v && lk && fm && fm[lk] != null && String(fm[lk]).trim()) v = String(fm[lk]);
    if (!sec && f.id === "free") v = this.legacyFreeLines(parsed).map((i) => parsed.ls[i]).join("\n").replace(/\n{3,}/g, "\n\n").trim();
    return { sec, value: v };
  }
  fm(file) { return (file && this.app.metadataCache.getFileCache(file) && this.app.metadataCache.getFileCache(file).frontmatter) || {}; }
  async readNote(scope, m) {
    const file = this.fileFor(scope, m);
    const text = file ? await this.app.vault.cachedRead(file) : "";
    const parsed = parseSections(text), fm = this.fm(file);
    const todo = this.findTodo(parsed);
    const fields = {}, found = {};
    for (const f of this.settings.templates[scope] || []) {
      const r = this.fieldValue(parsed, fm, scope, f);
      found[f.id] = !!r.sec;
      fields[f.id] = r.value;
    }
    const hasPlanfold = !!todo || Object.values(found).some(Boolean);
    return { file, exists: !!file, path: this.pathFor(scope, m), parsed, todo, items: todo ? todo.items : [], fields, fm, hasPlanfold };
  }
  /** Text 0.21.0 treated as "your own writing": lines before the first section (minus a # title) and non-task lines inside To do */
  legacyFreeLines(parsed) {
    const out = [], ls = parsed.ls, start = bodyStart(ls);
    const firstSec = parsed.sections.length ? parsed.sections[0].line : ls.length;
    let inCode = false;
    for (let i = start; i < firstSec; i++) { if (/^```/.test(ls[i])) { inCode = !inCode; continue; } if (!inCode && !/^#\s/.test(ls[i])) out.push(i); }
    const todo = this.findTodo(parsed);
    if (todo) {
      inCode = false;
      for (const i of todo.lines) { if (/^```/.test(ls[i])) { inCode = !inCode; continue; } if (!inCode && !/^\s*[-*] \[[ xX]\]/.test(ls[i])) out.push(i); }
    }
    while (out.length && !ls[out[0]].trim()) out.shift();
    return out;
  }
  isOldNote(note) {
    return note.exists && !note.hasPlanfold && (this.settings.oldNotes === "ask") && !(this.settings.oldNoteSkip || []).includes(note.path);
  }
  async appendPlanfold(file, scope) {
    await this.app.vault.process(file, (raw) => {
      const data = lf(raw), parsed = parseSections(data);
      const add = [];
      if (!this.findTodo(parsed)) add.push(`## ${this.todoLabel()}`, "");
      for (const f of this.settings.templates[scope] || []) if (!this.findField(parsed, scope, f)) add.push(`## ${f.label}`, "");
      if (!add.length) return data;
      return data.replace(/\s*$/, "") + "\n\n" + add.join("\n") + "\n";
    });
  }

  /* ---------- writing ---------- */
  /** Save one field. `base` is the text the editor started from: if the note changed underneath (a quick capture,
      another device, the Obsidian editor), nothing written there is overwritten — an addition at the end is kept
      after your text; anything else is kept above it. Returns { value, merged } with what the field now holds. */
  async writeField(scope, m, field, value, base) {
    const file = await this.ensureNote(scope, m);
    const trim = (t) => String(t || "").replace(/\s+$/, "");
    // a # / ## typed inside a field would end it on the next read; keep it inside as ###
    let inCode = false;
    const body = trim(lf(value)).split("\n").map((l) => { if (/^```/.test(l)) inCode = !inCode; return !inCode && /^#{1,2}\s/.test(l) ? l.replace(/^#{1,2}/, "###") : l; }).join("\n");
    const fm = this.fm(file);
    let out = { value: body, merged: false };
    await this.app.vault.process(file, (raw) => {
      const data = lf(raw);
      const parsed = parseSections(data), ls = parsed.ls.slice();
      const cur = this.fieldValue(parsed, fm, scope, field), sec = cur.sec;
      let next = body;
      if (base != null && trim(cur.value) !== trim(base)) {
        const theirs = trim(cur.value), b0 = trim(base);
        if (body === b0) { out = { value: theirs, merged: false }; return data; } // you changed nothing; theirs stands
        if (theirs.startsWith(b0)) { // an addition at the end (a quick capture, usually): keep it after yours
          const added = theirs.slice(b0.length).replace(/^\n+/, "");
          next = body.includes(added) ? body : `${body}\n${added}`;
          out = { value: next, merged: true };
        } else { next = `${theirs}\n\n${body}`; out = { value: next, merged: true, conflict: true }; }
      }
      if (!sec) {
        if (field.id === "free") {
          // the text shown in Free write came from loose lines (0.21.0); move it into its own section instead of copying it
          const rm = this.legacyFreeLines(parsed).filter((i) => ls[i].trim());
          for (const i of rm.sort((a, b) => b - a)) ls.splice(i, 1);
          const o = ls.join("\n").replace(/\n{3,}/g, "\n\n");
          return next ? o.replace(/\s*$/, "") + `\n\n## ${field.label}\n${next}\n` : o;
        }
        if (!next) return data;
        return data.replace(/\s*$/, "") + `\n\n## ${field.label}\n${next}\n`;
      }
      // Replace the field as one unit, up to the next # / ## heading. A ```planner-recap``` block left by 0.21.0
      // is not part of the text you edit, so put it back after it.
      const keep = [];
      let inRecap = false;
      for (let i = sec.line + 1; i < sec.end; i++) {
        if (!inRecap && /^```planner-recap\s*$/.test(ls[i])) inRecap = true;
        if (inRecap) { keep.push(ls[i]); if (keep.length > 1 && /^```\s*$/.test(ls[i])) inRecap = false; }
      }
      const lines = [...(next ? next.split("\n") : []), "", ...(keep.length ? [...keep, ""] : [])];
      ls.splice(sec.line + 1, sec.end - sec.line - 1, ...lines);
      return ls.join("\n");
    });
    if (out.conflict) new Notice(L("This section had just changed elsewhere. Both versions are kept — have a look.", "这一段刚在别处改过，两边的内容都保留了，请看一下。"));
    return out;
  }
  quickCaptureField() {
    const list = (this.settings.templates && this.settings.templates.day) || [];
    return list.find((f) => f.id === this.settings.quickCaptureField) || list.find((f) => f.id === "free") || list[list.length - 1] || { id: "quick", label: L("Quick notes", "随手记"), hint: "", prev: [] };
  }
  async appendQuickCapture(value) {
    const text = String(value || "").trim();
    if (!text) return null;
    const field = this.quickCaptureField();
    const file = await this.ensureNote("day", moment());
    const prefix = this.settings.quickCaptureTimestamp === false ? "" : moment().format(use24() ? "HH:mm " : "h:mm A ");
    const parts = text.split(/\r?\n/);
    const entry = [`- ${prefix}${parts[0]}`, ...parts.slice(1).map((line) => `  ${line}`)];
    await this.app.vault.process(file, (raw) => {
      const data = lf(raw), parsed = parseSections(data), ls = parsed.ls.slice();
      const sec = this.findField(parsed, "day", field);
      if (!sec) return data.replace(/\s*$/, "") + `\n\n## ${field.label}\n${entry.join("\n")}\n`;
      let at = sec.end;
      while (at > sec.line + 1 && !ls[at - 1].trim()) at--;
      ls.splice(at, 0, ...entry);
      return ls.join("\n");
    });
    return file;
  }
  async addTodo(scope, m, text, done = false) {
    text = String(text || "").trim();
    if (!text) return;
    const file = await this.ensureNote(scope, m);
    await this.app.vault.process(file, (raw) => {
      const parsed = parseSections(raw), ls = parsed.ls.slice();
      const sec = this.findTodo(parsed);
      if (!sec) {
        const start = bodyStart(ls);
        let at = start;
        while (at < ls.length && !ls[at].trim()) at++;
        if (at < ls.length && /^#\s/.test(ls[at])) { at++; while (at < ls.length && !ls[at].trim()) at++; } else at = start;
        ls.splice(at, 0, ...(at > 0 && ls[at - 1] && ls[at - 1].trim() ? [""] : []), `## ${this.todoLabel()}`, `- [${done ? "x" : " "}] ${text}`, "");
        return ls.join("\n");
      }
      let last = sec.line;
      for (const i of sec.lines) if (/^\s*[-*] \[[ xX]\]/.test(ls[i])) last = i;
      ls.splice(last + 1, 0, `- [${done ? "x" : " "}] ${text}`);
      return ls.join("\n");
    });
  }
  /** Calendar drag: move a to-do to another day (or the week list) and/or give it a new time ("" = no time).
      Adds to the target before removing it from the source: a failure leaves a copy, never a loss. */
  async rescheduleTodo(path, item, scope, m, time) {
    const body = (item.star ? "⭐ " : "") + (time ? time + " " : "") + item.text;
    const target = this.fileFor(scope, m), targetPath = target ? target.path : this.pathFor(scope, m);
    if (targetPath === path) return this.lineOp(path, item, (l) => l.replace(/^(\s*[-*] \[[ xX]\]\s?).*$/, (_, box) => box + body));
    const f = this.app.vault.getAbstractFileByPath(path);
    if (!(f instanceof TFile)) return false;
    if (lf(await this.app.vault.read(f)).split("\n")[item.line] !== item.raw) { this.staleNotice(); return false; }
    await this.addTodo(scope, m, body, item.done);
    return this.lineOp(path, item, () => null);
  }
  staleNotice() { new Notice(L("The note just changed. Refreshed — please try again.", "笔记刚刚有变动，已刷新，请再试一次。")); }
  async lineOp(path, item, fn) {
    const f = this.app.vault.getAbstractFileByPath(path);
    if (!(f instanceof TFile)) return false;
    let ok = true;
    await this.app.vault.process(f, (data) => {
      const ls = lf(data).split("\n");
      if (ls[item.line] !== item.raw) { ok = false; return data; }
      const r = fn(ls[item.line]);
      if (r === null) ls.splice(item.line, 1); else ls[item.line] = r;
      return ls.join("\n");
    });
    if (!ok) this.staleNotice();
    return ok;
  }
  toggleTodo(path, it) { return this.lineOp(path, it, (l) => l.replace(/\[([ xX])\]/, it.done ? "[ ]" : "[x]")); }
  editTodo(path, it, text) {
    text = String(text || "").trim().replace(STAR_RE, "");
    if (!text) return this.lineOp(path, it, () => null);
    if (it.star) text = "⭐ " + text;
    return this.lineOp(path, it, (l) => l.replace(/^(\s*[-*] \[[ xX]\]\s?).*$/, `$1${text}`));
  }

  /** Only one ⭐ per list: marking one clears the others in the same section */
  async setStar(path, item, on) {
    const f = this.app.vault.getAbstractFileByPath(path);
    if (!(f instanceof TFile)) return false;
    let ok = true;
    await this.app.vault.process(f, (data) => {
      const parsed = parseSections(data), ls = parsed.ls;
      if (ls[item.line] !== item.raw) { ok = false; return data; }
      const sec = parsed.sections.find((s) => s.lines.includes(item.line));
      for (const it of sec ? sec.items : []) if (it.star) ls[it.line] = ls[it.line].replace(/^(\s*[-*] \[[ xX]\]\s?)⭐\uFE0F?\s*/, "$1");
      if (on) ls[item.line] = ls[item.line].replace(/^(\s*[-*] \[[ xX]\]\s?)(?:⭐\uFE0F?\s*)?/, "$1⭐ ");
      return ls.join("\n");
    });
    if (!ok) this.staleNotice();
    return ok;
  }
  /** Drag to reorder: move one checklist line before/after another in the same note */
  async moveTodo(path, item, target, after) {
    const f = this.app.vault.getAbstractFileByPath(path);
    if (!(f instanceof TFile) || item.line === target.line) return false;
    let ok = true;
    await this.app.vault.process(f, (data) => {
      const ls = lf(data).split("\n");
      if (ls[item.line] !== item.raw || ls[target.line] !== target.raw) { ok = false; return data; }
      const [moved] = ls.splice(item.line, 1);
      let at = target.line > item.line ? target.line - 1 : target.line;
      ls.splice(after ? at + 1 : at, 0, moved);
      return ls.join("\n");
    });
    if (!ok) this.staleNotice();
    return ok;
  }

  /* ---------- mood & habits ---------- */
  async setMood(d, v) {
    if (!(v > 0) && !this.fileFor("day", d)) return;
    const f = await this.ensureNote("day", d);
    await this.app.fileManager.processFrontMatter(f, (fm) => { if (v > 0) fm[MOOD_KEY] = v; else delete fm[MOOD_KEY]; });
  }
  goalsPath() { return `${this.dir()}/Goals.md`; }
  async goals() {
    const f = this.app.vault.getAbstractFileByPath(this.goalsPath());
    const t = f instanceof TFile ? await this.app.vault.cachedRead(f) : "";
    const rows = t.split("\n").filter((l) => /^\s*\|/.test(l)).map((l) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim()));
    if (!rows.length) return (this.goalsCache = []);
    const head = rows[0].map((h) => h.toLowerCase());
    const ci = (name, d) => { const i = head.indexOf(name); return i === -1 ? d : i; };
    const cName = ci("goal", 0), cPer = ci("every", 1), cT = ci("target", 2), cU = ci("unit", 3), cK = ci("key", -1), cS = ci("status", -1);
    return (this.goalsCache = rows.slice(1).filter((r) => r[cName] && !/^:?-+:?$/.test(r[cName])).map((r) => ({
      name: r[cName], key: (cK >= 0 && r[cK]) || r[cName], period: (r[cPer] || "weekly").toLowerCase(),
      target: Math.max(1, parseFloat(r[cT]) || 1), unit: r[cU] || "days", active: cS >= 0 ? (r[cS] || "").toLowerCase() !== "off" : true,
    })));
  }
  habits() { return (this.goalsCache || []).filter((g) => g.active); }
  assignKey(label, used) {
    const RESERVED = [MOOD_KEY, "rating", "type", "week", "month", "year", "start", "end", "date", "tags", "aliases", "cssclasses"];
    const base = String(label || "").replace(/[\p{Extended_Pictographic}️‍]/gu, "").replace(/[|:#\[\]{}"'`,·]/g, "").trim() || "habit";
    const slug = /^[\x20-\x7E]+$/.test(base) ? base.toLowerCase().replace(/\s+/g, "-") : base;
    let key = slug, n = 2;
    while (used.has(key) || RESERVED.includes(key)) key = `${slug}-${n++}`;
    used.add(key);
    return key;
  }
  async saveGoals(list) {
    const used = new Set(list.map((g) => g.key).filter(Boolean));
    for (const g of list) if (!g.key) g.key = this.assignKey(g.name, used);
    const c = (s) => String(s == null ? "" : s).replace(/[|\n]/g, " ").trim();
    const body = `---\ntype: planfold-habits\n---\n# Habits\n\nEdit these in Settings → Planfold → Habits, or right here. Check-ins are saved as properties in each daily note (property name = Key).\n\n| Goal | Every | Target | Unit | Key | Status |\n| --- | --- | --- | --- | --- | --- |\n` +
      list.map((g) => `| ${c(g.name)} | ${g.period || "weekly"} | ${Math.max(1, parseFloat(g.target) || 1)} | ${c(g.unit) || "days"} | ${c(g.key)} | ${g.active === false ? "off" : "on"} |`).join("\n") + "\n";
    const f = this.app.vault.getAbstractFileByPath(this.goalsPath());
    if (f instanceof TFile) await this.app.vault.process(f, () => body);
    else { await this.ensureFolder(this.dir()); await this.app.vault.create(this.goalsPath(), body); }
    this.goalsCache = list;
  }
  habitDone(fm, g) { return (parseFloat(fm[g.key]) || 0) > 0; }
  async setHabit(d, g, on) {
    if (!on && !this.fileFor("day", d)) return;
    const f = await this.ensureNote("day", d);
    const v = /^(days?|天|times?|次)$/i.test(g.unit || "days") ? 1 : g.target;
    await this.app.fileManager.processFrontMatter(f, (fm) => { if (on) fm[g.key] = v; else delete fm[g.key]; });
  }

  /* ---------- one day, summarised (cached by file + mtime) ---------- */
  async dayInfo(d) {
    const file = this.fileFor("day", d);
    if (!file) return { d: moment(d), exists: false, logged: false, mood: 0, habits: {}, first: "", fields: {}, todo: 0 };
    const hit = this.dayCache.get(file.path);
    if (hit && hit.mtime === file.stat.mtime) return hit.info;
    const note = await this.readNote("day", d);
    const fm = note.fm, habits = {};
    for (const g of this.goalsCache || []) habits[g.key] = this.habitDone(fm, g);
    const mood = parseInt(fm[MOOD_KEY]) || 0;
    const firstField = (this.settings.templates.day || [])[0];
    let first = firstField ? firstLine(plain(note.fields[firstField.id])) : "";
    if (!first) first = firstLine(plain(Object.values(note.fields).find((v) => String(v || "").trim()) || ""));
    const anyField = Object.values(note.fields).some((v) => String(v || "").trim());
    const info = { d: moment(d), exists: true, file, mood: mood >= 1 && mood <= 5 ? mood : 0, habits, first, fields: note.fields, todo: note.items.length, todoDone: note.items.filter((i) => i.done).length, starred: note.items.some((i) => i.star) };
    const anyText = note.parsed.ls.slice(bodyStart(note.parsed.ls)).some((l) => l.trim() && !/^#{1,6}\s|^```/.test(l.trim()));
    info.logged = !!(info.mood || Object.values(habits).some(Boolean) || note.items.length || anyField || anyText);
    this.dayCache.set(file.path, { mtime: file.stat.mtime, info });
    return info;
  }
  async rangeInfo(s, e) {
    const out = [];
    for (let d = moment(s); !d.isAfter(e, "day"); d.add(1, "day")) out.push(await this.dayInfo(d.clone()));
    return out;
  }

  /* ---------- Home data ---------- */
  ignored(path) { return (this.settings.ignoreFolders || []).some((f) => f && (path === clean(f) || path.startsWith(clean(f) + "/"))); }
  rememberFile(file, opened) {
    if (!(file instanceof TFile) || file.extension !== "md" || this.ignored(file.path)) return;
    const S = this.settings, now = Date.now(), key = moment().format(DKEY);
    if (opened) {
      S.homeRecentPaths = [file.path, ...(S.homeRecentPaths || []).filter((p) => p !== file.path)].slice(0, 40);
      S.homeRecentTimes[file.path] = now;
    }
    const act = S.homeActivity;
    if (!(act[key] || []).includes(file.path)) act[key] = [file.path, ...(act[key] || [])].slice(0, 40);
    S.homeActivityTimes[key] = S.homeActivityTimes[key] || {};
    S.homeActivityTimes[key][file.path] = now;
    if (!this._pruned) {
      this._pruned = true;
      const cutoff = moment().subtract(400, "days");
      for (const d of Object.keys(act)) if (moment(d, DKEY, true).isBefore(cutoff, "day")) { delete act[d]; delete S.homeActivityTimes[d]; }
    }
    this.queueSave();
  }
  onRename(file, oldPath) {
    const S = this.settings, isFolder = !(file instanceof TFile);
    const map = (p) => (p === oldPath ? file.path : isFolder && p.startsWith(oldPath + "/") ? file.path + p.slice(oldPath.length) : p);
    S.homePinnedPaths = S.homePinnedPaths.map(map);
    S.homeProjects = S.homeProjects.map(map);
    S.homeRecentPaths = S.homeRecentPaths.map(map);
    S.oldNoteSkip = S.oldNoteSkip.map(map);
    const remapObj = (o) => { const n = {}; for (const k of Object.keys(o)) n[map(k)] = o[k]; return n; };
    S.homeRecentTimes = remapObj(S.homeRecentTimes);
    for (const d of Object.keys(S.homeActivity)) S.homeActivity[d] = S.homeActivity[d].map(map);
    for (const d of Object.keys(S.homeActivityTimes)) S.homeActivityTimes[d] = remapObj(S.homeActivityTimes[d]);
    this.dayCache.delete(oldPath);
    this.saveSettings();
    this.changed(file instanceof TFile ? file : { path: file.path });
    this.views().forEach((v) => v.softRefresh());
    if (this.refreshExplorer) this.refreshExplorer(); // defined in 09-explorer.js
  }
  onDelete(file) {
    const S = this.settings, gone = (p) => p === file.path || p.startsWith(file.path + "/");
    S.homePinnedPaths = S.homePinnedPaths.filter((p) => !gone(p));
    S.homeRecentPaths = S.homeRecentPaths.filter((p) => !gone(p));
    // projects stay, so the card can say "Folder missing"
    this.dayCache.delete(file.path);
    this.saveSettings();
    this.views().forEach((v) => v.softRefresh());
    if (this.refreshExplorer) this.refreshExplorer(); // defined in 09-explorer.js
  }
  fileAt(path) { const f = path && this.app.vault.getAbstractFileByPath(path); return f instanceof TFile ? f : null; }
  recentFiles(limit = 5) {
    const seen = new Set(), out = [];
    const add = (f) => { if (f && !seen.has(f.path) && !this.ignored(f.path) && !(this.settings.homePinnedPaths || []).includes(f.path)) { seen.add(f.path); out.push(f); } };
    for (const p of this.settings.homeRecentPaths) add(this.fileAt(p));
    if (out.length < limit) this.app.vault.getMarkdownFiles().slice().sort((a, b) => b.stat.mtime - a.stat.mtime).slice(0, 50).forEach(add);
    return out.slice(0, limit);
  }
  pinnedFiles() { return this.settings.homePinnedPaths.map((p) => this.fileAt(p)).filter(Boolean); }
  async togglePin(file) {
    const l = this.settings.homePinnedPaths;
    this.settings.homePinnedPaths = l.includes(file.path) ? l.filter((p) => p !== file.path) : [...l, file.path];
    await this.saveSettings();
    if (this.refreshExplorer) this.refreshExplorer(); // defined in 09-explorer.js
    this.views().forEach((v) => v.softRefresh(true));
  }
  activityFiles(day) {
    const key = moment(day).format(DKEY), paths = [...(this.settings.homeActivity[key] || [])];
    for (const f of this.app.vault.getMarkdownFiles()) if (moment(f.stat.mtime).format(DKEY) === key && !paths.includes(f.path) && !this.ignored(f.path)) paths.push(f.path);
    return paths.map((p) => this.fileAt(p)).filter(Boolean).sort((a, b) => b.stat.mtime - a.stat.mtime);
  }
  async excerpt(file) {
    try {
      const lines = (await this.app.vault.cachedRead(file)).replace(/^---\n[\s\S]*?\n---\n?/, "").split("\n");
      for (const raw of lines) {
        const line = raw.trim();
        if (!line || /^(#{1,6}\s|```|[-*]\s+\[[ xX]\]|\||!\[)/.test(line)) continue;
        return plain(line).replace(/[>#]/g, "").trim().slice(0, 150);
      }
    } catch (e) {}
    return "";
  }
  rebuildActivity() {
    const S = this.settings;
    S.homeActivity = {}; S.homeActivityTimes = {};
    for (const f of this.app.vault.getMarkdownFiles()) {
      if (this.ignored(f.path)) continue;
      const k = moment(f.stat.mtime).format(DKEY);
      (S.homeActivity[k] = S.homeActivity[k] || []).push(f.path);
      (S.homeActivityTimes[k] = S.homeActivityTimes[k] || {})[f.path] = f.stat.mtime;
    }
    S.homeRecentPaths = S.homeRecentPaths.filter((p) => this.fileAt(p));
    return this.saveSettings();
  }
  /** Daily notes that already exist in the Obsidian daily-notes folder (for onboarding) */
  existingDaily() {
    const dn = this.app.internalPlugins && this.app.internalPlugins.getPluginById && this.app.internalPlugins.getPluginById("daily-notes");
    const o = (dn && dn.instance && dn.instance.options) || {};
    const folder = clean(o.folder), format = o.format || DKEY;
    let n = 0;
    for (const f of this.app.vault.getMarkdownFiles()) {
      const rel = folder ? (f.path.startsWith(folder + "/") ? f.path.slice(folder.length + 1) : null) : f.path;
      if (rel == null) continue;
      if (moment(rel.replace(/\.md$/, ""), format, true).isValid()) n++;
    }
    return { folder, format, count: n, enabled: !!(dn && dn.enabled) };
  }

  /* ---------- legacy recap block ---------- */
  renderRecapBlock(el, ctx) {
    const f = this.app.vault.getAbstractFileByPath(ctx.sourcePath);
    const box = el.createDiv("planfold-recap");
    if (!(f instanceof TFile)) return;
    const fm = this.fm(f), mood = parseInt(fm[MOOD_KEY]) || 0;
    const row = box.createDiv("planfold-recap-row");
    row.createSpan({ cls: "planfold-label", text: L("Mood", "心情") });
    const dots = row.createDiv("planfold-dots is-small");
    for (let i = 1; i <= 5; i++) dots.createSpan({ cls: `planfold-dot m${i}` + (mood === i ? " is-on" : "") });
    const done = (this.goalsCache || []).filter((g) => this.habitDone(fm, g));
    if (done.length) box.createDiv({ cls: "planfold-muted", text: done.map((g) => g.name).join(" · ") });
    box.createDiv({ cls: "planfold-muted", text: L("Edit in Planfold → Note", "在 Planfold → 记录 里编辑") });
  }
}

/* =====================================================================
   The Planfold view: one leaf, three tabs
   ===================================================================== */
const TAB_LABEL = () => ({ home: L("Home", "主页"), planner: L("Note", "记录"), review: L("Review", "回顾") });
const dateFmt = {
  long: (m) => (LANG === "zh" ? moment(m).format("M月D日 ") + "星期" + "日一二三四五六"[moment(m).day()] : moment(m).format("dddd, MMMM D")),
  short: (m) => (LANG === "zh" ? moment(m).format("M月D日") : moment(m).format("MMM D")),
  month: (m) => (LANG === "zh" ? moment(m).format("YYYY年M月") : moment(m).format("MMMM YYYY")),
  monthName: (m) => (LANG === "zh" ? moment(m).format("M月") : moment(m).format("MMMM")),
  monthShort: (i) => (LANG === "zh" ? `${i + 1}月` : moment().month(i).format("MMM")),
  weekday: (m) => (LANG === "zh" ? "周" + "日一二三四五六"[moment(m).day()] : moment(m).format("ddd")),
  rel: (t) => {
    const m = moment(t), now = moment();
    if (m.isSame(now, "day")) return m.format(LANG === "zh" || use24() ? "HH:mm" : "h:mm A");
    if (m.isSame(now.clone().subtract(1, "day"), "day")) return L("Yesterday", "昨天");
    return m.isSame(now, "year") ? dateFmt.short(m) : m.format("YYYY-MM-DD");
  },
};

function h(parent, tag, cls, text) {
  const el = parent.createEl(tag);
  if (cls) el.className = cls;
  if (text != null) el.setText(String(text));
  return el;
}
function icon(parent, name, cls) { const s = h(parent, "span", "planfold-icon" + (cls ? " " + cls : "")); try { setIcon(s, name); } catch (e) {} return s; }
function button(parent, text, cls, onClick) { const b = h(parent, "button", "planfold-btn" + (cls ? " " + cls : ""), text); b.type = "button"; if (onClick) b.addEventListener("click", onClick); return b; }
function openButton(parent, label, onClick, iconOnly) {
  const b = h(parent, "button", "planfold-btn planfold-link planfold-open-action" + (iconOnly ? " is-icon-only" : ""));
  b.type = "button";
  b.title = label;
  b.setAttr("aria-label", label);
  if (!iconOnly) h(b, "span", "", label);
  icon(b, "arrow-up-right");
  if (onClick) b.addEventListener("click", onClick);
  return b;
}
function section(parent, label, right) {
  const wrap = h(parent, "section", "planfold-section");
  const head = h(wrap, "div", "planfold-section-head");
  h(head, "h3", "planfold-label", label);
  const r = h(head, "div", "planfold-section-right");
  if (right) right(r);
  return { wrap, head, right: r };
}
function moodDots(parent, value, onPick, size) {
  const box = h(parent, "div", "planfold-dots" + (size ? " is-" + size : ""));
  for (let i = 1; i <= 5; i++) {
    const b = h(box, "span", `planfold-dot m${i}` + (value === i ? " is-on" : ""));
    b.setAttr("role", "button"); b.tabIndex = 0;
    b.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); b.click(); } });
    b.setAttr("aria-label", L(`Mood ${i} of 5`, `心情 ${i} / 5`));
    if (onPick) b.addEventListener("click", () => onPick(value === i ? 0 : i));
  }
  return box;
}
/** Text that turns into an input on click. Enter saves, Esc cancels, empty deletes. */
/* shown in an empty to-do field: a time + space at the start puts it on the calendar */
const TIME_EXAMPLE = () => L("08:00-09:00 Writing", "08:00-09:00 写作");
function inlineEdit(el, value, onSave, hint) {
  el.tabIndex = 0; el.setAttr("role", "button"); // no aria-label: Obsidian turns it into a hover tooltip ("Edit …"); the visible text already names it
  const begin = (e) => {
    if (el.querySelector("input, textarea")) return;
    e.stopPropagation();
    const old = [...el.childNodes]; // restored as they were (the line may hold more than text, e.g. its time)
    el.empty(); el.addClass("is-inline-editing");
    // A to-do can be several lines on a phone. A single-line input horizontally
    // scrolls its beginning out of sight, so editing uses the same wrapping text
    // surface as the rest of Planfold's writing fields.
    const inp = h(el, "textarea", "planfold-inline-input");
    inp.rows = 1;
    inp.value = value;
    inp.placeholder = TIME_EXAMPLE();
    if (hint) h(el, "div", "planfold-inline-hint", hint);
    const fit = () => {
      inp.style.setProperty("height", "0px", "important");
      inp.style.setProperty("height", inp.scrollHeight + "px", "important");
      inp.scrollLeft = 0;
    };
    inp.addEventListener("input", fit);
    inp.focus();
    requestAnimationFrame(() => {
      fit();
      // On touch, reveal the beginning first; the user can then place the caret
      // precisely without the browser opening the editor at its hidden end.
      if (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) {
        inp.setSelectionRange(0, 0);
        inp.scrollTop = 0;
      } else inp.select();
    });
    let done = false;
    const finish = async (save) => {
      if (done) return; done = true;
      el.removeClass("is-inline-editing");
      if (save && inp.value.trim() !== value) await onSave(inp.value.trim());
      else { el.empty(); el.append(...old); }
    };
    inp.addEventListener("keydown", (ev) => { if (ev.key === "Enter" && !ev.isComposing) { ev.preventDefault(); finish(true); } if (ev.key === "Escape") { ev.preventDefault(); finish(false); } });
    inp.addEventListener("blur", () => setTimeout(() => finish(true), 180));
  };
  el.addEventListener("click", begin);
  el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); begin(e); } });
}
function addInput(parent, placeholder, onAdd, focusPlaceholder) {
  const row = h(parent, "div", "planfold-todo planfold-add");
  h(row, "span", "planfold-check is-ghost");
  const inp = h(row, "input", "planfold-add-input");
  inp.placeholder = placeholder;
  // while focused, the empty field shows how to write a time
  if (focusPlaceholder) {
    inp.addEventListener("focus", () => { inp.placeholder = focusPlaceholder; });
    inp.addEventListener("blur", () => { inp.placeholder = placeholder; });
  }
  inp.addEventListener("keydown", async (e) => {
    if (e.key === "Enter" && !e.isComposing && inp.value.trim()) { const v = inp.value.trim(); inp.value = ""; await onAdd(v); }
    if (e.key === "Escape") inp.blur();
  });
  return inp;
}
function autosize(ta) {
  if (window.CSS && CSS.supports && CSS.supports("field-sizing", "content")) return () => {};
  const f = () => { ta.style.height = "0px"; ta.style.height = ta.scrollHeight + "px"; };
  ta.addEventListener("input", f); requestAnimationFrame(f); setTimeout(f, 50); return f;
}

// Page and panel surfaces, measured from the theme as rendered.
// Themes disagree on which of --background-primary / --background-secondary is darker (Obsidian's default dark makes
// secondary the lighter one; Minimal makes it the darker one), so Planfold picks by luminance: page = darker, panel = lighter.
// If the two are too close to tell apart (contrast < 1.15) the view is "flat": light themes then get a soft shadow,
// dark themes a slightly lighter panel (shadows don't show on dark).
function themeSurfaces(root) {
  const out = { flat: true, bg: null, panel: null };
  try {
    const probe = (v) => { const d = root.createDiv(); d.style.cssText = `position:absolute;width:1px;height:1px;background:var(${v})`; const c = getComputedStyle(d).backgroundColor; d.remove(); return c; };
    const rgb = (c) => (c.match(/[\d.]+/g) || []).map(Number);
    const lum = ([r, g, bl]) => [r, g, bl].map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }).reduce((s, x, i) => s + x * [0.2126, 0.7152, 0.0722][i], 0);
    const cs = ["--background-secondary", "--background-primary"].map((v) => ({ v, c: probe(v) }));
    if (cs.some((x) => { const a = rgb(x.c); return a.length < 3 || (a[3] !== undefined && a[3] < 1); })) return out;
    cs.forEach((x) => { x.l = lum(rgb(x.c)); });
    const [lo, hi] = cs[0].l <= cs[1].l ? cs : [cs[1], cs[0]];
    out.flat = (hi.l + 0.05) / (lo.l + 0.05) < 1.15;
    const dark = document.body.classList.contains("theme-dark") || hi.l < 0.2;
    out.bg = `var(${lo.v})`;
    out.panel = dark && out.flat ? `color-mix(in srgb, var(${hi.v}) 94%, white)` : `var(${hi.v})`;
  } catch (e) {}
  return out;
}

class PlanfoldView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.tab = plugin.settings.startTab || (plugin.settings.tabOrder || ["home"])[0];
    this.pl = { scope: "day", anchor: moment() };
    this.rv = { scope: "month", anchor: moment(), selected: null, shelf: 0 };
    this.home = { calMode: "week", calAnchor: moment(), selected: moment(), query: "", showAllPinned: false, customizing: false };
    this.dirty = false;
  }
  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return "Planfold"; }
  getIcon() { return "layout-dashboard"; }
  async onOpen() {
    this.root = this.contentEl;
    this.root.empty();
    this.root.addClass("planfold-root");
    this.ro = new ResizeObserver(() => this.measure());
    this.ro.observe(this.root);
    this.measure();
    this.registerInterval(window.setInterval(() => this.tick(), 1000 * 15));
    this.root.addEventListener("focusout", () => setTimeout(() => { if (this.dirty && !this.editing()) this.render(); }, 250));
    await this.render();
  }
  async onClose() { if (this.ro) this.ro.disconnect(); await this.flush(); }
  /** Save any section still being edited (before redrawing or closing) */
  async flush() {
    const ws = [...(this._flush || [])];
    if (this._flush) this._flush.clear();
    await Promise.all(ws.map((w) => w()));
  }
  measure() {
    const w = this.root.clientWidth || 1200;
    const band = w < 700 ? "narrow" : w < 1000 ? "medium" : "wide";
    if (this.root.dataset.w !== band) {
      this.root.dataset.w = band;
      if (this.tab === "review" && this.rv.scope === "year" && this._built) this.render();
    }
  }
  editing() { const a = document.activeElement; return !!(a && this.root.contains(a) && /^(INPUT|TEXTAREA)$/.test(a.tagName)); }
  softRefresh(force) {
    if (!this._built) return;
    if (this.editing() && !force) { this.dirty = true; return; }
    if (!force && !this.containerEl.isShown()) { this.dirty = true; return; }
    this.render();
  }
  tick() {
    const c = this.root.querySelector(".planfold-clock");
    if (c) this.paintClock(c);
    // past midnight: Home (and "today" everywhere) must move to the new day, or to-dos land in yesterday's note
    // (checked again every 15 s, so a hidden or busy view catches up as soon as it's free)
    if (this._day && this._day !== moment().format(DKEY) && !this.editing() && this.containerEl.isShown()) {
      const was = moment(this._day, DKEY);
      if (moment(this.home.selected).isSame(was, "day")) { this.home.selected = moment(); this.home.calAnchor = moment(); }
      this.render();
    }
  }
  go(tab, opts = {}) {
    this.tab = tab;
    if (tab === "planner") { if (opts.scope) this.pl.scope = opts.scope; if (opts.anchor) this.pl.anchor = moment(opts.anchor); }
    if (tab === "review") { if (opts.scope) this.rv.scope = opts.scope; if (opts.anchor) this.rv.anchor = moment(opts.anchor); }
    this.render();
  }
  async render() {
    const p = this.plugin;
    await this.flush();
    this.dirty = false;
    this._day = moment().format(DKEY);
    TIME24 = p.settings.timeFormat === "24" ? true : p.settings.timeFormat === "12" ? false : null;
    await p.goals();
    // two renders can overlap (a save, then the file-change event): the second must not read the half-built page's scroll (0)
    const scroll = this._rendering ? this._scrollKeep : this.body ? this.body.scrollTop : 0;
    this._scrollKeep = scroll; this._rendering = (this._rendering || 0) + 1;
    const root = this.root;
    root.empty();
    root.toggleClass("is-zh", LANG === "zh");
    root.toggleClass("planfold-palette-ff", p.settings.homePalette !== "theme"); // W4 sage palette on Home unless "follow my theme"
    root.toggleClass("is-home", this.tab === "home");
    this._assignTargets = []; // the plan refills this; elsewhere the handle menu only reorders
    root.toggleClass("is-plan", this.tab === "planner"); // the plan shares Home's look
    root.toggleClass("is-review", this.tab === "review"); // and so does the review
    // Page = the darker theme surface, panel = the lighter one; a measured contrast decides whether panels need extra help.
    const surf = themeSurfaces(root);
    root.toggleClass("is-flat", surf.flat);
    if (surf.bg) { root.style.setProperty("--t-bg", surf.bg); root.style.setProperty("--t-panel", surf.panel); }
    root.toggleClass("is-side", !!this.isSide && !this.isFull);
    root.toggleClass("is-weekview", !!this.isFull);
    if (this.isSide) {
      // the sidebar calendar: no tabs, just the calendar
      this.body = h(root, "div", "planfold-body");
      try { await this.homeCalendar(h(this.body, "div", "planfold-inner planfold-side"), { side: !this.isFull }); }
      catch (e) { console.error("Planfold calendar", e); }
      this._built = true; this.body.scrollTop = scroll; this._rendering--;
      return;
    }
    const nav = h(root, "nav", "planfold-tabs");
    for (const t of p.settings.tabOrder) {
      const b = h(nav, "button", "planfold-tab" + (t === this.tab ? " is-active" : ""), TAB_LABEL()[t]);
      b.type = "button";
      b.addEventListener("click", () => { if (this.tab !== t) { this.tab = t; this.render(); } });
    }
    const gear = h(nav, "button", "planfold-icon-btn planfold-tabs-gear");
    gear.type = "button";
    gear.title = L("Start page and tab order", "打开时的页面与标签顺序");
    gear.setAttr("aria-label", gear.title);
    try { setIcon(gear, "settings-2"); } catch (e) {}
    gear.addEventListener("click", (e) => this.tabMenu(e));
    this.body = h(root, "div", "planfold-body");
    const inner = h(this.body, "div", "planfold-inner planfold-" + this.tab);
    try {
      if (this.tab !== "home" && !p.license) this.renderLocked(inner);
      else if (this.tab === "home") await this.renderHome(inner);
      else if (this.tab === "planner") await this.renderPlanner(inner);
      else await this.renderReview(inner);
    } catch (e) {
      console.error("Planfold render", e);
      h(inner, "p", "planfold-error", L("Something went wrong drawing this page. Details are in the developer console.", "这个页面显示出错了，详细信息在开发者控制台。"));
    }
    this._built = true;
    this.body.scrollTop = scroll;
    this._rendering--;
  }
  // Small Planfold-styled menu under a button, right-aligned to it. items: [[label, fn], …]
  quickMenu(e, items) {
    const old = this.root.querySelector(".planfold-pop");
    if (old) { old.remove(); return; }
    const anchor = e.currentTarget || e.target;
    const pop = h(this.root, "div", "planfold-pop planfold-panel planfold-quick");
    pop.setAttr("role", "menu");
    const r = anchor.getBoundingClientRect(), rr = this.root.getBoundingClientRect();
    pop.style.right = `${Math.max(8, rr.right - r.right)}px`;
    pop.style.top = `${r.bottom - rr.top + 4}px`;
    const close = (restore) => { pop.remove(); document.removeEventListener("mousedown", outside, true); document.removeEventListener("keydown", keys, true); if (restore && anchor.focus) anchor.focus(); };
    const outside = (ev) => { if (!pop.contains(ev.target) && !anchor.contains(ev.target)) close(); };
    const keys = (ev) => {
      const items = [...pop.querySelectorAll('[role="menuitem"]')], i = items.indexOf(document.activeElement);
      if (ev.key === "Escape") { ev.preventDefault(); close(true); }
      else if (ev.key === "ArrowDown" || ev.key === "ArrowUp") { ev.preventDefault(); items[(i + (ev.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus(); }
      else if (ev.key === "Home" || ev.key === "End") { ev.preventDefault(); items[ev.key === "Home" ? 0 : items.length - 1]?.focus(); }
    };
    setTimeout(() => { document.addEventListener("mousedown", outside, true); document.addEventListener("keydown", keys, true); }, 0);
    items.forEach(([label, fn], i) => {
      const it = h(pop, "button", "planfold-pop-item", label); it.type = "button"; it.setAttr("role", "menuitem");
      it.addEventListener("click", () => { close(); fn(); });
      if (!i) setTimeout(() => it.focus(), 0);
    });
  }
  tabMenu(e) {
    const p = this.plugin, S = p.settings;
    const old = this.root.querySelector(".planfold-pop");
    if (old) { old.remove(); return; }
    const anchor = e.currentTarget || e.target;
    const pop = h(this.root, "div", "planfold-pop planfold-panel");
    const r = anchor && anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : { left: 0, bottom: 0 };
    const rr = this.root.getBoundingClientRect();
    pop.style.left = `${Math.max(8, r.left - rr.left - 8)}px`;
    pop.style.top = `${r.bottom - rr.top + 6}px`;
    h(pop, "div", "planfold-label planfold-pop-label", L("Start page & tab order", "启动页面与标签顺序"));
    h(pop, "div", "planfold-pop-help", L("Choose a start page. Use the arrows to reorder tabs.", "选择启动页面，并用箭头调整标签顺序。"));
    const close = (restore) => { pop.remove(); document.removeEventListener("mousedown", outside, true); document.removeEventListener("keydown", esc, true); if (restore && anchor.focus) anchor.focus(); };
    const outside = (ev) => { if (!pop.contains(ev.target) && ev.target !== anchor && !(anchor && anchor.contains(ev.target))) close(); };
    const esc = (ev) => { if (ev.key === "Escape") { ev.preventDefault(); close(true); } };
    setTimeout(() => { document.addEventListener("mousedown", outside, true); document.addEventListener("keydown", esc, true); }, 0);
    const list = h(pop, "div", "planfold-pop-order-list");
    const draw = () => {
      list.empty();
      S.tabOrder.forEach((t, i) => {
        const on = S.startTab === t;
        const it = h(list, "div", "planfold-pop-item planfold-pop-order" + (on ? " is-on" : ""));
        const pick = h(it, "button", "planfold-pop-pick");
        pick.type = "button"; pick.setAttr("aria-label", L(`Open on ${TAB_LABEL()[t]}`, `默认打开${TAB_LABEL()[t]}`));
        h(pick, "span", "planfold-pop-radio");
        h(pick, "span", "planfold-pop-name", TAB_LABEL()[t]);
        if (on) h(pick, "span", "planfold-pop-default", L("Default", "默认"));
        pick.addEventListener("click", async () => { S.startTab = t; await p.saveSettings(); draw(); });
        const moves = h(it, "span", "planfold-pop-moves");
        const up = h(moves, "button", "planfold-icon-btn"); up.type = "button"; up.disabled = i === 0; up.title = L("Move up", "上移"); up.setAttr("aria-label", up.title); try { setIcon(up, "chevron-up"); } catch (e) {}
        const down = h(moves, "button", "planfold-icon-btn"); down.type = "button"; down.disabled = i === S.tabOrder.length - 1; down.title = L("Move down", "下移"); down.setAttr("aria-label", down.title); try { setIcon(down, "chevron-down"); } catch (e) {}
        up.addEventListener("click", async () => { if (!i) return; S.tabOrder.splice(i - 1, 0, S.tabOrder.splice(i, 1)[0]); await p.saveSettings(); draw(); p.refreshAll(); });
        down.addEventListener("click", async () => { if (i === S.tabOrder.length - 1) return; S.tabOrder.splice(i + 1, 0, S.tabOrder.splice(i, 1)[0]); await p.saveSettings(); draw(); p.refreshAll(); });
      });
    };
    draw();
    h(pop, "div", "planfold-pop-sep");
    const st = h(pop, "button", "planfold-pop-item is-link", L("Planfold settings…", "Planfold 设置…"));
    st.type = "button";
    st.addEventListener("click", () => { close(); this.openSettings("home"); });
  }
  openSettings(tabId) {
    const s = this.app.setting;
    if (tabId) this.plugin.settingsPage = tabId;
    if (s && s.open) { s.open(); s.openTabById && s.openTabById(this.plugin.manifest.id); }
  }
  renderLocked(inner) {
    const box = h(inner, "div", "planfold-locked planfold-panel");
    h(box, "h2", "planfold-h2", L("Activate Planfold", "激活 Planfold"));
    h(box, "p", "planfold-muted", L("Home works without a key. Note and Review need the license key you received with your purchase.", "主页不需要授权码也能用。记录和回顾需要输入你购买后收到的授权码。"));
    const row = h(box, "div", "planfold-row");
    const inp = h(row, "input", "planfold-input");
    inp.placeholder = "PLANFOLD-…";
    button(row, L("Activate", "激活"), "is-primary", async () => {
      const lic = await verifyLicense(inp.value);
      if (!lic) { new Notice(L("This key doesn't look right. Copy the whole key, starting with PLANFOLD-.", "授权码不对。请完整复制，以 PLANFOLD- 开头。")); return; }
      this.plugin.settings.license = inp.value.replace(/\s+/g, ""); this.plugin.license = lic;
      await this.plugin.saveSettings(); new Notice(L("Planfold activated", "Planfold 已激活")); this.render();
    });
  }
}

/** The week calendar in Obsidian's sidebar (one day's hours + the week as dates). Opening a day or week goes to the main Planfold view. */
class PlanfoldCalendarView extends PlanfoldView {
  constructor(leaf, plugin) { super(leaf, plugin); this.isSide = true; }
  getViewType() { return CAL_VIEW_TYPE; }
  getDisplayText() { return L("Calendar", "日历"); }
  getIcon() { return "calendar-days"; }
  go(tab, opts) { return this.plugin.openView(tab, opts); }
}

/** The full week calendar, opened from the sidebar's expand button as a normal tab */
class PlanfoldWeekView extends PlanfoldCalendarView {
  constructor(leaf, plugin) { super(leaf, plugin); this.isFull = true; }
  getViewType() { return WEEK_VIEW_TYPE; }
  getDisplayText() { return L("Week calendar", "整周日历"); }
}

/* =====================================================================
   Home
   ===================================================================== */
/** W4 card labels: "TODAY 今天" in Chinese, "TODAY" in English */
const ffKick = (en, zh) => (LANG === "zh" ? zh : en); // one language per label (HIG: consistent wording)
const pad2 = (n) => String(n).padStart(2, "0");

Object.assign(PlanfoldView.prototype, {
  async renderHome(inner) {
    const p = this.plugin, S = p.settings, hidden = new Set(S.homeHidden || []);
    if (this.home.project) return this.renderProject(inner, this.home.project);
    const hr = moment().hour();
    const greet = hr < 5 ? L("Good evening", "晚上好") : hr < 12 ? L("Good morning", "早上好") : hr < 18 ? L("Good afternoon", "下午好") : L("Good evening", "晚上好");
    const layout = normalizeHomeLayout(S.homeLayout, S.homeHidden);
    S.homeLayout = layout;
    const editing = !!this.home.customizing;
    this.homeLayoutBar(inner, layout, editing);
    // Time and mood describe the page as a whole, so they are fixed context rather than a movable section.
    this.homeNowBar(inner);
    const grid = h(inner, "div", "planfold-home-grid" + (editing ? " is-customizing" : ""));
    if (editing) this.homeGridDrop(grid, layout);
    // Default composition: the to-do leads; habits and quick note form an independent stack beside it.
    const shown = layout.items.filter((x) => x.visible && HOME_WIDGETS[x.id]);
    if (!editing && shown.length === 3 && shown[0].id === "today" && shown[1].id === "habits" && shown[2].id === "capture" && shown[0].span === 8 && shown[1].span === 4 && shown[2].span === 4)
      grid.addClass("is-main-stack");
    for (const item of layout.items) {
      // a removed card is simply not on Home; "Add section" brings it back
      if (!item.visible || !HOME_WIDGETS[item.id]) continue;
      const wrap = h(grid, "div", "planfold-home-widget planfold-widget-" + item.id);
      wrap.dataset.widgetId = item.id;
      wrap.style.setProperty("--t-home-span", String(item.span)); wrap.dataset.span = String(item.span);
      if (HOME_WIDGETS[item.id].tall) wrap.addClass("is-tall");
      if (editing) this.homeWidgetControls(wrap, item, layout);
      const content = h(wrap, "div", "planfold-home-widget-content");
      if (item.id === "today") await this.homeToday(content);
      else if (item.id === "habits") await this.homeHabits(content);
      else if (item.id === "capture") await this.homeCapture(content, { light: true });
    }
  },

  homeLayoutBar(parent, layout, editing) {
    // not editing: the pencil sits at the right end of the tab row, so Home starts straight with the cards
    const tabs = this.root.querySelector(".planfold-tabs");
    const bar = !editing && tabs ? tabs : h(parent, "div", "planfold-home-layout-bar" + (editing ? " is-editing" : ""));
    if (editing) h(bar, "span", "planfold-home-layout-help", L("Drag a card to move it, drag its right edge to resize. Changes save automatically.", "拖动卡片换位置，拖右边缘改宽度。修改会自动保存。"));
    if (editing) {
      const off = layout.items.filter((x) => !x.visible && HOME_WIDGETS[x.id]);
      const add = button(bar, "", "planfold-home-layout-add");
      icon(add, "plus"); h(add, "span", "", L("Add section", "添加板块"));
      add.title = off.length ? L("Add a section to Home", "把板块加回主页") : L("Every section is already on Home", "所有板块都已在主页上");
      add.disabled = !off.length;
      add.addEventListener("click", (e) => this.quickMenu(e, off.map((item) => [HOME_WIDGETS[item.id].label(), async () => {
        // a returning card lands at the end, where it is easy to see and drag into place
        layout.items.splice(layout.items.indexOf(item), 1);
        layout.items.push(Object.assign(item, { visible: true }));
        await this.saveHomeLayout(layout);
      }])));
    }
    const edit = button(bar, "", "planfold-home-layout-edit");
    const editLabel = editing ? L("Finish customizing Home", "完成自定义主页") : L("Customize Home", "自定义主页");
    edit.setAttr("aria-label", editLabel); edit.title = editLabel;
    icon(edit, editing ? "check" : "pencil");
    if (editing) h(edit, "span", "", L("Done", "完成"));
    edit.addEventListener("click", () => { this.home.customizing = !editing; this.render(); });
    if (editing) {
      const reset = button(bar, L("Reset", "恢复默认"), "planfold-link planfold-home-layout-reset", async () => {
        this.plugin.settings.homeLayout = defaultHomeLayout();
        await this.plugin.saveSettings();
        new Notice(L("Home layout reset", "主页布局已恢复默认"));
        this.render();
      });
      reset.title = L("Restore the default Home layout", "恢复默认主页布局");
    }
  },

  homeWidgetControls(wrap, item, layout) {
    const def = HOME_WIDGETS[item.id];
    const tools = h(wrap, "div", "planfold-home-widget-tools");
    const move = button(tools, "", "planfold-icon-btn planfold-home-widget-move");
    const moveLabel = L(`Move ${def.label()}`, `移动${def.label()}`);
    move.setAttr("aria-label", moveLabel); move.title = moveLabel; icon(move, "grip-vertical");
    h(tools, "span", "planfold-home-widget-name", def.label());
    // keyboard / touch fallback for dragging; steps over removed cards
    move.addEventListener("click", (e) => {
      const shown = layout.items.filter((x) => x.visible), at = shown.indexOf(item), actions = [];
      const place = (target, after) => () => this.placeHomeWidget(layout, item, target, after);
      if (at > 0) actions.push([L("Move up", "上移"), place(shown[at - 1], false)], [L("Move to top", "移到最前"), place(shown[0], false)]);
      if (at < shown.length - 1) actions.push([L("Move down", "下移"), place(shown[at + 1], true)], [L("Move to bottom", "移到最后"), place(shown[shown.length - 1], true)]);
      if (actions.length) this.quickMenu(e, actions);
    });

    // the whole card is the drag surface while customizing (its content is inert, see styles)
    wrap.draggable = true;
    const clear = () => {
      const grid = wrap.parentElement; if (!grid) return;
      grid.removeClass("is-drop-end");
      grid.querySelectorAll(":scope > .is-drop-before, :scope > .is-drop-after").forEach((el) => el.removeClass("is-drop-before", "is-drop-after"));
    };
    // side-by-side cards split left/right; a full-row card splits top/bottom
    const after = (e) => { const r = wrap.getBoundingClientRect(), row = wrap.parentElement && r.width < wrap.parentElement.getBoundingClientRect().width * 0.9; return row ? e.clientX > r.left + r.width / 2 : e.clientY > r.top + r.height / 2; };
    wrap.addEventListener("dragstart", (e) => {
      if (this._homeResize) { e.preventDefault(); return; }
      this._homeWidgetDrag = item.id; wrap.addClass("is-dragging");
      try { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", item.id); } catch (err) {}
    });
    wrap.addEventListener("dragend", () => { this._homeWidgetDrag = null; wrap.removeClass("is-dragging"); clear(); });
    wrap.addEventListener("dragover", (e) => {
      if (!this._homeWidgetDrag || this._homeWidgetDrag === item.id) return;
      e.preventDefault(); e.stopPropagation(); clear();
      wrap.addClass(after(e) ? "is-drop-after" : "is-drop-before");
    });
    wrap.addEventListener("dragleave", (e) => { if (!wrap.contains(e.relatedTarget)) wrap.removeClass("is-drop-before", "is-drop-after"); });
    wrap.addEventListener("drop", (e) => {
      e.preventDefault(); e.stopPropagation();
      const moving = layout.items.find((x) => x.id === this._homeWidgetDrag);
      this._homeWidgetDrag = null; clear();
      if (moving && moving !== item) this.placeHomeWidget(layout, moving, item, after(e));
    });

    const size = button(tools, "", "planfold-home-widget-size");
    const sizeText = (span) => (span === 12 ? L("Full", "整行") : `${span}/12`);
    size.setText(sizeText(item.span));
    size.title = L("Change width", "调整宽度");
    size.addEventListener("click", async () => {
      const next = def.sizes.find((s) => s > item.span);
      item.span = next == null ? def.sizes[0] : next;
      await this.saveHomeLayout(layout);
    });
    const remove = button(tools, "", "planfold-icon-btn planfold-home-widget-remove");
    const removeLabel = L(`Remove ${def.label()} from Home`, `从主页移除${def.label()}`);
    remove.setAttr("aria-label", removeLabel); remove.title = removeLabel; icon(remove, "x");
    remove.addEventListener("click", async () => { item.visible = false; await this.saveHomeLayout(layout); });

    // drag the right edge: snaps to the 12-column grid, from the card's minimum to a full row
    const edge = h(wrap, "div", "planfold-home-widget-resize");
    edge.setAttr("aria-hidden", "true"); edge.title = L("Drag to resize", "拖动调整宽度");
    edge.addEventListener("pointerdown", (e) => {
      const grid = wrap.parentElement; if (!grid) return;
      e.preventDefault(); e.stopPropagation();
      this._homeResize = true; wrap.draggable = false; wrap.addClass("is-resizing");
      edge.setPointerCapture(e.pointerId);
      const gap = parseFloat(getComputedStyle(grid).columnGap) || 0, col = (grid.getBoundingClientRect().width + gap) / 12, left = wrap.getBoundingClientRect().left;
      let span = item.span;
      const onMove = (ev) => {
        const next = Math.max(def.min, Math.min(12, Math.round((ev.clientX - left + gap) / col)));
        if (next === span) return;
        span = next; wrap.style.setProperty("--t-home-span", String(span)); wrap.dataset.span = String(span); size.setText(sizeText(span));
      };
      const onUp = async () => {
        edge.removeEventListener("pointermove", onMove); edge.removeEventListener("pointerup", onUp); edge.removeEventListener("pointercancel", onUp);
        this._homeResize = false; wrap.draggable = true; wrap.removeClass("is-resizing");
        if (span !== item.span) { item.span = span; await this.saveHomeLayout(layout); }
      };
      edge.addEventListener("pointermove", onMove); edge.addEventListener("pointerup", onUp); edge.addEventListener("pointercancel", onUp);
    });
  },

  /** Dropping on empty space after the last card sends the dragged card to the end */
  homeGridDrop(grid, layout) {
    grid.addEventListener("dragover", (e) => {
      if (!this._homeWidgetDrag || e.target !== grid) return;
      e.preventDefault(); grid.addClass("is-drop-end");
    });
    grid.addEventListener("dragleave", (e) => { if (e.target === grid) grid.removeClass("is-drop-end"); });
    grid.addEventListener("drop", (e) => {
      if (e.target !== grid) return;
      e.preventDefault(); grid.removeClass("is-drop-end");
      const moving = layout.items.find((x) => x.id === this._homeWidgetDrag), shown = layout.items.filter((x) => x.visible);
      this._homeWidgetDrag = null;
      const last = shown[shown.length - 1];
      if (moving && last && moving !== last) this.placeHomeWidget(layout, moving, last, true);
    });
  },

  async placeHomeWidget(layout, moving, target, after) {
    layout.items.splice(layout.items.indexOf(moving), 1);
    layout.items.splice(layout.items.indexOf(target) + (after ? 1 : 0), 0, moving);
    await this.saveHomeLayout(layout);
  },

  async saveHomeLayout(layout) {
    this.plugin.settings.homeLayout = normalizeHomeLayout(layout);
    this.plugin.settings.homeLayoutVersion = HOME_LAYOUT_VERSION;
    await this.plugin.saveSettings();
    this.render();
  },

  homeFiles(parent, hidden) {
    const p = this.plugin, shell = h(parent, "div", "planfold-home-files");
    this.homeSearch(shell);
    const noPins = !p.pinnedFiles().length, noRecent = !p.recentFiles(1).length, noProjects = !(p.settings.homeProjects || []).length;
    if (noPins && noRecent && noProjects) { this.homeStart(shell); return; }
    const groups = h(shell, "div", "planfold-home-file-groups");
    if (!hidden.has("pinned") && !noPins) this.homePinned(groups);
    if (!hidden.has("recent") && !noRecent) this.homeRecent(groups);
    if (!hidden.has("projects")) this.homeProjects(groups);
  },

  /** First run: one card with the next steps, instead of three empty sections */
  homeStart(parent) {
    const p = this.plugin;
    const card = h(parent, "div", "planfold-panel planfold-start");
    h(card, "h2", "planfold-start-title", L("Your Home fills in as you use it", "主页会随着你的使用慢慢填满"));
    h(card, "p", "planfold-start-text", L("Notes you open appear under Recent. Two things make it yours sooner:", "打开过的笔记会出现在「最近」。做两件小事，它会更快变成你的："));
    const steps = h(card, "div", "planfold-start-steps");
    const step = (n, title, desc, action, label) => {
      const r = h(steps, "div", "planfold-start-step");
      h(r, "span", "planfold-start-num", n);
      const t = h(r, "div", "planfold-start-copy"); h(t, "strong", "", title); h(t, "span", "", desc);
      if (action) button(r, label, "", action);
    };
    step("1", L("Choose project folders", "选几个项目文件夹"), L("Any folder, any level. Nothing gets moved.", "任意层级都可以，不会移动文件。"), () => new ProjectsModal(this.app, p, () => this.render()).open(), L("Choose", "选择"));
    step("2", L("Pin the notes you return to", "置顶常回来的笔记"), L("Right-click any note → Pin to Planfold Home.", "在任意笔记上右键 →「置顶到 Planfold 主页」。"));
  },

  homeSearch(parent) {
    const wrap = h(parent, "div", "planfold-search planfold-mod-search");
    const inp = h(wrap, "input", "planfold-search-input");
    inp.placeholder = L("Search your vault…", "搜索你的笔记…");
    inp.value = this.home.query;
    const list = h(wrap, "div", "planfold-search-results");
    const run = () => {
      list.empty();
      const q = inp.value.trim().toLowerCase();
      this.home.query = inp.value;
      if (!q) return;
      const hits = this.app.vault.getMarkdownFiles().filter((f) => !this.plugin.ignored(f.path) && f.path.toLowerCase().includes(q))
        .sort((a, b) => (a.basename.toLowerCase().includes(q) ? 0 : 1) - (b.basename.toLowerCase().includes(q) ? 0 : 1) || b.stat.mtime - a.stat.mtime).slice(0, 8);
      if (!hits.length) { h(list, "div", "planfold-empty-line", L("No notes match.", "没有匹配的笔记。")); return; }
      for (const f of hits) {
        const r = h(list, "button", "planfold-search-hit");
        r.type = "button";
        h(r, "span", "planfold-row-title", f.basename);
        h(r, "span", "planfold-row-meta", parentOf(f.path));
        r.addEventListener("click", () => this.plugin.openFile(f));
      }
    };
    inp.addEventListener("input", run);
    inp.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { const first = list.querySelector(".planfold-search-hit"); if (first) first.click(); }
      if (e.key === "Escape") { inp.value = ""; run(); }
    });
    run();
  },

  fileRow(list, file, opts = {}) {
    const row = h(list, "div", "planfold-file-row");
    row.tabIndex = 0; row.setAttr("role", "button");
    const top = h(row, "div", "planfold-row-top");
    h(top, "span", "planfold-row-title", file.basename);
    h(top, "span", "planfold-row-time", dateFmt.rel(opts.time || file.stat.mtime));
    const ex = h(row, "div", "planfold-row-excerpt");
    this.plugin.excerpt(file).then((t) => { if (t) ex.setText(t); else ex.remove(); });
    const folder = parentOf(file.path);
    if (folder) h(row, "div", "planfold-row-meta", folder.split("/").join(" / "));
    row.addEventListener("click", () => this.plugin.openFile(file));
    row.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); this.plugin.openFile(file); } });
    row.addEventListener("contextmenu", (e) => {
      const menu = new obsidian.Menu();
      const on = this.plugin.settings.homePinnedPaths.includes(file.path);
      menu.addItem((i) => i.setTitle(on ? L("Unpin", "取消置顶") : L("Pin to Planfold Home", "置顶到主页")).setIcon("pin").onClick(() => this.plugin.togglePin(file)));
      menu.addItem((i) => i.setTitle(L("Open in new tab", "在新标签页打开")).setIcon("file-plus").onClick(() => this.plugin.openFile(file, true)));
      menu.showAtMouseEvent(e);
    });
    return row;
  },

  homePinned(parent) {
    const files = this.plugin.pinnedFiles();
    const s = section(parent, L("Pinned", "置顶"));
    s.wrap.addClass("planfold-mod-pinned");
    const list = h(s.wrap, "div", "planfold-panel planfold-list");
    if (!files.length) { h(list, "div", "planfold-empty", L("Right-click any note → Pin to Planfold Home. Pinned notes stay here.", "右键任意笔记 → 置顶到 Planfold 主页，置顶的笔记会一直留在这里。")); return; }
    const max = this.home.showAllPinned ? files.length : 6;
    files.slice(0, max).forEach((f) => this.fileRow(list, f));
    if (files.length > 6) {
      const more = button(list, this.home.showAllPinned ? L("Show less", "收起") : L(`Show all ${files.length}`, `显示全部 ${files.length} 篇`), "planfold-list-more");
      more.addEventListener("click", () => { this.home.showAllPinned = !this.home.showAllPinned; this.render(); });
    }
  },

  homeRecent(parent) {
    const S = this.plugin.settings;
    const files = this.plugin.recentFiles(5);
    const s = section(parent, L("Recent", "最近"));
    s.wrap.addClass("planfold-mod-recent");
    const list = h(s.wrap, "div", "planfold-panel planfold-list");
    if (!files.length) { h(list, "div", "planfold-empty", L("Notes you open will show up here.", "你打开过的笔记会出现在这里。")); return; }
    files.forEach((f) => this.fileRow(list, f, { time: S.homeRecentTimes[f.path] || f.stat.mtime }));
  },

  homeProjects(parent) {
    const p = this.plugin;
    const s = section(parent, L("Projects", "项目"), (r) => { const b = button(r, L("Manage", "管理"), "planfold-link"); b.addEventListener("click", () => new ProjectsModal(this.app, p, () => this.render()).open()); });
    s.wrap.addClass("planfold-mod-projects");
    const paths = p.settings.homeProjects;
    if (!paths.length) {
      const e = h(s.wrap, "div", "planfold-invite");
      h(e, "span", "", L("Keep your main folders one click away.", "把常用文件夹放在这里，一键打开。"));
      button(e, L("Choose folders", "选择文件夹"), "", () => new ProjectsModal(this.app, p, () => this.render()).open());
      return;
    }
    const grid = h(s.wrap, "div", "planfold-cards");
    for (const path of paths) {
      const folder = this.app.vault.getAbstractFileByPath(path);
      const card = h(grid, "div", "planfold-card");
      h(card, "div", "planfold-card-title", basenameOf(path) || L("Vault", "整个库"));
      const meta = h(card, "div", "planfold-card-meta");
      if (!(folder instanceof TFolder)) {
        h(meta, "span", "", L("Folder missing", "文件夹不见了"));
        button(meta, L("Remove", "移除"), "planfold-link", async () => { p.settings.homeProjects = paths.filter((x) => x !== path); await p.saveSettings(); this.render(); });
        card.addClass("is-missing");
        continue;
      }
      const parent2 = parentOf(path);
      h(meta, "span", "", parent2 ? L(`in ${basenameOf(parent2)}`, `在 ${basenameOf(parent2)}`) : "");
      const n = this.app.vault.getMarkdownFiles().filter((f) => f.path.startsWith(path + "/")).length;
      h(meta, "span", "", L(`${n} ${n === 1 ? "doc" : "docs"}`, `${n} 篇`));
      const openProject = () => { this.home.project = path; this.home.projQuery = ""; this.home.projSub = ""; this.home.projAll = false; this.body.scrollTop = 0; this.render(); };
      card.setAttr("role", "button"); card.tabIndex = 0;
      card.addEventListener("click", openProject);
      card.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openProject(); } });
    }
  },

  /** A project = one folder. Its notes, newest first, inside Planfold. */
  renderProject(inner, path) {
    const p = this.plugin, H = this.home;
    const folder = this.app.vault.getAbstractFileByPath(path);
    const back = button(inner, L("‹ Home", "‹ 主页"), "planfold-link planfold-back", () => { H.project = null; this.render(); });
    back.title = L("Back to Home", "回到主页");
    const head = h(inner, "div", "planfold-proj-head");
    const tl = h(head, "div", "");
    h(tl, "h1", "planfold-greeting planfold-proj-title", basenameOf(path) || L("Vault", "整个库"));
    if (!(folder instanceof TFolder)) { h(inner, "p", "planfold-muted", L("This folder was moved or deleted.", "这个文件夹被移动或删除了。")); return; }
    const all = this.app.vault.getMarkdownFiles().filter((f) => f.path.startsWith(path + "/")).sort((a, b) => b.stat.mtime - a.stat.mtime);
    h(tl, "div", "planfold-muted planfold-proj-meta", (parentOf(path) ? L(`in ${parentOf(path).split("/").join(" / ")} · `, `在 ${parentOf(path).split("/").join(" / ")} · `) : "") + L(`${all.length} ${all.length === 1 ? "note" : "notes"}`, `${all.length} 篇笔记`));
    const actions = h(head, "div", "planfold-row");
    button(actions, L("New note", "新建笔记"), "", async () => {
      const base = L("Untitled", "未命名");
      let name = base, n = 1;
      while (this.app.vault.getAbstractFileByPath(`${path}/${name}.md`)) name = `${base} ${n++}`;
      p.openFile(await this.app.vault.create(`${path}/${name}.md`, ""));
    });
    // filter
    const bar = h(inner, "div", "planfold-proj-bar");
    const inp = h(bar, "input", "planfold-search-input");
    inp.placeholder = L(`Search in ${basenameOf(path)}…`, `在 ${basenameOf(path)} 里搜索…`);
    inp.value = H.projQuery || "";
    const subs = folder.children.filter((x) => x instanceof TFolder && !x.name.startsWith(".")).sort((a, b) => a.name.localeCompare(b.name));
    if (subs.length) {
      const chips = h(inner, "div", "planfold-chips planfold-proj-chips");
      const chip = (label, val) => { const b = h(chips, "button", "planfold-chip" + ((H.projSub || "") === val ? " is-on" : ""), label); b.type = "button"; b.addEventListener("click", () => { H.projSub = val; H.projAll = false; this.render(); }); };
      chip(L("All", "全部"), "");
      chip(L("Top level", "根目录"), "/");
      subs.forEach((s) => chip(s.name, s.path));
    }
    const list = h(inner, "div", "planfold-panel planfold-list planfold-proj-list");
    const draw = () => {
      list.empty();
      const q = (inp.value || "").trim().toLowerCase();
      H.projQuery = inp.value;
      let files = all;
      if (H.projSub === "/") files = files.filter((f) => parentOf(f.path) === path);
      else if (H.projSub) files = files.filter((f) => f.path.startsWith(H.projSub + "/"));
      if (q) files = files.filter((f) => f.path.toLowerCase().includes(q));
      if (!files.length) { h(list, "div", "planfold-empty", q ? L("No notes match.", "没有匹配的笔记。") : L("No notes here yet.", "这里还没有笔记。")); return; }
      const max = H.projAll || q ? files.length : 30;
      files.slice(0, max).forEach((f) => {
        const row = this.fileRow(list, f);
        const meta = row.querySelector(".planfold-row-meta");
        const rel = parentOf(f.path).slice(path.length + 1);
        if (meta) { if (rel) meta.setText(rel.split("/").join(" / ")); else meta.remove(); }
      });
      if (files.length > max) button(list, L(`Show all ${files.length}`, `显示全部 ${files.length} 篇`), "planfold-list-more", () => { H.projAll = true; draw(); });
    };
    inp.addEventListener("input", draw);
    draw();
  },

  paintClock(el) {
    const now = moment();
    el.empty();
    h(el, "span", "planfold-clock-time", now.format(use24() ? "HH:mm" : "h:mm"));
    if (!use24()) h(el, "span", "planfold-clock-ampm", now.format("A"));
  },
  async homeMoment(parent, withHabits, greet) {
    // W4: two quiet cards side by side — now (date line, big time, greeting) and mood
    const p = this.plugin, now = moment();
    const row = h(parent, "div", "planfold-ff-card planfold-ff-now");
    const t = h(row, "div", "planfold-ff-time");
    const en = now.clone().locale("en");
    h(t, "div", "planfold-ff-kicker", en.format("ddd DD.MM.YYYY").toUpperCase());
    const big = h(t, "div", "planfold-ff-bigline");
    this.paintClock(h(big, "div", "planfold-clock"));
    if (!p.settings.askMood) return;
    const m = h(row, "div", "planfold-ff-mood");
    h(m, "div", "planfold-ff-kicker", ffKick("MOOD", "心情"));
    const mood = parseInt(p.fm(p.fileFor("day", now))[MOOD_KEY]) || 0;
    moodDots(m, mood, async (v) => { await p.setMood(moment(), v); setTimeout(() => this.render(), 150); }, "ff");
  },
  homeMood(card) {
    const p = this.plugin;
    const mood = parseInt(p.fm(p.fileFor("day", moment()))[MOOD_KEY]) || 0;
    const row = h(card, "div", "planfold-moment-q");
    h(row, "span", "", L("How's today?", "今天怎么样？"));
    moodDots(card, mood, async (v) => { await p.setMood(moment(), v); setTimeout(() => this.render(), 150); }, "large");
  },

  async homeToday(parent) {
    const p = this.plugin, today = moment();
    const note = await p.readNote("day", today);
    const items = note.items, done = items.filter((i) => i.done).length;
    // the label sits above the card, like every other heading on Home
    const sec = h(parent, "div", "planfold-ff-section");
    const head = h(sec, "div", "planfold-ff-head");
    h(head, "span", "planfold-ff-kicker", ffKick("TO-DO", "待办"));
    openButton(head, L("Open today", "打开今天"), () => this.go("planner", { scope: "day", anchor: moment() }), true);
    const card = h(sec, "div", "planfold-ff-card planfold-ff-todos planfold-mod-today is-primary");
    const panel = h(card, "div", "planfold-todos");
    // today's list and this week's list each get their own box, so reordering never mixes the two notes
    const dayList = h(panel, "div", "planfold-home-daylist");
    // what's left comes first; done things sink to the bottom (the note keeps its own order)
    const star = items.find((i) => i.star), rest = items.filter((i) => i !== star);
    rest.sort((x, y) => (x.done ? 1 : 0) - (y.done ? 1 : 0));
    if (star) this.todoRow(h(dayList, "div", "planfold-home-star"), note.path, star);
    rest.forEach((it) => this.todoRow(dayList, note.path, it));
    addInput(dayList, L("Add a to-do", "添加待办"), async (v) => { await p.addTodo("day", today, v); this.render(); }, TIME_EXAMPLE());
    // the week's backlog lives in the week view; Today only points there
    button(card, L("View week →", "查看本周 →"), "planfold-link planfold-view-week", () => this.go("planner", { scope: "week", anchor: moment() }));
  },

  /** This week's to-dos, under today's: the week note's list, so a task planned for "sometime this week" stays in view. */
  async homeWeekTodos(card, today) {
    const p = this.plugin, week = await p.readNote("week", today);
    const items = week.items, done = items.filter((i) => i.done).length;
    const head = h(card, "div", "planfold-ff-head planfold-ff-week-head");
    h(head, "span", "planfold-ff-kicker", ffKick("THIS WEEK", "本周") + (items.length ? ` · ${pad2(done)}/${pad2(items.length)}` : ""));
    openButton(head, L("Open this week", "打开本周"), () => this.go("planner", { scope: "week", anchor: moment() }), true);
    const list = h(card, "div", "planfold-todos planfold-home-weeklist");
    [...items.filter((i) => !i.done), ...items.filter((i) => i.done)].forEach((it) => this.todoRow(list, week.path, it));
    addInput(list, L("+ Add to this week", "+ 添加本周任务"), async (v) => { await p.addTodo("week", today, v); this.render(); });
  },

  /** Habits as a week table (W4): today's column is one continuous block you tick in; the other days stay quiet
      (a small filled square when done), and each row ends with a progress bar for the week. */
  /** One bar across the top of Home: the date and time on the left, how today feels on the right */
  homeNowBar(parent) {
    const p = this.plugin, now = moment();
    const bar = h(parent, "div", "planfold-ff-card planfold-nowbar");
    const t = h(bar, "div", "planfold-nowbar-time");
    this.paintClock(h(t, "div", "planfold-clock"));
    h(t, "span", "planfold-nowbar-date", LANG === "zh" ? `${now.format("M月D日")} ${dateFmt.weekday(now)}` : now.clone().locale("en").format("ddd, MMM D"));
    if (p.settings.askMood) {
      const m = h(bar, "div", "planfold-rail-mood planfold-nowbar-mood");
      h(m, "span", "planfold-ff-kicker", ffKick("MOOD", "心情"));
      const mood = parseInt(p.fm(p.fileFor("day", now))[MOOD_KEY]) || 0;
      moodDots(m, mood, async (v) => { await p.setMood(moment(), v); setTimeout(() => this.render(), 150); }, "ff");
    }
  },

  /** Home's right column — today's habits and a quick note (the date, time and mood are the bar on top).
      (The week of habits is a table in the plan's day view.) */
  async homeRail(parent) {
    const p = this.plugin, now = moment();
    const rail = h(parent, "div", "planfold-ff-card is-flat planfold-ff-rail");
    // (time and mood are the bar across the top of Home — see homeNowBar)
    // habits: one column, ticked straight from here; ↗ opens the week of habits
    const habits = p.habits(), g = h(rail, "div", "planfold-rail-group planfold-rail-habits-group");
    const fm = p.fm(p.fileFor("day", now)), done = habits.filter((x) => p.habitDone(fm, x)).length;
    const head = h(g, "div", "planfold-ff-head");
    h(head, "span", "planfold-ff-kicker", ffKick("HABITS", "习惯"));
    if (!habits.length) button(g, L("Add your first habit", "添加第一个习惯"), "planfold-link", () => this.openSettings("habits"));
    else {
      const list = h(g, "div", "planfold-rail-habits");
      for (const x of habits) {
        const on = p.habitDone(fm, x);
        const b = h(list, "button", "planfold-ff-habit" + (on ? " is-done" : "")); b.type = "button";
        b.setAttr("aria-pressed", on ? "true" : "false");
        h(b, "span", "planfold-check" + (on ? " is-on" : ""));
        h(b, "span", "planfold-ff-habit-name", x.name);
        b.addEventListener("click", async () => { await p.setHabit(now, x, !on); setTimeout(() => this.render(), 150); });
      }
    }
    await this.homeCapture(h(rail, "div", "planfold-rail-group planfold-rail-capture"), { light: true });
  },

  /** Habits are their own Home section. The pencil changes the habit definitions;
      checking a row still records today's completion. */
  async homeHabits(parent) {
    const p = this.plugin, now = moment(), habits = p.habits();
    const section = h(parent, "div", "planfold-ff-section planfold-home-habits-section");
    const head = h(section, "div", "planfold-ff-head");
    h(head, "span", "planfold-ff-kicker", ffKick("HABITS", "习惯"));
    const edit = button(head, "", "planfold-icon-btn planfold-habits-edit");
    const editLabel = L("Edit habits", "编辑习惯");
    edit.setAttr("aria-label", editLabel); edit.title = editLabel; icon(edit, "pencil");
    edit.addEventListener("click", () => this.openSettings("habits"));
    const card = h(section, "div", "planfold-ff-card planfold-rail-habits planfold-mod-habits");
    if (!habits.length) { button(card, L("Add your first habit", "添加第一个习惯"), "planfold-link", () => this.openSettings("habits")); return; }
    const fm = p.fm(p.fileFor("day", now));
    for (const habit of habits) {
      const on = p.habitDone(fm, habit);
      const row = h(card, "button", "planfold-ff-habit" + (on ? " is-done" : "")); row.type = "button";
      row.setAttr("aria-pressed", on ? "true" : "false");
      h(row, "span", "planfold-check" + (on ? " is-on" : ""));
      h(row, "span", "planfold-ff-habit-name", habit.name);
      row.addEventListener("click", async () => { await p.setHabit(now, habit, !on); setTimeout(() => this.render(), 150); });
    }
  },

  /** Today's habits as one light strip above the to-dos: tick today, see 4/7 at a glance. */
  async homeHabitStrip(parent) {
    const p = this.plugin, habits = p.habits(), now = moment();
    const strip = h(parent, "div", "planfold-ff-card is-flat planfold-habit-strip");
    const fm = p.fm(p.fileFor("day", now)), done = habits.filter((x) => p.habitDone(fm, x)).length;
    const head = h(strip, "button", "planfold-habit-strip-head"); head.type = "button";
    head.title = L("This week's habits", "本周习惯");
    h(head, "span", "planfold-ff-kicker", ffKick("HABITS", "习惯"));
    h(head, "span", "planfold-habit-strip-count" + (habits.length && done === habits.length ? " is-all" : ""), habits.length ? `${done}/${habits.length}` : "");
    head.addEventListener("click", () => this.go("planner", { scope: "day", anchor: moment() }));
    if (!habits.length) { button(strip, L("Add your first habit", "添加第一个习惯"), "planfold-link", () => this.openSettings("habits")); return; }
    const list = h(strip, "div", "planfold-habit-strip-list");
    for (const x of habits) {
      const on = p.habitDone(fm, x);
      const b = h(list, "button", "planfold-ff-habit" + (on ? " is-done" : "")); b.type = "button";
      b.setAttr("aria-pressed", on ? "true" : "false");
      h(b, "span", "planfold-check" + (on ? " is-on" : ""));
      h(b, "span", "planfold-ff-habit-name", x.name);
      b.title = x.name; // long names are cut to fit the grid
      b.addEventListener("click", async () => { await p.setHabit(now, x, !on); setTimeout(() => this.render(), 150); });
    }
  },

  /** Home: today's habits only, as the same checkboxes as the to-dos. The week table is in the plan's day view. */
  async homeHabitToday(parent) {
    const p = this.plugin, habits = p.habits(), today = moment();
    const card = h(parent, "div", "planfold-ff-card planfold-ff-habits-today planfold-mod-habits");
    const fm = p.fm(p.fileFor("day", today)), done = habits.filter((g) => p.habitDone(fm, g)).length;
    const head = h(card, "div", "planfold-ff-head");
    h(head, "span", "planfold-ff-kicker", ffKick("HABITS", "习惯") + (habits.length ? ` · ${pad2(done)}/${pad2(habits.length)}` : ""));
    openButton(head, L("This week's habits", "本周习惯"), () => this.go("planner", { scope: "day", anchor: moment() }), true);
    if (!habits.length) { button(card, L("Add your first habit", "添加第一个习惯"), "planfold-link", () => this.openSettings("habits")); return; }
    const row = h(card, "div", "planfold-ff-habit-row");
    for (const g of habits) {
      const on = p.habitDone(fm, g);
      const b = h(row, "button", "planfold-ff-habit" + (on ? " is-done" : "")); b.type = "button";
      b.setAttr("aria-pressed", on ? "true" : "false");
      h(b, "span", "planfold-check" + (on ? " is-on" : ""));
      h(b, "span", "planfold-ff-habit-name", g.name);
      b.addEventListener("click", async () => { await p.setHabit(today, g, !on); setTimeout(() => this.render(), 150); });
    }
  },

  /** The week of habits as a table (the plan's day view): tick any day up to today */
  async homeHabitWeek(parent, anchor, opts = {}) {
    const p = this.plugin, habits = p.habits(), today = moment();
    const sunday = p.settings.weekStart === "sunday";
    const start = rowStartOf(anchor || today, sunday), end = start.clone().add(6, "day");
    const week = await p.rangeInfo(start, end);
    const todayInfo = week.find((x) => x.d.isSame(today, "day"));
    const nDone = habits.filter((g) => todayInfo && todayInfo.habits[g.key]).length;
    const card = h(parent, "div", "planfold-ff-card planfold-ff-habits planfold-mod-habits" + (opts.bare ? " is-plan" : ""));
    if (!habits.length) {
      h(card, "div", "planfold-ff-kicker", ffKick("HABITS", "习惯"));
      h(card, "div", "planfold-empty", L("Add habits in Settings → Habits. They show up here as a week you can tick.", "在 设置 → 习惯 里添加习惯，它们会以一周的表格出现在这里。"));
      return;
    }
    const grid = h(card, "div", "planfold-hweek-grid");
    // days still to come are narrower: the eye lands on today and the days already lived
    grid.style.setProperty("--hw-days", week.map((x) => (x.d.isAfter(today, "day") ? "minmax(18px, .5fr)" : "minmax(28px, 1fr)")).join(" "));
    const last = habits.length - 1;
    h(grid, "div", "planfold-ff-kicker planfold-hweek-title", opts.bare ? "" : ffKick("HABITS", "习惯") + ` · ${pad2(nDone)}/${pad2(habits.length)}`);
    week.forEach((info) => {
      const d = info.d, isToday = d.isSame(today, "day");
      const w = dateFmt.weekday(d), wd = LANG === "zh" ? w.slice(1) : w.slice(0, 3);
      h(grid, "div", "planfold-hweek-dow" + (isToday ? " is-today" : "") + (d.isAfter(today, "day") ? " is-future" : ""), `${wd} ${d.date()}`);
    });
    h(grid, "div", "planfold-hweek-dow planfold-hweek-wk", L("Week", "本周"));
    habits.forEach((g, row) => {
      const doneT = !!(todayInfo && todayInfo.habits[g.key]);
      const alt = row % 2 === 0 ? " is-alt" : ""; // every other row sits on a soft band, so the eye can follow it across
      h(h(grid, "div", "planfold-hweek-name" + (doneT ? " is-done" : "") + alt), "span", "planfold-hweek-name-text", g.name);
      week.forEach((info) => {
        const d = info.d, on = !!info.habits[g.key], isToday = d.isSame(today, "day"), future = d.isAfter(today, "day");
        const cell = h(grid, "button", "planfold-hweek-cell" + (isToday ? " is-today" : "") + (future ? " is-future" : "") + (on ? " is-on" : "") + (isToday && row === last ? " is-last" : "") + alt);
        cell.type = "button";
        h(cell, "span", "planfold-hweek-box");
        cell.setAttr("aria-label", `${g.name} · ${dateFmt.short(d)}`); cell.setAttr("aria-pressed", on ? "true" : "false");
        if (future) { cell.disabled = true; return; }
        cell.addEventListener("click", async () => { await p.setHabit(d.clone(), g, !on); setTimeout(() => this.render(), 150); });
      });
      const count = week.filter((x) => x.habits[g.key]).length, target = Math.max(1, Math.min(7, parseInt(g.target) || 7));
      const bar = h(grid, "div", "planfold-hweek-progress" + alt);
      bar.setAttr("role", "img"); bar.setAttr("aria-label", L(`${count} of ${target} this week`, `本周 ${count}/${target}`));
      bar.title = L(`This week ${count}/${target}`, `本周 ${count}/${target}`);
      h(bar, "span", "planfold-hweek-count", `${count}/${target}`);
    });
  },

  /** Habits, light: one row of small toggles under the mood — how today goes, in one card.
      Each is a tiny square + name; done = filled square, name dims. This week's count lives in the tooltip. */
  async homeHabitChips(card) {
    const p = this.plugin, habits = p.habits(), today = moment();
    if (!habits.length) return;
    const fm = p.fm(p.fileFor("day", today));
    const ws = moment(today).startOf("isoWeek"), week = await p.rangeInfo(ws, ws.clone().add(6, "day"));
    const box = h(card, "div", "planfold-moment-habits");
    const done = habits.filter((g) => p.habitDone(fm, g)).length;
    const head = h(box, "div", "planfold-moment-q");
    h(head, "span", "", L("Habits", "习惯"));
    h(head, "span", "planfold-moment-count", `${done}/${habits.length}`);
    const row = h(box, "div", "planfold-habit-chips");
    for (const g of habits) {
      const on = p.habitDone(fm, g);
      const count = week.filter((x) => x.habits[g.key]).length, target = Math.max(1, Math.min(7, parseInt(g.target) || 7));
      const b = h(row, "button", "planfold-habit-chip" + (on ? " is-done" : "")); b.type = "button";
      b.setAttr("aria-pressed", on ? "true" : "false");
      b.title = L(`${g.name} · this week ${count}/${target}`, `${g.name} · 本周 ${count}/${target}`);
      h(b, "span", "planfold-chip-box" + (on ? " is-on" : ""));
      h(b, "span", "planfold-habit-chip-name", g.name);
      b.addEventListener("click", async () => { await p.setHabit(today, g, !on); setTimeout(() => this.render(), 150); });
    }
  },

  /** Quick note: a small writing area, like a field in the daily note. Enter makes a new line; the 记下 button
      (or ⌘/Ctrl+Enter) saves it, with the time, into today's note (Settings → Capture). The box empties and a line
      confirms where it went — what you wrote lives in the note, not here. */
  async homeCapture(parent, opts = {}) {
    const p = this.plugin;
    // same top-right ↗ as every other section: it opens today, where the note lands; no extra words
    // light (Home's right column): the label sits above the card, like every other section
    const head = opts.light ? h(parent, "div", "planfold-ff-head") : null;
    const panel = h(parent, "div", (opts.light ? "planfold-home-capture is-light" : "planfold-ff-card planfold-home-capture") + " planfold-mod-capture");
    const headEl = head || h(panel, "div", "planfold-ff-head");
    // named for what it is — not the daily note
    const label = h(headEl, "span", "planfold-ff-kicker", LANG === "zh" ? "随手记" : "QUICK NOTE"); label.id = "planfold-home-capture-title";
    openButton(headEl, L("Open today", "打开今天"), () => this.go("planner", { scope: "day", anchor: moment() }), true);
    const ta = h(panel, "textarea", "planfold-home-cap-input");
    ta.rows = opts.light ? 1 : 2; ta.id = "planfold-home-capture";
    ta.placeholder = L("Jot it down — saved to today's note", "随手记一句，会存进今天的日记");
    ta.setAttr("aria-labelledby", label.id);
    ta.value = this.home.capture || "";
    const foot = h(panel, "div", "planfold-home-cap-foot");
    const status = h(foot, "span", "planfold-home-cap-status"); status.setAttr("role", "status");
    // the save rewrites today's note, which redraws Home: keep the confirmation across that redraw
    const saved = this.home.capSaved;
    if (saved && Date.now() < saved.until) status.setText(saved.text);
    const mac = /Mac|iPhone|iPad/.test(navigator.platform || "");
    const btn = button(foot, L("Save", "记下") + (mac ? " ⌘↵" : ""), "planfold-home-cap-save");
    btn.title = mac ? "⌘ + Enter" : "Ctrl + Enter";
    let saving = false;
    const sync = () => { btn.disabled = saving || !ta.value.trim(); };
    sync();
    // Same rule as the Quick capture window: the text leaves the box only once it is safely in the note.
    const save = async () => {
      const v = ta.value.trim(); if (!v || saving) return;
      saving = true; sync();
      try { await p.appendQuickCapture(v); }
      catch (e) {
        console.error("Planfold: quick note failed", e);
        saving = false; sync();
        status.setText(L("Couldn't save. Your text is still here.", "没保存成功，内容还在。"));
        return;
      }
      saving = false;
      if (ta.value.trim() === v) { ta.value = ""; this.home.capture = ""; }
      sync();
      const t = moment().format(use24() || LANG === "zh" ? "HH:mm" : "h:mm A");
      const msg = L(`Saved to today's note · ${t}`, `已记到今天的日记 · ${t}`);
      this.home.capSaved = { text: msg, until: Date.now() + 4000 };
      status.setText(msg);
      clearTimeout(this._capT); this._capT = setTimeout(() => { const st = this.root.querySelector(".planfold-home-cap-status"); if (st) st.setText(""); }, 4000);
    };
    btn.addEventListener("click", save);

    ta.addEventListener("input", () => { this.home.capture = ta.value; sync(); if (status.textContent) { status.setText(""); this.home.capSaved = null; } });
    ta.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !e.isComposing) { e.preventDefault(); save(); }
      if (e.key === "Escape") ta.blur();
    });
    await this.homeCaptureRecent(panel);
  },

  /** The last few things noted today, newest first — so the note card shows today, not only an empty box. */
  async homeCaptureRecent(panel) {
    const p = this.plugin, field = p.quickCaptureField();
    const note = await p.readNote("day", moment());
    const text = String((note.fields || {})[field.id] || "");
    const entries = [];
    for (const line of text.split("\n")) {
      const m = /^\s*[-*]\s+(.*)$/.exec(line);
      if (m && !/^\s{2,}/.test(line)) entries.push(m[1]);
      else if (entries.length && /^\s{2,}\S/.test(line)) entries[entries.length - 1] += " " + line.trim();
    }
    if (!entries.length) return;
    const box = h(panel, "div", "planfold-ff-recent");
    // one phrase instead of "label · 01" (RUI p.42)
    h(box, "div", "planfold-ff-kicker", L(`${entries.length} noted today`, `今天记了 ${entries.length} 条`));
    for (const e of entries.slice(panel.classList.contains("is-light") ? -3 : -4).reverse()) {
      const row = h(box, "div", "planfold-ff-recent-row");
      const tm = /^(\d{1,2}:\d{2}(?:\s?[AP]M)?)\s+(.*)$/i.exec(e);
      h(row, "span", "planfold-ff-recent-time", tm ? tm[1] : "");
      h(row, "span", "planfold-ff-recent-text", tm ? tm[2] : e);
    }
  },

  todoRow(parent, path, it, opts = {}) {
    const p = this.plugin;
    const row = h(parent, "div", "planfold-todo" + (it.done ? " is-done" : "") + (it.star ? " is-star" : ""));
    row._planfoldItem = it;
    row.addEventListener("focusin", (e) => { if (e.target && e.target.matches && e.target.matches(".planfold-inline-input")) row.addClass("is-editing"); });
    row.addEventListener("focusout", () => setTimeout(() => { if (!row.querySelector(".planfold-inline-input")) row.removeClass("is-editing"); }, 220));
    // drag handle (shows on hover) — reorder within the same list
    const grip = h(row, "button", "planfold-grip"); grip.type = "button";
    grip.setAttr("aria-label", L("Reorder to-do", "调整待办顺序"));
    try { setIcon(grip, "grip-vertical"); } catch (e) {}
    grip.addEventListener("mousedown", () => { row.draggable = true; });
    const moveBy = async (dir) => {
      const rows = [...parent.querySelectorAll(".planfold-todo:not(.planfold-add)")];
      const i = rows.indexOf(row), target = rows[i + dir];
      if (!target || !target._planfoldItem) return;
      await p.moveTodo(path, it, target._planfoldItem, dir > 0);
      this.softRefresh(true);
    };
    grip.addEventListener("keydown", (e) => { if (e.key === "ArrowUp" || e.key === "ArrowDown") { e.preventDefault(); moveBy(e.key === "ArrowUp" ? -1 : 1); } });
    grip.addEventListener("click", (e) => {
      const rows = [...parent.querySelectorAll(".planfold-todo:not(.planfold-add)")], i = rows.indexOf(row), actions = [];
      if (i > 0) actions.push([L("Move up", "上移"), () => moveBy(-1)]);
      if (i >= 0 && i < rows.length - 1) actions.push([L("Move down", "下移"), () => moveBy(1)]);
      // the plan's week / month / year: hand a to-do to a day, week or month without dragging (keyboard, touch)
      for (const t of this._assignTargets || []) if (t.path !== path) actions.push([L(`Move to ${t.label}`, `移到 ${t.label}`), async () => { await p.rescheduleTodo(path, it, t.scope, moment(t.m), it.time || ""); this.softRefresh(true); }]);
      if (actions.length) this.quickMenu(e, actions);
    });
    row.addEventListener("dragstart", (e) => { this._drag = { path, it }; row.addClass("is-dragging"); try { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", it.full); } catch (err) {} });
    row.addEventListener("dragend", () => { row.draggable = false; row.removeClass("is-dragging"); this._drag = null; parent.querySelectorAll(".is-drop-before,.is-drop-after").forEach((x) => x.removeClass("is-drop-before", "is-drop-after")); });
    row.addEventListener("dragover", (e) => {
      const d = this._drag;
      if (!d || d.path !== path || d.it.line === it.line) return;
      e.preventDefault();
      const r = row.getBoundingClientRect(), after = e.clientY > r.top + r.height / 2;
      row.toggleClass("is-drop-before", !after); row.toggleClass("is-drop-after", after);
    });
    row.addEventListener("dragleave", () => { row.removeClass("is-drop-before"); row.removeClass("is-drop-after"); });
    row.addEventListener("drop", async (e) => {
      const d = this._drag;
      if (!d || d.path !== path) return;
      e.preventDefault();
      const after = row.hasClass ? row.hasClass("is-drop-after") : row.classList.contains("is-drop-after");
      this._drag = null;
      await p.moveTodo(path, d.it, it, after);
      this.softRefresh(true);
    });
    const box = h(row, "button", "planfold-check");
    box.type = "button";
    box.setAttr("aria-label", it.done ? L("Mark as not done", "标记为未完成") : L("Mark as done", "标记为完成"));
    box.addEventListener("click", async () => { await p.toggleTodo(path, it); this.softRefresh(true); });
    // one line, as written in the note: the time leads (as in the calendar); clicking anywhere edits the whole line
    const txt = h(row, "span", "planfold-todo-text");
    if (it.time) h(txt, "span", "planfold-todo-time", it.time + "\u2002"); // en space: struck through with the rest when done
    txt.append(it.text);
    inlineEdit(txt, it.plain || it.full, async (v) => { await p.editTodo(path, it, v); this.softRefresh(true); });
    // the most important one: a small star; hover shows an empty star to set it
    const star = h(row, "button", "planfold-star" + (it.star ? " is-on" : "")); star.type = "button";
    const starLabel = it.star ? L("Clear most important", "取消最重要的事") : L("Mark as the most important", "设为最重要的事");
    star.setAttr("aria-label", starLabel);
    try { setIcon(star, "star"); } catch (e) {}
    const flip = async () => { await p.setStar(path, it, !it.star); this.softRefresh(true); };
    star.addEventListener("click", flip);
    const del = h(row, "button", "planfold-del"); del.type = "button";
    del.setAttr("aria-label", L("Delete", "删除")); del.title = L("Delete", "删除");
    try { setIcon(del, "x"); } catch (e) {}
    const remove = async () => { await p.editTodo(path, it, ""); this.softRefresh(true); };
    del.addEventListener("click", remove);
    row.addEventListener("contextmenu", (e) => {
      const menu = new obsidian.Menu();
      menu.addItem((i) => i.setTitle(it.star ? L("Clear most important", "取消最重要") : L("Mark as most important", "设为最重要的事")).setIcon("star").onClick(flip));
      menu.addItem((i) => i.setTitle(L("Delete", "删除")).setIcon("trash").onClick(async () => { await p.editTodo(path, it, ""); this.softRefresh(true); }));
      menu.showAtMouseEvent(e);
    });
    return row;
  },

  /** The week calendar. side: the narrow sidebar version — one day's hours, with the week as a strip of dates on top
      (click a date to show it, drop a to-do on a date to move it there). */
  async homeCalendar(parent, opts = {}) {
    const p = this.plugin, H = this.home, side = !!opts.side;
    if (side && !H.calDay) H.calDay = moment();
    // sidebar: day (one day's hours + the week as dates), week (all seven days; scrolls sideways until the sidebar is wide
    // enough) or month (a summary of each day). The full-week tab and Home always show the week.
    const mode = side ? (["day", "week", "month"].includes(p.settings.sideCalView) ? p.settings.sideCalView : "day") : "week";
    const single = mode === "day";
    const wrap = h(parent, "div", "planfold-ff-card planfold-weekcal planfold-mod-calendar" + (side ? " is-side" : "") + ` is-${mode}`);
    const sunday = p.settings.weekStart === "sunday";
    const start = rowStartOf(side ? H.calDay : H.calAnchor, sunday), end = start.clone().add(6, "day");
    const weekLabel = LANG === "zh" ? `${start.format("M月D日")}—${end.format(start.month() === end.month() ? "D日" : "M月D日")}` : `${start.format("MMM D")}—${end.format(start.month() === end.month() ? "D" : "MMM D")}`;
    const head = h(wrap, "div", "planfold-weekcal-head");
    const heading = h(head, "div", "planfold-weekcal-heading");
    h(heading, "span", "planfold-ff-kicker", ffKick("CALENDAR", "日历"));
    const actions = h(head, "div", "planfold-weekcal-actions");
    if (side) {
      // sidebar: [CALENDAR · Today] / Day·Week·Month / ‹ the date shown ›
      const today = button(actions, L("Today", "今天"), "planfold-weekcal-today", () => { H.calDay = moment(); H.calScrollTop = null; this.render(); });
      today.disabled = mode === "month" ? moment(H.calDay).isSame(moment(), "month") && moment(H.calDay).isSame(moment(), "day")
        : mode === "week" ? start.isSame(rowStartOf(moment(), sunday), "day") && moment(H.calDay).isSame(moment(), "day") : moment(H.calDay).isSame(moment(), "day");
      const seg = h(wrap, "div", "planfold-seg planfold-weekcal-modes"); seg.setAttr("role", "tablist");
      [["day", L("Day", "日")], ["week", L("Week", "周")], ["month", L("Month", "月")]].forEach(([id, label]) => {
        const b = h(seg, "button", id === mode ? "is-on" : "", label); b.type = "button"; b.setAttr("role", "tab"); b.setAttr("aria-selected", id === mode ? "true" : "false");
        b.addEventListener("click", async () => { if (id === mode) return; p.settings.sideCalView = id; H.calScrollTop = null; await p.saveSettings(); this.render(); });
      });
      const step = mode === "month" ? "month" : mode === "week" ? "week" : "day";
      const bar = h(wrap, "div", "planfold-weekcal-period");
      const go = (name, label, move) => {
        const b = h(bar, "button", "planfold-icon-btn planfold-weekcal-nav"); b.type = "button"; b.setAttr("aria-label", label); icon(b, name);
        b.addEventListener("click", () => { H.calDay = moment(H.calDay).add(move, step); H.calScrollTop = null; this.render(); });
      };
      const sel = moment(H.calDay);
      const label = mode === "month" ? dateFmt.month(sel)
        : mode === "week" ? (LANG === "zh" ? `第${start.isoWeek()}周 · ${weekLabel}` : `W${start.isoWeek()} · ${weekLabel}`)
        : (LANG === "zh" ? `${sel.format("M月D日")} ${dateFmt.weekday(sel)}` : sel.format("ddd, MMM D"));
      go("chevron-left", L("Previous", "上一个"), -1);
      h(bar, "strong", "planfold-weekcal-period-label" + (mode === "day" && sel.isSame(moment(), "day") ? " is-today" : ""), label);
      go("chevron-right", L("Next", "下一个"), 1);
    } else {
      h(heading, "strong", "planfold-weekcal-range", weekLabel);
      const nav = (name, label, move) => {
        const b = h(actions, "button", "planfold-icon-btn planfold-weekcal-nav"); b.type = "button"; b.setAttr("aria-label", label); icon(b, name);
        b.addEventListener("click", () => { H.calAnchor = moment(H.calAnchor).add(move, "week"); H.calScrollTop = null; this.render(); });
      };
      nav("chevron-left", L("Previous week", "上一周"), -1);
      const today = button(actions, L("Today", "今天"), "planfold-weekcal-today", () => { H.calAnchor = moment(); H.calScrollTop = null; this.render(); });
      today.disabled = start.isSame(rowStartOf(moment(), sunday), "day");
      nav("chevron-right", L("Next week", "下一周"), 1);
      openButton(actions, L("Open week plan", "打开本周计划"), () => this.go("planner", { scope: "week", anchor: start }), true);
    }
    if (mode === "month") return this.calendarMonth(wrap);

    const week = [...Array(7)].map((_, i) => start.clone().add(i, "day"));
    const days = single ? [moment(H.calDay).startOf("day")] : week;
    const notes = await Promise.all(days.map((d) => p.readNote("day", d)));
    if (single) {
      // the week as a strip of dates: click to show that day; drop a to-do here to move it to that day (time kept)
      const strip = h(wrap, "div", "planfold-weekcal-strip");
      week.forEach((d) => {
        const b = h(strip, "button", "planfold-weekcal-date" + (d.isSame(H.calDay, "day") ? " is-on" : "") + (d.isSame(moment(), "day") ? " is-today" : "")); b.type = "button";
        const w = dateFmt.weekday(d);
        h(b, "span", "", LANG === "zh" ? w.slice(-1) : w.slice(0, 1)); h(b, "strong", "", d.date());
        b.dataset.calZone = "date"; b.dataset.date = d.format(DKEY);
        b.addEventListener("click", () => { if (this._calDragged) return; H.calDay = d.clone(); H.calScrollTop = null; this.render(); });
      });
    }
    const weekNote = await p.readNote("week", start);
    const pathOf = (note) => (note.file ? note.file.path : note.path);
    const isToday = (d) => d.isSame(moment(), "day");
    // a drag that ends on the item it started on must not also count as a click
    const tap = (fn) => () => { if (!this._calDragged) fn(); };
    const openDay = (d) => tap(() => this.go("planner", { scope: "day", anchor: d }));
    // clicking a to-do edits its whole line right where it sits (time first, as in the note); Enter saves
    const editItem = (getEl) => tap(() => {
      const el = getEl(), c = el && el._cal, host = el && el.parentElement;
      if (!c || !host || host.querySelector(".planfold-weekcal-input.is-edit")) return;
      const r = el.getBoundingClientRect();
      const input = h(host, "textarea", "planfold-weekcal-input is-edit " + [...el.classList].filter((c) => /^(planfold-weekcal-(event|untimed|chip)|is-lane|is-star)$/.test(c)).map((c) => "as-" + c.replace("planfold-weekcal-", "")).join(" "));
      input.rows = 1;
      host.insertBefore(input, el);
      input.style.cssText = el.style.cssText; // same grid place and lane
      if (!el.matches(".planfold-weekcal-event")) { input.style.width = `${Math.max(r.width, 160)}px`; input.style.height = `${r.height}px`; }
      input.value = c.it.plain || c.it.text;
      input.placeholder = TIME_EXAMPLE();
      el.addClass("is-cal-editing");
      let done = false;
      const finish = async (save) => {
        if (done) return; done = true;
        const v = input.value.trim();
        // nothing changed: just put the item back, no redraw (and no jump)
        if (!save || v === (c.it.plain || c.it.text)) { input.remove(); el.removeClass("is-cal-editing"); return; }
        await p.editTodo(c.path, c.it, v);
        this.render();
      };
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); finish(true); }
        else if (e.key === "Escape") { e.preventDefault(); finish(false); }
      });
      input.addEventListener("blur", () => finish(true));
      setTimeout(() => { input.focus(); input.select(); }, 0);
    });

    // inline "new to-do" field: Enter saves, Esc or leaving it empty cancels
    const newTodo = (host, scope, m, time, cls = "") => {
      const input = h(host, "input", "planfold-weekcal-input " + cls); input.type = "text";
      input.placeholder = time ? `${time} ${L("New to-do", "新待办")}` : TIME_EXAMPLE();
      let done = false;
      const finish = async (save) => {
        if (done) return; done = true;
        const text = input.value.trim();
        if (save && text) { await p.addTodo(scope, m, time ? `${time} ${text}` : text); this.render(); return; }
        // left empty: tidy up in place, no redraw (a redraw would jump the page)
        input.remove();
        if (host.matches(".planfold-weekcal-preview")) host.remove();
        if (scope === "week" && !wrap.querySelector(".planfold-weekcal-chip.is-add")) this.render(); // brings the + back
      };
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); finish(true); }
        else if (e.key === "Escape") { e.preventDefault(); finish(false); }
      });
      input.addEventListener("blur", () => finish(true));
      setTimeout(() => input.focus(), 0);
      return input;
    };

    // the week's backlog belongs to the full week view; the sidebar is just the day's schedule
    if (!side) {
      const backlogItems = weekNote.items.filter((it) => !it.done);
      const backlog = h(wrap, "div", "planfold-weekcal-backlog");
      backlog.dataset.calZone = "week";
      h(backlog, "span", "planfold-weekcal-backlog-label", L("THIS WEEK", "本周待安排") + ` · ${pad2(backlogItems.length)}`);
      const chips = h(backlog, "div", "planfold-weekcal-chips");
      const chipLimit = H.calExpand ? Infinity : 6;
      backlogItems.slice(0, chipLimit).forEach((it) => {
        const b = button(chips, it.text, "planfold-weekcal-chip", editItem(() => b));
        b.title = it.text;
        if (it.star) b.addClass("is-star");
        b._cal = { path: pathOf(weekNote), it, scope: "week" };
      });
      if (backlogItems.length > chipLimit) button(chips, `+${backlogItems.length - chipLimit}`, "planfold-weekcal-chip is-more", () => { H.calExpand = true; this.render(); });
      const addWeek = button(chips, "", "planfold-weekcal-chip is-add", () => { addWeek.remove(); newTodo(chips, "week", start, "", "is-chip"); });
      icon(addWeek, "plus"); addWeek.setAttr("aria-label", L("Add a to-do for this week", "添加本周待办")); addWeek.title = L("Add a to-do for this week", "添加本周待办");
    }

    const scroller = h(wrap, "div", "planfold-weekcal-scroll"); scroller.tabIndex = 0; scroller.setAttr("aria-label", L("Weekly schedule, scroll horizontally", "周日历，可横向滚动"));
    const board = h(scroller, "div", "planfold-weekcal-board");
    board.style.setProperty("--wc-days", String(days.length));
    h(board, "div", "planfold-weekcal-corner", single ? "" : `W${start.isoWeek()}`);
    const heads = days.map((d) => {
      const day = h(board, "button", "planfold-weekcal-day" + (isToday(d) ? " is-today" : "")); day.type = "button";
      h(day, "span", "", dateFmt.weekday(d)); h(day, "strong", "", d.date());
      day.addEventListener("click", openDay(d));
      return day;
    });

    h(board, "div", "planfold-weekcal-all-label", L("All day", "全天"));
    const untimedLimit = H.calExpand ? Infinity : 3;
    notes.forEach((note, index) => {
      const cell = h(board, "div", "planfold-weekcal-all" + (isToday(days[index]) ? " is-today" : ""));
      cell.dataset.calZone = "untimed"; cell.dataset.day = String(index);
      const untimed = note.items.filter((it) => !it.time), items = [...untimed.filter((it) => !it.done), ...untimed.filter((it) => it.done)];
      items.slice(0, untimedLimit).forEach((it) => {
        const b = button(cell, "", "planfold-weekcal-untimed" + (it.done ? " is-done" : ""), editItem(() => b));
        if (it.done) h(b, "span", "planfold-weekcal-check");
        b.append((it.star ? "★ " : "") + it.text);
        b.title = it.text;
        b._cal = { path: pathOf(note), it, scope: "day", day: index };
      });
      if (items.length > untimedLimit) button(cell, `+${items.length - untimedLimit}`, "planfold-weekcal-more", () => { H.calExpand = true; this.render(); });
      cell.addEventListener("click", (e) => {
        if (e.target !== cell || this._calDragged || cell.querySelector(".planfold-weekcal-input")) return;
        newTodo(cell, "day", days[index], "");
      });
    });

    const parseClock = (value) => {
      const match = String(value || "").match(/^(\d{1,2}):(\d{2})(?:\s*[-–—~～至]\s*(\d{1,2}):(\d{2}))?/);
      if (!match) return null;
      const from = Math.min(1439, Number(match[1]) * 60 + Number(match[2]));
      let to = match[3] == null ? from + 60 : Math.min(1440, Number(match[3]) * 60 + Number(match[4]));
      if (to <= from) to = Math.min(1440, from + 60);
      return { from, to };
    };
    const clock = (min) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
    const timed = [];
    notes.forEach((note, day) => note.items.forEach((it) => { const time = parseClock(it.time); if (time) timed.push({ note, day, it, time }); }));
    // the whole day; the calendar scrolls inside itself (opens at 8:00, then remembers where you were)
    const firstHour = 0, lastHour = 24;
    const slots = Math.max(2, (lastHour - firstHour) * 2);
    const slotMin = (slot) => firstHour * 60 + slot * 30;
    const timeline = h(board, "div", "planfold-weekcal-timeline");
    timeline.dataset.calZone = "timed";
    timeline.style.setProperty("--t-weekcal-slots", String(slots)); timeline.style.setProperty("--wc-days", String(days.length));
    for (let hour = firstHour; hour < lastHour; hour++) {
      const row = (hour - firstHour) * 2 + 1;
      const label = h(timeline, "span", "planfold-weekcal-hour", `${pad(hour)}:00`); label.style.gridRow = `${row} / span 2`;
      days.forEach((d, day) => {
        const line = h(timeline, "span", "planfold-weekcal-line" + (isToday(d) ? " is-today" : ""));
        line.style.gridColumn = String(day + 2); line.style.gridRow = `${row} / span 2`;
      });
    }
    const place = (el, day, from, span) => { el.style.gridColumn = String(day + 2); el.style.gridRow = `${from + 1} / span ${Math.max(1, Math.min(span, slots - from))}`; };
    // overlapping events on the same day sit side by side, so each one's edges stay reachable
    for (let day = 0; day < days.length; day++) {
      const list = timed.filter((x) => x.day === day).sort((a, b) => a.time.from - b.time.from || b.time.to - a.time.to);
      let group = [], lanes = [], groupEnd = -1;
      const close = () => { group.forEach((x) => { x.lanes = lanes.length; }); group = []; lanes = []; };
      for (const x of list) {
        if (x.time.from >= groupEnd) { close(); groupEnd = -1; }
        let lane = lanes.findIndex((end) => end <= x.time.from);
        if (lane < 0) { lane = lanes.length; lanes.push(0); }
        lanes[lane] = x.time.to; x.lane = lane; group.push(x); groupEnd = Math.max(groupEnd, x.time.to);
      }
      close();
    }
    timed.forEach(({ note, day, it, time, lane, lanes }) => {
      const startSlot = Math.max(0, Math.round((time.from - firstHour * 60) / 30));
      const span = Math.max(1, Math.ceil((time.to - time.from) / 30));
      const event = h(timeline, "button", "planfold-weekcal-event" + (it.star ? " is-star" : "") + (it.done ? " is-done" : "")); event.type = "button";
      place(event, day, startSlot, span);
      if (lanes > 1) { event.addClass("is-lane"); event.style.setProperty("--t-lane", String(lane)); event.style.setProperty("--t-lanes", String(lanes)); }
      const title = h(event, "strong", "");
      if (it.done) h(title, "span", "planfold-weekcal-check");
      title.append((it.star ? "★ " : "") + it.text);
      h(event, "span", "", it.time);
      event.title = `${it.text} · ${it.time}`;
      event.addEventListener("click", editItem(() => event));
      event._cal = { path: pathOf(note), it, scope: "day", day, from: startSlot, span };
      h(event, "span", "planfold-weekcal-grow").setAttr("aria-hidden", "true");
      h(event, "span", "planfold-weekcal-grow is-top").setAttr("aria-hidden", "true");
    });

    const slotPx = timeline.getBoundingClientRect().height / slots || 32;
    // opens at the earliest timed to-do in view; with none, at 8:00 (scroll up for earlier hours). After that it stays where you left it.
    const startHour = timed.length ? Math.floor(Math.min(...timed.map((x) => x.time.from)) / 60) : 8;
    const pinned = single ? board.querySelector(".planfold-weekcal-all").getBoundingClientRect().height : heads[0].getBoundingClientRect().height;
    const atStart = timeline.getBoundingClientRect().top - scroller.getBoundingClientRect().top + (startHour - firstHour) * 2 * slotPx - pinned;
    scroller.scrollTop = H.calScrollTop != null ? H.calScrollTop : atStart;
    scroller.addEventListener("scroll", () => { H.calScrollTop = scroller.scrollTop; });
    this.calendarDrag(wrap, { days, heads, timeline, slots, slotMin, clock, place, newTodo, start, scroller });
  },

  /** Sidebar month: one cell per day — date, mood as a colour, a thin bar for habits (today is marked by its own highlight).
      Click a day for its summary underneath: mood, the most important thing, to-dos, habits, the first line written. */
  async calendarMonth(wrap) {
    const p = this.plugin, H = this.home, habits = p.habits(), sunday = p.settings.weekStart === "sunday";
    const sel = moment(H.calDay).startOf("day"), first = sel.clone().startOf("month"), last = sel.clone().endOf("month");
    const gridStart = rowStartOf(first, sunday), weeks = Math.ceil((last.diff(gridStart, "day") + 1) / 7);
    const infos = await p.rangeInfo(gridStart, gridStart.clone().add(weeks * 7 - 1, "day"));
    const grid = h(wrap, "div", "planfold-mcal");
    infos.slice(0, 7).forEach((x) => { const w = dateFmt.weekday(x.d); h(grid, "span", "planfold-mcal-dow", LANG === "zh" ? w.slice(-1) : w.slice(0, 1)); });
    for (const info of infos) {
      const d = info.d;
      const cell = h(grid, "button", "planfold-mcal-day" + (d.month() !== sel.month() ? " is-out" : "") + (d.isSame(moment(), "day") ? " is-today" : "") + (d.isSame(sel, "day") ? " is-on" : "") + (d.isAfter(moment(), "day") ? " is-future" : ""));
      cell.type = "button"; cell.setAttr("aria-label", dateFmt.short ? dateFmt.short(d) : d.format(DKEY));
      h(cell, "span", "planfold-mcal-num", d.date());
      const marks = h(cell, "span", "planfold-mcal-marks");
      const md = h(marks, "span", "planfold-mcal-mood" + (info.mood ? ` m${info.mood}` : ""));
      if (info.mood) md.title = L(`Mood ${info.mood} of 5`, `心情 ${info.mood} / 5`);
      const doneH = habits.filter((g) => info.habits && info.habits[g.key]).length;
      if (doneH) { const bar = h(cell, "span", "planfold-mcal-bar"); h(bar, "span", "").style.width = `${Math.round((doneH / habits.length) * 100)}%`; }
      cell.addEventListener("click", () => { H.calDay = d.clone(); this.render(); });
    }

    // what the marks mean: mood low → high, and the habit line
    const legend = h(wrap, "div", "planfold-mcal-legend");
    h(legend, "span", "", L("Mood", "心情"));
    h(legend, "span", "planfold-mcal-meta", L("low", "低"));
    for (let i = 1; i <= 5; i++) h(legend, "span", `planfold-mcal-mood m${i}`);
    h(legend, "span", "planfold-mcal-meta", L("high", "高"));
    if (habits.length) { h(legend, "span", "planfold-mcal-legend-bar"); h(legend, "span", "planfold-mcal-meta", L("habits done", "习惯完成")); }

    // the chosen day, summed up
    const note = await p.readNote("day", sel), info = infos.find((x) => x.d.isSame(sel, "day")) || {};
    const box = h(wrap, "div", "planfold-mcal-detail");
    const dh = h(box, "div", "planfold-ff-head");
    h(dh, "span", "planfold-mcal-title", LANG === "zh" ? `${sel.format("M月D日")} ${dateFmt.weekday(sel)}` : sel.format("ddd, MMM D"));
    openButton(dh, L("Open this day", "打开这一天"), () => this.go("planner", { scope: "day", anchor: sel }), true);
    if (info.mood) { const m = h(box, "div", "planfold-mcal-row"); h(m, "span", `planfold-mcal-mood is-big m${info.mood}`); h(m, "span", "planfold-mcal-meta", L("Mood", "心情")); }
    const star = note.items.find((i) => i.star);
    if (star) { const st = h(box, "div", "planfold-mcal-focus" + (star.done ? " is-done" : "")); h(st, "span", "planfold-ff-kicker", L("MOST IMPORTANT", "最重要的事")); h(st, "div", "planfold-mcal-focus-text", (star.time ? star.time + " " : "") + star.text); }
    const rest = note.items.filter((i) => i !== star);
    if (rest.length) {
      const list = h(box, "div", "planfold-mcal-list");
      h(list, "span", "planfold-ff-kicker", L("TO-DO", "待办"));
      [...rest.filter((i) => !i.done), ...rest.filter((i) => i.done)].forEach((it) => {
        const r = h(list, "button", "planfold-mcal-todo" + (it.done ? " is-done" : "")); r.type = "button";
        h(r, "span", "planfold-check" + (it.done ? " is-on" : ""));
        const t = h(r, "span", "planfold-mcal-todo-text");
        if (it.time) h(t, "span", "planfold-todo-time", it.time + "\u2002");
        t.append(it.text);
        r.addEventListener("click", async () => { await p.toggleTodo(note.path, it); this.render(); });
      });
    }
    const anyHabit = !!(info.habits && Object.values(info.habits).some(Boolean));
    if (habits.length && (anyHabit || sel.isSame(moment(), "day"))) {
      const hb = h(box, "div", "planfold-mcal-list");
      h(hb, "span", "planfold-ff-kicker", L("HABITS", "习惯"));
      const row = h(hb, "div", "planfold-mcal-habits");
      habits.forEach((g) => { const on = !!(info.habits && info.habits[g.key]); h(row, "span", "planfold-mcal-habit" + (on ? " is-on" : ""), g.name); });
    }
    if (info.first) { const w = h(box, "div", "planfold-mcal-list"); h(w, "span", "planfold-ff-kicker", L("WRITTEN", "记下的")); h(w, "div", "planfold-mcal-first", info.first); }
    if (!note.items.length && !info.mood && !info.first && !anyHabit) h(box, "div", "planfold-mcal-empty", L("Nothing recorded this day.", "这一天还没有记录。"));
  },

  /** Calendar pointer gestures: move a to-do (to a day, a time or this week's list), stretch its end time,
      or sweep empty time to add one. Pointer events rather than HTML drag, so the time preview can follow. */
  calendarDrag(wrap, g) {
    const p = this.plugin, { days, heads, timeline, slots, slotMin, clock, place, newTodo, start, scroller } = g;
    // one day (sidebar): anywhere on the hours is that day
    const dayAt = (x) => heads.length === 1 ? 0 : heads.findIndex((el) => { const r = el.getBoundingClientRect(); return x >= r.left && x < r.right; });
    const slotAt = (y) => { const r = timeline.getBoundingClientRect(); return Math.max(0, Math.min(slots - 1, Math.floor((y - r.top) / (r.height / slots)))); };
    const range = (from, span) => `${clock(slotMin(from))}-${clock(slotMin(from + span))}`;
    let s = null, preview = null, ghost = null;
    const clearMarks = () => wrap.querySelectorAll(".is-cal-target").forEach((el) => el.removeClass("is-cal-target"));
    const showPreview = (day, from, span) => {
      if (!preview) preview = h(timeline, "div", "planfold-weekcal-preview");
      place(preview, day, from, span); preview.setText(range(from, span));
    };
    const hidePreview = () => { if (preview) { preview.remove(); preview = null; } };
    // near the calendar's own top/bottom edge: scroll the hours; near the page's: scroll the page
    const autoscroll = (y) => {
      for (const box of [scroller, this.body]) {
        if (!box) continue;
        const r = box.getBoundingClientRect(), before = box.scrollTop;
        if (y < r.top + 48) box.scrollTop -= 14; else if (y > r.bottom - 48) box.scrollTop += 14;
        if (box.scrollTop !== before) return;
      }
    };
    // where would a drop land? { zone: "week" } | { zone: "untimed", day } | { zone: "timed", day, from }
    const targetAt = (x, y) => {
      const el = document.elementFromPoint(x, y), zone = el && el.closest && el.closest("[data-cal-zone]");
      if (!zone || !wrap.contains(zone)) return null;
      if (zone.dataset.calZone === "week") return { zone: "week", el: zone };
      if (zone.dataset.calZone === "date") return { zone: "date", date: moment(zone.dataset.date, DKEY), el: zone };
      if (zone.dataset.calZone === "untimed") return { zone: "untimed", day: Number(zone.dataset.day), el: zone };
      const day = dayAt(x);
      return day < 0 ? null : { zone: "timed", day, from: Math.max(0, Math.min(slots - s.span, slotAt(y) - s.grab)) };
    };

    wrap.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || e.target.closest(".planfold-weekcal-input")) return;
      const item = e.target.closest(".planfold-weekcal-chip, .planfold-weekcal-untimed, .planfold-weekcal-event");
      // an event's top or bottom 8px stretch it; worked out from the pointer, not from which child was hit
      let edge = "";
      if (item && item.matches(".planfold-weekcal-event")) {
        const r = item.getBoundingClientRect(), zone = Math.min(8, r.height / 4);
        edge = e.clientY >= r.bottom - zone ? "grow" : e.clientY <= r.top + zone ? "top" : "";
      }
      if (item && item._cal) {
        const c = item._cal, span = c.span || 2;
        const grab = c.from != null && !edge ? Math.max(0, slotAt(e.clientY) - c.from) : 0;
        s = { mode: edge || "move", el: item, c, span, grab, x: e.clientX, y: e.clientY, moved: false };
      } else if (e.target.classList.contains("planfold-weekcal-line")) {
        const day = dayAt(e.clientX); if (day < 0) return;
        s = { mode: "create", day, anchor: slotAt(e.clientY), x: e.clientX, y: e.clientY, moved: false };
      } else return;
      e.preventDefault();
    });

    let near = null;
    wrap.addEventListener("pointermove", (e) => {
      if (!s) {
        // show the resize cursor on an event's top/bottom edge
        const ev = e.target.closest && e.target.closest(".planfold-weekcal-event");
        if (near && near !== ev) { near.removeClass("is-near-edge"); near = null; }
        if (ev) { const r = ev.getBoundingClientRect(), zone = Math.min(8, r.height / 4); ev.toggleClass("is-near-edge", e.clientY >= r.bottom - zone || e.clientY <= r.top + zone); near = ev; }
        return;
      }
      if (!s.moved && Math.hypot(e.clientX - s.x, e.clientY - s.y) < 5) return;
      if (!s.moved) {
        // capture only once it is really a drag, so a plain click still reaches the button under it
        s.moved = true; wrap.addClass("is-cal-dragging"); wrap.setPointerCapture(e.pointerId);
        if (s.mode === "move") {
          s.el.addClass("is-cal-source");
          ghost = h(this.root, "div", "planfold-weekcal-ghost", s.c.it.text);
        }
      }
      autoscroll(e.clientY);
      if (s.mode === "create") {
        const at = slotAt(e.clientY), from = Math.min(at, s.anchor), span = Math.abs(at - s.anchor) + 1;
        s.from = from; s.span = span; showPreview(s.day, from, span);
        return;
      }
      if (s.mode === "grow") {
        s.span = Math.max(1, slotAt(e.clientY) - s.c.from + 1);
        showPreview(s.c.day, s.c.from, s.span);
        return;
      }
      if (s.mode === "top") {
        const endSlot = s.c.from + s.c.span, from = Math.min(endSlot - 1, slotAt(e.clientY));
        s.from = from; s.span = endSlot - from;
        showPreview(s.c.day, from, s.span);
        return;
      }
      ghost.style.left = `${e.clientX + 12}px`; ghost.style.top = `${e.clientY + 8}px`;
      clearMarks();
      s.target = targetAt(e.clientX, e.clientY);
      if (s.target && s.target.zone === "timed") showPreview(s.target.day, s.target.from, s.span);
      else { hidePreview(); if (s.target) s.target.el.addClass("is-cal-target"); }
    });

    const end = async (e, cancelled) => {
      if (!s) return;
      const st = s; s = null;
      wrap.removeClass("is-cal-dragging"); clearMarks();
      if (ghost) { ghost.remove(); ghost = null; }
      if (st.el) st.el.removeClass("is-cal-source");
      if (!st.moved) {
        hidePreview();
        // a plain click on empty time adds a one-hour to-do there
        if (st.mode === "create" && !cancelled) { showPreview(st.day, st.anchor, 2); const host = preview; preview = null; host.empty(); newTodo(host, "day", days[st.day], range(st.anchor, 2)); }
        return;
      }
      this._calDragged = true; setTimeout(() => { this._calDragged = false; }, 0);
      if (cancelled) { hidePreview(); return; }
      if (st.mode === "create") { const host = preview; preview = null; host.empty(); newTodo(host, "day", days[st.day], range(st.from, st.span)); return; }
      hidePreview();
      const { path, it } = st.c;
      if (st.mode === "grow") await p.rescheduleTodo(path, it, "day", days[st.c.day], range(st.c.from, st.span));
      else if (st.mode === "top") await p.rescheduleTodo(path, it, "day", days[st.c.day], range(st.from, st.span));
      else if (!st.target) return;
      else if (st.target.zone === "week") await p.rescheduleTodo(path, it, "week", start, "");
      else if (st.target.zone === "date") await p.rescheduleTodo(path, it, "day", st.target.date, it.time || "");
      else if (st.target.zone === "untimed") await p.rescheduleTodo(path, it, "day", days[st.target.day], "");
      else await p.rescheduleTodo(path, it, "day", days[st.target.day], range(st.target.from, st.span));
      this.softRefresh(true);
    };
    wrap.addEventListener("pointerup", (e) => end(e, false));
    wrap.addEventListener("pointercancel", (e) => end(e, true));
    wrap.addEventListener("keydown", (e) => { if (e.key === "Escape" && s) { e.preventDefault(); end(e, true); } });
  },
});

/* =====================================================================
   Planner
   ===================================================================== */
const SCOPE_LABEL = () => ({ day: L("Day", "日"), week: L("Week", "周"), month: L("Month", "月"), year: L("Year", "年") });
const UPPER = { day: "week", week: "month", month: "year" };
function scopeTitle(scope, m) {
  m = moment(m);
  if (scope === "day") return `${dateFmt.short(m)} · ${dateFmt.weekday(m)}`;
  if (scope === "week") { const s = m.clone().startOf("isoWeek"), e = s.clone().add(6, "day"); return L(`Week ${s.isoWeek()}`, `第 ${s.isoWeek()} 周`) + ` · ${dateFmt.short(s)}–${s.isSame(e, "month") && LANG !== "zh" ? e.format("D") : dateFmt.short(e)}`; }
  if (scope === "month") return dateFmt.month(m);
  return m.format("YYYY");
}
// The note's own title: a warmer, shorter date than the navigation header above it.
function noteTitle(scope, m) {
  m = moment(m);
  if (scope === "day") return dateFmt.long(m);
  if (scope === "week") { const s = m.clone().startOf("isoWeek"); return L(`Week ${s.isoWeek()}`, `第 ${s.isoWeek()} 周`); }
  if (scope === "month") return dateFmt.monthName(m);
  return m.format("YYYY");
}
const thisLabel = (scope) => ({ day: L("Today", "今天"), week: L("This week", "本周"), month: L("This month", "本月"), year: L("This year", "今年") })[scope];
const noteLabel = (scope) => ({ day: L("Daily note", "日记"), week: L("Weekly note", "周记"), month: L("Monthly note", "月记"), year: L("Yearly note", "年记") })[scope];

function periodHeader(view, parent, scope, anchor, scopes, onChange) {
  const head = h(parent, "header", "planfold-period");
  const nav = h(head, "div", "planfold-period-nav");
  const prev = h(nav, "button", "planfold-icon-btn"); prev.type = "button"; prev.setAttr("aria-label", L("Previous period", "上一段时间")); try { setIcon(prev, "chevron-left"); } catch (e) {}
  h(nav, "h2", "planfold-period-title", scopeTitle(scope, anchor));
  const next = h(nav, "button", "planfold-icon-btn"); next.type = "button"; next.setAttr("aria-label", L("Next period", "下一段时间")); try { setIcon(next, "chevron-right"); } catch (e) {}
  const unit = scope === "day" ? "day" : scope;
  prev.addEventListener("click", () => onChange(scope, moment(anchor).subtract(1, unit)));
  next.addEventListener("click", () => onChange(scope, moment(anchor).add(1, unit)));
  const isNow = moment(anchor).isSame(moment(), scope === "week" ? "isoWeek" : scope);
  const todayBtn = button(nav, scope === "day" ? L("Today", "今天") : thisLabel(scope), "planfold-ghost" + (isNow ? " is-disabled" : ""), () => onChange(scope, moment()));
  if (isNow) todayBtn.disabled = true;
  const seg = h(head, "div", "planfold-seg");
  for (const sc of scopes) {
    const b = h(seg, "button", sc === scope ? "is-on" : "", SCOPE_LABEL()[sc]); b.type = "button";
    b.addEventListener("click", () => onChange(sc, moment()));
  }
  return head;
}

Object.assign(PlanfoldView.prototype, {
  async renderPlanner(inner) {
    const p = this.plugin, st = this.pl, scope = st.scope, anchor = moment(st.anchor);
    periodHeader(this, inner, scope, anchor, SCOPES, (sc, m) => { st.scope = sc; st.anchor = m; this.render(); });
    const grid = h(inner, "div", "planfold-planner-grid");
    const left = h(grid, "div", "planfold-planner-left"), right = h(grid, "div", "planfold-planner-right");
    let note = await p.readNote(scope, anchor);
    if (note.exists && !note.hasPlanfold && p.settings.oldNotes === "always" && !p.settings.oldNoteSkip.includes(note.path)) {
      await p.appendPlanfold(note.file, scope);
      note = await p.readNote(scope, anchor);
    }

    /* ---- To-do (left): this period's list; under it the level up (a day sees its week) or the parts
       (a week its days, a month its weeks, a year its months). Drag a to-do by its handle between them to move it. ---- */
    // one TO-DO card: a day stacks Today over This week; a week/month/year splits its list (left) from its parts (right),
    // and then the note runs full width underneath
    if (scope !== "day") grid.addClass("is-stacked");
    this._assignTargets = []; // filled by planList / planParts: where the handle menu can move a to-do
    const tsec = h(left, "div", "planfold-ff-section");
    h(h(tsec, "div", "planfold-ff-head"), "span", "planfold-ff-kicker", ffKick("TO-DO", "待办"));
    const tcard = h(tsec, "div", "planfold-ff-card planfold-plan-todo" + (scope === "day" ? " is-day" : " is-split"));
    await this.planList(tcard, scope, anchor, note);
    if (scope !== "day") await this.planParts(tcard, scope, anchor); // a day shows only today's to-dos

    /* ---- Note (right) ---- */
    // the note: its label and two quiet actions (edit the template, open the note) above the card
    const nsec = h(right, "div", "planfold-ff-section");
    const nh = h(nsec, "div", "planfold-ff-head planfold-note-head");
    const tt = h(nh, "span", "planfold-ff-kicker planfold-note-title", LANG === "zh" ? noteLabel(scope) : noteLabel(scope).toUpperCase());
    const np = h(nsec, "div", "planfold-ff-card planfold-note");
    tt.id = "planfold-note-title"; np.setAttr("aria-labelledby", tt.id);
    const acts = h(nh, "div", "planfold-note-actions");
    const edit = h(acts, "button", "planfold-icon-btn"); edit.type = "button";
    edit.setAttr("aria-label", L("Edit template", "编辑模板"));
    try { setIcon(edit, "pencil"); } catch (e) {}
    edit.addEventListener("click", () => this.openSettings("templates"));
    const file = h(acts, "button", "planfold-icon-btn planfold-note-open");
    file.type = "button"; file.setAttr("aria-label", L("Open note", "打开笔记"));
    try { setIcon(file, "arrow-up-right"); } catch (e) {}
    file.addEventListener("click", async () => p.openFile(await p.ensureNote(scope, anchor)));
    const old = p.isOldNote(note);
    const skipped = note.exists && !note.hasPlanfold && !old;
    if (old) this.oldNoteBanner(np, note, scope);
    const content = h(np, "div", "planfold-note-content" + (old ? " is-dimmed" : ""));
    if (scope === "day") { this.moodRow(content, anchor); this.noteHabits(content, anchor); }
    if (skipped) { h(content, "p", "planfold-muted planfold-note-skip", L("This note doesn't have Planfold sections. Change this in Settings → Planfold → Notes.", "这篇笔记没有 Planfold 段落。可以在 设置 → Planfold → 笔记 里修改。")); return; }
    const tpl = p.settings.templates[scope] || [];
    for (const f of tpl) this.fieldBox(content, scope, anchor, f, note.fields[f.id] || "");
    // week / month / year: sections already written in this note but not in the template still show (and stay editable)
    let written = 0;
    if (scope !== "day") {
      const used = new Set(tpl.map((f) => p.findField(note.parsed, scope, f)).filter(Boolean));
      for (const sec of note.parsed.sections) {
        if (sec === note.todo || used.has(sec) || !sec.title) continue;
        const text = sectionText(note.parsed, sec);
        if (!String(text || "").trim()) continue;
        written++;
        this.fieldBox(content, scope, anchor, { id: "written:" + norm(sec.title), label: sec.title.replace(/^[\p{Extended_Pictographic}\uFE0F\s]+/u, "") || sec.title, hint: "", prev: [sec.title] }, text);
      }
    }
    if (!tpl.length && !written) {
      const empty = h(content, "div", "planfold-note-empty");
      h(empty, "span", "", scope === "day" ? L("No sections in this template.", "这个模板里没有段落。") : L("Blank for now — add the sections you want to keep for every " + SCOPE_LABEL()[scope].toLowerCase() + ".", `现在是空白的，可以添加你想每${SCOPE_LABEL()[scope]}都写的段落。`));
      button(empty, L("Add a section", "添加段落"), "planfold-link", () => this.openSettings("templates"));
    }
  },

  /** One period's to-do list as a labelled card (Home's style). It is also a drop target: a to-do dragged here moves into this note. */
  async planList(parent, scope, anchor, note) {
    const p = this.plugin, st = this.pl;
    note = note || await p.readNote(scope, anchor);
    const current = moment(anchor).isSame(moment(), scope === "week" ? "isoWeek" : scope);
    const group = h(parent, "div", "planfold-plan-group planfold-ff-todos is-primary planfold-todos is-planner");
    const head = h(group, "div", "planfold-plan-subhead");
    h(head, "span", "planfold-plan-sublabel", current ? thisLabel(scope) : scopeTitle(scope, anchor).split(" · ")[0]);
    if (scope !== st.scope) openButton(head, L(`Open ${SCOPE_LABEL()[scope].toLowerCase()}`, `打开${SCOPE_LABEL()[scope]}`), () => { st.scope = scope; st.anchor = moment(anchor); this.render(); }, true);
    const items = note.items;
    [...items.filter((i) => !i.done), ...items.filter((i) => i.done)].forEach((it) => this.todoRow(group, note.path, it));
    addInput(group, L("Add a to-do", "添加待办"), async (v) => { await p.addTodo(scope, anchor, v); this.softRefresh(true); }, scope === "day" ? TIME_EXAMPLE() : "");
    this.planDrop(group, scope, anchor, note.path);
    (this._assignTargets = this._assignTargets || []).push({ label: current ? thisLabel(scope) : scopeTitle(scope, anchor).split(" · ")[0], scope, m: moment(anchor), path: note.path });
    return group;
  },

  /** The parts of a period, one compact row each — a week's days, a month's weeks, a year's months — so to-dos can be handed out by dragging */
  async planParts(parent, scope, anchor) {
    const p = this.plugin, st = this.pl, a = moment(anchor);
    const child = { week: "day", month: "week", year: "month" }[scope];
    let parts = [];
    if (scope === "week") { const s0 = a.clone().startOf("isoWeek"); parts = [...Array(7)].map((_, i) => s0.clone().add(i, "day")); }
    else if (scope === "month") { for (let w = a.clone().startOf("month").startOf("isoWeek"); !w.isAfter(a.clone().endOf("month"), "day"); w.add(1, "week")) parts.push(w.clone()); }
    else parts = [...Array(12)].map((_, i) => a.clone().startOf("year").add(i, "month"));
    const notes = await Promise.all(parts.map((m) => p.readNote(child, m)));
    const LABEL = { day: L("Each day", "每天"), week: L("Each week", "每周"), month: L("Each month", "每月") };
    const card = h(parent, "div", "planfold-plan-group planfold-parts");
    const head = h(card, "div", "planfold-plan-subhead");
    h(head, "span", "planfold-plan-sublabel", LABEL[child]);
    h(head, "span", "planfold-parts-hint", L("drag to-dos here to plan them", "把左边的待办拖进来分配"));
    parts.forEach((m, i) => {
      const note = notes[i], current = m.isSame(moment(), child === "week" ? "isoWeek" : child);
      const row = h(card, "div", "planfold-part" + (current ? " is-current" : ""));
      const lab = h(row, "button", "planfold-part-label"); lab.type = "button";
      if (child === "day") { h(lab, "span", "", dateFmt.weekday(m)); h(lab, "strong", "", m.date()); }
      else if (child === "week") { h(lab, "span", "", `W${m.isoWeek()}`); h(lab, "strong", "", m.format("M/D")); }
      else h(lab, "strong", "", dateFmt.monthShort(m.month()));
      lab.title = L("Open", "打开");
      lab.addEventListener("click", () => { st.scope = child; st.anchor = m.clone(); this.render(); });
      const list = h(row, "div", "planfold-part-list planfold-todos");
      const items = note.items;
      if (!items.length) h(list, "span", "planfold-part-empty", "—");
      [...items.filter((x) => !x.done), ...items.filter((x) => x.done)].forEach((it) => this.todoRow(list, note.path, it));
      this.planDrop(row, child, m, note.path);
      (this._assignTargets = this._assignTargets || []).push({ label: child === "day" ? `${dateFmt.weekday(m)} ${m.date()}` : child === "week" ? `W${m.isoWeek()}` : dateFmt.monthShort(m.month()), scope: child, m: m.clone(), path: note.path });
    });
  },

  /** A drop target for to-dos dragged by their handle: moves the line into this period's note (its time, star and done state go with it) */
  planDrop(el, scope, m, path) {
    const p = this.plugin;
    el.addEventListener("dragover", (e) => { const d = this._drag; if (!d || d.path === path) return; e.preventDefault(); el.addClass("is-drop"); });
    el.addEventListener("dragleave", (e) => { if (!el.contains(e.relatedTarget)) el.removeClass("is-drop"); });
    el.addEventListener("drop", async (e) => {
      const d = this._drag; if (!d || d.path === path) return;
      e.preventDefault(); el.removeClass("is-drop"); this._drag = null;
      await p.rescheduleTodo(d.path, d.it, scope, moment(m), d.it.time || "");
      this.softRefresh(true);
    });
  },

  /** The day's habits inside the daily note: tick them here (not on days still to come) */
  noteHabits(parent, d) {
    const p = this.plugin, habits = p.habits();
    const row = h(parent, "div", "planfold-note-row planfold-note-habits");
    h(row, "span", "planfold-label", L("Habits", "习惯"));
    if (!habits.length) { button(row, L("Add your first habit", "添加第一个习惯"), "planfold-link", () => this.openSettings("habits")); return; }
    const fm = p.fm(p.fileFor("day", d)), future = moment(d).isAfter(moment(), "day");
    const grid = h(row, "div", "planfold-note-habit-grid");
    for (const g of habits) {
      const on = p.habitDone(fm, g);
      const b = h(grid, "button", "planfold-ff-habit" + (on ? " is-done" : "")); b.type = "button";
      b.setAttr("aria-pressed", on ? "true" : "false");
      h(b, "span", "planfold-check" + (on ? " is-on" : ""));
      h(b, "span", "planfold-ff-habit-name", g.name);
      if (future) { b.disabled = true; continue; }
      b.addEventListener("click", async () => { await p.setHabit(d, g, !on); setTimeout(() => this.render(), 150); });
    }
  },

  async stillOpen(panel, upper, anchor) {
    const p = this.plugin;
    const un = await p.readNote(upper, anchor);
    const open = un.items.filter((i) => !i.done);
    const box = h(panel, "div", "planfold-still");
    const head = h(box, "div", "planfold-still-head");
    // title and count are two different things: title in ink, count as quiet meta with its own words
    const t = h(head, "span", "planfold-still-title", thisLabel(upper));
    if (open.length) h(head, "span", "planfold-still-count", L(`${open.length} open`, `${open.length} 项未完成`));
    openButton(head, L(`Open ${SCOPE_LABEL()[upper].toLowerCase()}`, `打开${SCOPE_LABEL()[upper]}`), () => { this.pl.scope = upper; this.render(); }, true);
    open.forEach((it) => this.todoRow(box, un.path, it));
    addInput(box, L(`Add to ${thisLabel(upper).toLowerCase()}`, `加到${thisLabel(upper)}`), async (v) => { await p.addTodo(upper, anchor, v); this.softRefresh(true); });
  },

  oldNoteBanner(parent, note, scope) {
    const p = this.plugin;
    const b = h(parent, "div", "planfold-banner");
    h(b, "strong", "", L("This note was written before Planfold.", "这篇笔记是在安装 Planfold 之前写的。"));
    h(b, "p", "planfold-muted", L(`Add the Planfold sections (${[this.plugin.todoLabel(), ...(p.settings.templates[scope] || []).map((f) => f.label)].join(", ")}) at the end? What you wrote stays exactly as it is.`, `要在文末加入 Planfold 的段落（${[this.plugin.todoLabel(), ...(p.settings.templates[scope] || []).map((f) => f.label)].join("、")}）吗？你写过的内容不会改动。`));
    const row = h(b, "div", "planfold-row");
    button(row, L("Add Planfold sections", "加入 Planfold 段落"), "is-primary", async () => { await p.appendPlanfold(note.file, scope); p.dayCache.delete(note.path); setTimeout(() => this.render(), 150); });
    button(row, L("Not for this note", "这篇不用"), "", async () => { p.settings.oldNoteSkip.push(note.path); await p.saveSettings(); this.render(); });
    button(row, L("Always add automatically", "以后自动加入"), "planfold-link", async () => { p.settings.oldNotes = "always"; await p.saveSettings(); await p.appendPlanfold(note.file, scope); setTimeout(() => this.render(), 150); });
  },

  moodRow(parent, d) {
    const p = this.plugin;
    if (!p.settings.askMood) return;
    const mood = parseInt(p.fm(p.fileFor("day", d))[MOOD_KEY]) || 0;
    const row = h(parent, "div", "planfold-note-row planfold-mood-row");
    h(row, "span", "planfold-label", L("Mood", "心情"));
    const r = h(row, "div", "planfold-mood-right");
    moodDots(r, mood, async (v) => { await p.setMood(d, v); setTimeout(() => this.render(), 150); }, "ff"); // same dots as Home
  },

  async habitGrid(parent, d) {
    const p = this.plugin, habits = p.habits();
    const box = h(parent, "div", "planfold-note-row planfold-habit-box");
    const head = h(box, "div", "planfold-habit-head");
    h(head, "span", "planfold-label", L("Habits", "习惯"));
    if (!habits.length) { button(box, L("Add your first habit", "添加第一个习惯"), "planfold-link", () => this.openSettings("habits")); return; }
    if (moment(d).isAfter(moment(), "day")) box.addClass("is-future");
    const fm = p.fm(p.fileFor("day", d));
    const ws = moment(d).startOf("isoWeek"), we = ws.clone().add(6, "day");
    const week = await p.rangeInfo(ws, we);
    const g2 = h(box, "div", "planfold-habit-grid");
    for (const g of habits) {
      const on = p.habitDone(fm, g);
      const b = h(g2, "button", "planfold-habit" + (on ? " is-done" : ""));
      b.type = "button";
      h(b, "span", "planfold-check" + (on ? " is-on" : ""));
      h(b, "span", "planfold-habit-name", g.name);
      const count = week.filter((x) => x.habits[g.key]).length;
      const target = Math.max(1, Math.min(7, parseInt(g.target) || 7));
      h(b, "span", "planfold-habit-week" + (count >= target ? " is-met" : ""), `${count}/${target}`);
      if (moment(d).isAfter(moment(), "day")) { b.disabled = true; continue; }
      b.addEventListener("click", async () => { await p.setHabit(d, g, !on); setTimeout(() => this.render(), 150); });
    }
  },

  fieldBox(parent, scope, anchor, f, value) {
    const p = this.plugin;
    const box = h(parent, "div", "planfold-note-row planfold-field");
    const lab = h(box, "label", "planfold-label", f.label);
    lab.id = `planfold-field-${scope}-${f.id}`;
    const ta = h(box, "textarea", "planfold-field-input");
    ta.id = lab.id + "-input"; lab.htmlFor = ta.id;
    const preview = h(box, "div", "planfold-field-preview markdown-rendered");
    ta.rows = 1;
    ta.placeholder = f.hint || "";
    ta.value = value;
    autosize(ta);
    // `saved` = what the note holds for this field as far as this editor knows; the conflict check compares against it
    let saved = value, chain = Promise.resolve();
    const showEditor = () => {
      preview.hidden = true;
      ta.hidden = false;
      autosize(ta);
      ta.focus();
      ta.setSelectionRange(ta.value.length, ta.value.length);
    };
    const showPreview = async () => {
      const markdown = ta.value.replace(/\s+$/, "");
      if (!markdown) { preview.hidden = true; ta.hidden = false; return; }
      preview.empty();
      try { await MarkdownRenderer.render(p.app, markdown, preview, p.pathFor(scope, anchor), this); }
      catch (e) { preview.setText(markdown); }
      ta.hidden = true;
      preview.hidden = false;
    };
    // Saves run one after another. While you type they happen a second after you pause (so switching apps on a phone
    // loses nothing), and again when you leave the field or close Planfold.
    const write = () => (chain = chain.then(async () => {
      const v = ta.value.replace(/\s+$/, "");
      if (v === saved.replace(/\s+$/, "")) return;
      try {
        const r = await p.writeField(scope, anchor, f, v, saved);
        saved = r.value;
        if (r.value !== v && ta.value.replace(/\s+$/, "") === v) { ta.value = r.value; autosize(ta); } // show what was merged in
      } catch (e) {
        console.error("Planfold: saving a section failed", e);
        new Notice(L("Couldn't save this section. Your text is still here.", "这一段没保存成功，内容还在输入框里。"));
      }
    }));
    const soon = debounce(write, 1000);
    const save = async () => { await write(); if (document.activeElement !== ta) await showPreview(); };
    this._flush = this._flush || new Set();
    this._flush.add(write);
    ta.addEventListener("input", () => { autosize(ta); soon(); });
    ta.addEventListener("blur", save);
    ta.addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); ta.blur(); } });
    preview.tabIndex = 0;
    preview.setAttr("role", "button");
    preview.setAttr("aria-labelledby", lab.id); // not aria-label: Obsidian turns that into a hover tooltip
    preview.addEventListener("click", (e) => { if (!e.target.closest("a")) showEditor(); });
    preview.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); showEditor(); } });
    showPreview();
  },
});

/* =====================================================================
   Review (read-only): Month and Year
   ===================================================================== */
function modeMood(list) {
  const c = [0, 0, 0, 0, 0, 0];
  list.forEach((x) => { if (x.mood) c[x.mood]++; });
  const n = c.reduce((a, b) => a + b, 0);
  if (n < 3) return 0;
  let best = 0;
  for (let i = 1; i <= 5; i++) if (c[i] >= c[best]) best = i; // tie → higher
  return c[best] >= 2 ? best : 0; // three different moods once each says nothing
}
const goodShare = (list) => { const m = list.filter((x) => x.mood); return m.length ? m.filter((x) => x.mood >= 4).length / m.length : 0; };
function longestRun(bools) { let best = 0, cur = 0; for (const b of bools) { cur = b ? cur + 1 : 0; best = Math.max(best, cur); } return best; }
function habitGoal(list, g) {
  const target = Math.max(1, Math.min(7, parseInt(g.target) || 7));
  const weeks = {};
  list.forEach((x) => { const k = x.d.format("GGGG-[W]WW"); (weeks[k] = weeks[k] || []).push(x); });
  const expected = Object.values(weeks).reduce((sum, days) => sum + Math.min(target, days.length), 0);
  const done = list.filter((x) => x.habits[g.key]).length;
  return { target, expected, done, rate: expected ? Math.min(1, done / expected) : 0 };
}
/** Results first: one main number with a plain sentence, then up to three quieter facts. */
function summary(parent, main, facts) {
  const box = h(parent, "div", "planfold-summary");
  const m = h(box, "div", "planfold-summary-main");
  const big = h(m, "div", "planfold-summary-big");
  h(big, "span", "planfold-summary-num", main.num);
  h(big, "span", "planfold-summary-of", main.of);
  const bar = h(m, "div", "planfold-bar is-summary");
  h(bar, "span").style.width = `${Math.round(Math.max(0, Math.min(1, main.rate)) * 100)}%`;
  h(m, "p", "planfold-summary-line", main.line);
  const list = h(box, "div", "planfold-summary-facts");
  for (const f of facts) {
    const r = h(list, "div", "planfold-fact");
    h(r, "div", "planfold-fact-label", f.label);
    const v = h(r, "div", "planfold-fact-value");
    if (f.dot) h(v, "span", `planfold-dot m${f.dot} is-static`);
    if (f.value) h(v, "span", "", f.value);
    if (!f.dot && !f.value) h(v, "span", "planfold-fact-none", "—");
    if (typeof f.sub === "function") f.sub(h(r, "div", "planfold-fact-sub"));
    else if (f.sub) h(r, "div", "planfold-fact-sub", f.sub);
  }
  return box;
}
/** Nothing recorded yet: say what will appear here and offer the one next step. */
function emptyState(view, parent, title, text, action, label) {
  const e = h(parent, "div", "planfold-empty-state");
  h(e, "h2", "planfold-empty-title", title);
  h(e, "p", "planfold-empty-text", text);
  if (action) button(e, label, "is-primary", action);
  return e;
}

Object.assign(PlanfoldView.prototype, {
  async renderReview(inner) {
    const st = this.rv;
    periodHeader(this, inner, st.scope, st.anchor, ["month", "year"], (sc, m) => { st.scope = sc; st.anchor = m; st.selected = null; st.shelf = 0; this.render(); });
    if (st.scope === "month") await this.reviewMonth(inner);
    else await this.reviewYear(inner);
  },

  /* ---------------- Month ---------------- */
  async reviewMonth(inner) {
    const p = this.plugin, st = this.rv, today = moment();
    const ms = moment(st.anchor).startOf("month"), me = ms.clone().endOf("month"), dim = ms.daysInMonth();
    const days = await p.rangeInfo(ms, me);
    const past = days.filter((x) => !x.d.isAfter(today, "day"));
    const n = past.length, habits = p.habits();
    const isCur = ms.isSame(today, "month");

    const logged = past.filter((x) => x.logged).length;
    if (!logged && !past.some((x) => x.exists)) {
      emptyState(this, inner, isCur ? L("Nothing recorded this month yet", "这个月还没有记录") : L("Nothing was recorded this month", "这个月没有记录"),
        L("Write a to-do, tick a habit or pick a mood in Note. Your month will start to appear here the same day.", "在「记录」里写一条待办、勾一个习惯或点一下心情，当天这里就会开始出现你的这个月。"),
        isCur ? () => this.go("planner", { scope: "day", anchor: moment() }) : null, L("Start today's note", "开始今天的记录"));
      return;
    }
    const streak = longestRun(past.map((x) => x.logged));
    const mm = modeMood(past);
    let bestH = null;
    for (const g of habits) { const goal = habitGoal(past, g); if (!bestH || goal.rate > bestH.goal.rate) bestH = { g, goal }; }
    const weeks = {};
    past.forEach((x) => { const k = x.d.format("GGGG-[W]WW"); (weeks[k] = weeks[k] || []).push(x); });
    let bw = null;
    for (const [k, list] of Object.entries(weeks)) { const md = list.filter((x) => x.mood); if (md.length < 3) continue; const sh = goodShare(list); if (!bw || sh > bw.sh) bw = { k, sh, list, d: list[0].d }; }
    summary(inner, {
      num: String(logged),
      of: isCur ? L(` / ${n} days recorded so far`, ` / ${n} 天有记录`) : L(` / ${n} days recorded`, ` / ${n} 天有记录`),
      rate: n ? logged / n : 0,
      line: (isCur ? L(`${dim - n} days left this month. `, `这个月还剩 ${dim - n} 天。`) : "") + L(`Longest streak: ${streak} ${streak === 1 ? "day" : "days"}.`, `最长连续 ${streak} 天。`),
    }, [
      { label: L("Mostly", "大多是"), dot: mm, sub: L(`${past.filter((x) => x.mood).length} days with a mood`, `${past.filter((x) => x.mood).length} 天记了心情`) },
      { label: L("Most consistent", "最稳定的习惯"), value: bestH && bestH.goal.done ? bestH.g.name : "", sub: bestH && bestH.goal.done ? L(`${Math.round(bestH.goal.rate * 100)}% of target`, `达到目标的 ${Math.round(bestH.goal.rate * 100)}%`) : "" },
      { label: L("Best week", "最好的一周"), value: bw ? L(`Week ${bw.d.isoWeek()}`, `第 ${bw.d.isoWeek()} 周`) : "", sub: bw ? (el) => { el.addClass("planfold-dots", "is-tiny"); bw.list.forEach((x) => h(el, "span", x.mood ? `planfold-dot m${x.mood} is-static is-tiny` : "planfold-dot is-static is-tiny is-empty")); } : "" },
    ]);

    /* habits — hidden until there is at least one */
    if (habits.length) {
      const hs = section(inner, L("Habits", "习惯"));
      const table = h(hs.wrap, "div", "planfold-panel planfold-habit-table");
      for (const g of habits) {
        const row = h(table, "div", "planfold-habit-row");
        const nm = h(row, "div", "planfold-habit-cell-name");
        h(nm, "div", "planfold-habit-title", g.name);
        const goal = habitGoal(past, g);
        const sq = h(row, "div", "planfold-habit-squares");
        for (const x of days) {
          const s = h(sq, "span", "planfold-square" + (x.habits[g.key] ? " is-on" : "") + (x.d.isAfter(today, "day") ? " is-future" : "") + (x.d.isSame(today, "day") ? " is-today" : ""));
          s.title = `${dateFmt.short(x.d)}${x.habits[g.key] ? " ✓" : ""}`;
        }
        h(row, "div", "planfold-habit-spacer");
        const sc = h(row, "div", "planfold-habit-score");
        // one short line: done / target (the word "target" sits in the tooltip, so the row stays one line high)
        const big = h(sc, "div", "planfold-habit-big");
        h(big, "span", "", goal.done);
        h(big, "span", "planfold-pattern-of", `/${goal.expected}`);
        sc.title = L(`${goal.done} of ${goal.expected} (this month's target)`, `${goal.done} / ${goal.expected}（本月目标）`);
        const bar = h(sc, "div", "planfold-bar");
        h(bar, "span").style.width = `${Math.round(goal.rate * 100)}%`;
      }
    }

    /* calendar + detail */
    const cg = h(inner, "div", "planfold-month-grid");
    const calWrap = h(cg, "div", "planfold-month-cal-wrap");
    const cal = h(calWrap, "div", "planfold-panel planfold-month-cal");
    // rows start on the day set in Settings (like Home); the W column is still the ISO week (Mon–Sun) of each row
    const sunday = p.settings.weekStart === "sunday";
    const rowStart = (m) => rowStartOf(m, sunday);
    const dows = [0, 1, 2, 3, 4, 5, 6].map((i) => dateFmt.weekday(rowStart(moment()).add(i, "day")));
    dows.forEach((t) => h(cal, "div", "planfold-mc-dow", t));
    h(cal, "div", "planfold-mc-dow is-week", L("Week", "周"));
    if (!st.selected || !moment(st.selected.d || st.selected).isSame(ms, "month")) {
      const def = isCur ? days[today.date() - 1] : (days.filter((x) => x.logged).pop() || days[0]);
      st.selected = { kind: "day", d: def.d.clone() };
    }
    let cursor = rowStart(ms);
    const last = rowStart(me).add(6, "day");
    while (!cursor.isAfter(last, "day")) {
      const wkStart = cursor.clone().add(sunday ? 1 : 0, "day"); // the row's Monday → its weekly note
      for (let i = 0; i < 7; i++) {
        const d = cursor.clone();
        if (!d.isSame(ms, "month")) { h(cal, "div", "planfold-mc-day is-blank"); cursor.add(1, "day"); continue; }
        const x = days[d.date() - 1];
        const cell = h(cal, "button", "planfold-mc-day");
        cell.type = "button";
        if (d.isAfter(today, "day")) cell.addClass("is-future");
        if (x.logged) cell.addClass("is-logged");
        if (d.isSame(today, "day")) cell.addClass("is-today");
        if (st.selected.kind === "day" && d.isSame(st.selected.d, "day")) cell.addClass("is-selected");
        const top = h(cell, "div", "planfold-mc-top");
        h(top, "span", "planfold-mc-num", d.date());
        if (x.mood || x.starred) {
          const marks = h(top, "span", "planfold-mc-marks");
          if (x.mood) h(marks, "span", `planfold-dot m${x.mood} is-static is-tiny`).title = L(`Mood ${x.mood} of 5`, `心情 ${x.mood} / 5`);
          if (x.starred) { const star = h(marks, "span", "planfold-mc-star"); star.title = L("Most important to-do", "当天有最重要待办"); try { setIcon(star, "star"); } catch (e) {} }
        }
        if (x.first) h(cell, "div", "planfold-mc-text", x.first);
        if (habits.length && x.exists) { const hb = h(cell, "div", "planfold-mc-habits"); habits.forEach((g) => h(hb, "span", "planfold-square is-mini" + (x.habits[g.key] ? " is-on" : ""))); }
        cell.addEventListener("click", () => { st.selected = { kind: "day", d: d.clone() }; this.render(); });
        cursor.add(1, "day");
      }
      const wf = p.fileFor("week", wkStart);
      const wc = h(cal, "button", "planfold-mc-week" + (st.selected.kind === "week" && wkStart.isSame(st.selected.d, "day") ? " is-selected" : ""));
      wc.type = "button";
      h(wc, "span", "planfold-hint", `W${wkStart.isoWeek()}`);
      h(wc, "span", "planfold-square" + (wf ? " is-on" : ""));
      wc.title = wf ? L("Weekly review written", "已写周复盘") : L("No weekly review", "还没有周复盘");
      wc.addEventListener("click", () => { st.selected = { kind: "week", d: wkStart.clone() }; this.render(); });
    }
    cal.title = L("Each day: mood and the first Daily section. Squares are habits.", "每天：心情和日记的第一个段落；小方格是习惯。");
    await this.reviewDetail(h(cg, "div", "planfold-panel planfold-detail"), days);

    /* monthly review */
    await this.reviewNote(inner, "month", ms);
  },

  async reviewDetail(panel, days) {
    const p = this.plugin, sel = this.rv.selected, habits = p.habits();
    if (sel.kind === "week") {
      const s = moment(sel.d), note = await p.readNote("week", s);
      h(panel, "div", "planfold-label", L("Weekly note", "周笔记"));
      h(panel, "h3", "planfold-detail-title", scopeTitle("week", s));
      const wd = (await p.rangeInfo(s, s.clone().add(6, "day")));
      const row = h(panel, "div", "planfold-detail-week");
      wd.forEach((x) => { const c = h(row, "span", "planfold-detail-wday"); h(c, "span", "planfold-hint", dateFmt.weekday(x.d)); h(c, "span", x.mood ? `planfold-dot m${x.mood} is-static is-tiny` : "planfold-dot is-static is-tiny is-empty"); });
      for (const f of p.settings.templates.week || []) { const b = h(panel, "div", "planfold-detail-field"); h(b, "div", "planfold-label", f.label); h(b, "div", "planfold-detail-text" + (note.fields[f.id] ? "" : " is-empty"), plain(note.fields[f.id]) || "—"); }
      button(panel, L("Edit", "编辑"), "planfold-link", () => this.go("planner", { scope: "week", anchor: s }));
      return;
    }
    const d = moment(sel.d);
    const x = await p.dayInfo(d);
    const dt = h(panel, "h3", "planfold-detail-title", LANG === "zh" ? d.format("M月D日") : d.format("MMMM D"));
    h(dt, "span", "planfold-detail-weekday", dateFmt.weekday(d));
    if (!x.exists) { h(panel, "p", "planfold-muted", d.isAfter(moment(), "day") ? L("Not here yet.", "还没到这一天。") : L("Nothing written this day.", "这天没有记录。")); }
    else {
      const m = h(panel, "div", "planfold-detail-mood");
      if (x.mood) { h(m, "span", `planfold-dot m${x.mood} is-static`); } else h(m, "span", "planfold-muted", L("No mood", "没记心情"));
      if (habits.length) { const hl = h(panel, "div", "planfold-detail-habits"); habits.forEach((g) => { const r = h(hl, "div", "planfold-detail-habit" + (x.habits[g.key] ? "" : " is-off")); h(r, "span", "planfold-square is-mini" + (x.habits[g.key] ? " is-on" : "")); h(r, "span", "", g.name); }); }
      if (x.todo) h(panel, "div", "planfold-hint", L(`To-do ${x.todoDone}/${x.todo}`, `待办 ${x.todoDone}/${x.todo}`));
      for (const f of p.settings.templates.day || []) { const b = h(panel, "div", "planfold-detail-field"); h(b, "div", "planfold-label", f.label); h(b, "div", "planfold-detail-text" + (x.fields[f.id] ? "" : " is-empty"), plain(x.fields[f.id]) || "—"); }
    }
    button(panel, L("Edit", "编辑"), "planfold-link", () => this.go("planner", { scope: "day", anchor: d }));
  },

  async reviewNote(inner, scope, m) {
    const p = this.plugin, note = await p.readNote(scope, m);
    const s = section(inner, scope === "month" ? L("Monthly note", "月笔记") : L("Yearly note", "年笔记"), (r) => button(r, L("Edit", "编辑"), "planfold-link", () => this.go("planner", { scope, anchor: m })));
    const fields = p.settings.templates[scope] || [];
    const any = fields.some((f) => String(note.fields[f.id] || "").trim());
    if (!any) { h(s.wrap, "div", "planfold-panel planfold-empty is-center", scope === "month" ? L("Nothing written for this month yet.", "这个月还没写复盘。") : L("Nothing written for this year yet.", "今年还没写复盘。")); return; }
    const box = h(s.wrap, "div", "planfold-panel planfold-reflect");
    box.style.setProperty("--cols", String(Math.min(fields.length, 3)));
    for (const f of fields) { const c = h(box, "div", "planfold-reflect-col"); h(c, "div", "planfold-label", f.label); h(c, "div", "planfold-reflect-text" + (note.fields[f.id] ? "" : " is-empty"), plain(note.fields[f.id]) || "—"); }
  },

  /* ---------------- Year ---------------- */
  async reviewYear(inner) {
    const p = this.plugin, st = this.rv, today = moment();
    const ys = moment(st.anchor).startOf("year"), ye = ys.clone().endOf("year");
    const days = await p.rangeInfo(ys, ye);
    const past = days.filter((x) => !x.d.isAfter(today, "day"));
    const n = past.length, habits = p.habits(), isCur = ys.isSame(today, "year");
    const byMonth = Array.from({ length: 12 }, (_, i) => days.filter((x) => x.d.month() === i));

    const logged = past.filter((x) => x.logged).length;
    if (!logged && !past.some((x) => x.exists)) {
      emptyState(this, inner, L("Nothing recorded this year yet", "今年还没有记录"), L("Each day you write in Note adds a dot here. Start with today.", "你在「记录」里写下的每一天，都会在这里留下一个点。从今天开始。"), () => this.go("planner", { scope: "day", anchor: moment() }), L("Start today's note", "开始今天的记录"));
      return;
    }
    const mm = modeMood(past);
    let bm = null;
    byMonth.forEach((list, i) => { const md = list.filter((x) => x.mood); if (md.length < 3) return; const sh = goodShare(list); if (!bm || sh > bm.sh) bm = { i, sh }; });
    let bestH = null;
    for (const g of habits) { const goal = habitGoal(past, g); if (!bestH || goal.rate > bestH.goal.rate) bestH = { g, goal }; }
    const streak = longestRun(past.map((x) => x.logged));
    summary(inner, {
      num: String(logged), of: L(` / ${n} days recorded`, ` / ${n} 天有记录`), rate: n ? logged / n : 0,
      line: L(`Longest streak: ${streak} ${streak === 1 ? "day" : "days"}.`, `最长连续 ${streak} 天。`),
    }, [
      { label: L("Mostly", "大多是"), dot: mm, sub: L(`${past.filter((x) => x.mood).length} days with a mood`, `${past.filter((x) => x.mood).length} 天记了心情`) },
      { label: L("Best month", "最好的月份"), value: bm ? dateFmt.monthName(moment().month(bm.i)) : "", sub: bm ? L(`${byMonth[bm.i].filter((x) => x.mood).length} days with a mood`, `${byMonth[bm.i].filter((x) => x.mood).length} 天记了心情`) : "" },
      { label: L("Most consistent", "最稳定的习惯"), value: bestH && bestH.goal.done ? bestH.g.name : "", sub: bestH && bestH.goal.done ? L(`${Math.round(bestH.goal.rate * 100)}% of target`, `达到目标的 ${Math.round(bestH.goal.rate * 100)}%`) : "" },
    ]);

    /* habits: number-first tiles, a shelf when there are more than fit in a row */
    const per = { wide: 3, medium: 2, narrow: 1 }[this.root.dataset.w || "wide"];
    const hs = section(inner, L("Habits", "习惯"), (r) => {
      if (habits.length <= per) return;
      const max = Math.max(0, habits.length - per);
      st.shelf = Math.min(st.shelf, max);
      const pv = h(r, "button", "planfold-icon-btn"); pv.type = "button"; pv.setAttr("aria-label", L("Previous habits", "上一组习惯")); try { setIcon(pv, "chevron-left"); } catch (e) {}
      h(r, "span", "planfold-hint", L(`${st.shelf + 1}–${Math.min(st.shelf + per, habits.length)} of ${habits.length}`, `${st.shelf + 1}–${Math.min(st.shelf + per, habits.length)} / 共 ${habits.length} 个`));
      const nx = h(r, "button", "planfold-icon-btn"); nx.type = "button"; nx.setAttr("aria-label", L("Next habits", "下一组习惯")); try { setIcon(nx, "chevron-right"); } catch (e) {}
      pv.disabled = st.shelf === 0; nx.disabled = st.shelf >= max;
      pv.addEventListener("click", () => { st.shelf = Math.max(0, st.shelf - per); this.render(); });
      nx.addEventListener("click", () => { st.shelf = Math.min(max, st.shelf + per); this.render(); });
    });
    if (!habits.length) hs.wrap.remove(); // nothing to show yet — no empty box
    else {
      const row = h(hs.wrap, "div", "planfold-year-tiles");
      row.style.setProperty("--per", String(per));
      for (const g of habits.slice(st.shelf, st.shelf + per)) {
        const t = h(row, "div", "planfold-panel planfold-year-tile");
        const goal = habitGoal(past, g), c = goal.done;
        const lt = h(t, "div", "planfold-yt-left");
        const big = h(lt, "div", "planfold-yt-big"); h(big, "span", "", Math.round(goal.rate * 100)); h(big, "span", "planfold-pattern-of", "%");
        const nm = h(lt, "div", "planfold-yt-name");
        h(nm, "div", "planfold-habit-title", g.name);
        let best = null;
        byMonth.forEach((list, i) => { const cc = list.filter((x) => x.habits[g.key]).length; if (cc && (!best || cc > best.c)) best = { i, c: cc, run: longestRun(list.map((x) => x.habits[g.key])) }; });
        h(nm, "div", "planfold-hint", best ? L(`Target ${goal.target}/week · best: ${dateFmt.monthName(moment().month(best.i))}`, `目标每周 ${goal.target} 天 · 最佳：${dateFmt.monthName(moment().month(best.i))}`) : L(`Target ${goal.target} days/week`, `目标每周 ${goal.target} 天`));
        const chart = h(t, "div", "planfold-yt-chart");
        byMonth.forEach((list, i) => {
          const col = h(chart, "div", "planfold-yt-col");
          const cells = h(col, "div", "planfold-yt-cells");
          for (let k = 0; k < 31; k++) { const x = list[k]; h(cells, "span", "planfold-square is-micro" + (!x ? " is-none" : x.habits[g.key] ? " is-on" : x.d.isAfter(today, "day") ? " is-future" : "")); }
          // 5: label every third month only, so the ticks never run together
          h(col, "span", "planfold-yt-m", i % 3 === 0 ? (LANG === "zh" ? `${i + 1}月` : moment().month(i).format("MMM")) : "");
        });
      }
    }

    /* moods + month by month */
    const two = h(inner, "div", "planfold-year-two");
    const ms = section(two, L("Moods", "心情"), (r) => { h(r, "span", "planfold-hint", L("Low", "低")); const lg = h(r, "span", "planfold-dots is-static is-tiny"); for (let i = 1; i <= 5; i++) h(lg, "span", `planfold-dot m${i} is-static is-tiny`); h(r, "span", "planfold-hint", L("High", "高")); });
    const mg = h(ms.wrap, "div", "planfold-panel planfold-mood-grid");
    byMonth.forEach((list, i) => {
      const r = h(mg, "div", "planfold-mood-line");
      h(r, "span", "planfold-hint planfold-mood-m", dateFmt.monthShort(i));
      const dots = h(r, "div", "planfold-mood-dots");
      list.forEach((x) => { const dd = h(dots, "span", x.mood ? `planfold-dot m${x.mood} is-static is-tiny` : "planfold-dot is-static is-tiny " + (x.d.isAfter(today, "day") ? "is-future" : "is-empty")); dd.title = dateFmt.short(x.d); });
    });
    const mbs = section(two, L("Month by month", "逐月"));
    const list = h(mbs.wrap, "div", "planfold-panel planfold-mbm");
    for (let i = 0; i < 12; i++) {
      const mStart = ys.clone().month(i);
      const md = byMonth[i], lg = md.filter((x) => x.logged).length, mo = modeMood(md);
      const r = h(list, "button", "planfold-mbm-row" + (mStart.isAfter(today, "month") ? " is-future" : ""));
      r.type = "button";
      h(r, "span", "planfold-mbm-name", dateFmt.monthName(mStart));
      h(r, "span", mo ? `planfold-dot m${mo} is-static is-tiny` : "planfold-dot is-static is-tiny is-none");
      const note = mStart.isAfter(today, "month") ? null : await p.readNote("month", mStart);
      const firstF = (p.settings.templates.month || [])[0];
      const line = note && firstF ? firstLine(plain(note.fields[firstF.id])) : "";
      const facts = lg ? L(`${lg} days logged`, `记录 ${lg} 天`)  : "";
      h(r, "span", "planfold-mbm-text" + (line ? "" : " is-facts"), line || facts);
      h(r, "span", "planfold-hint planfold-mbm-facts", line ? facts : "");
      r.addEventListener("click", () => { st.scope = "month"; st.anchor = mStart; st.selected = null; this.render(); });
    }

    await this.reviewNote(inner, "year", ys);
  },
});

/* =====================================================================
   Onboarding, project picker, folder list
   ===================================================================== */
const HABIT_SUGGEST = () => L("Read,Exercise,Sleep early,Meditate,Drink water,Write", "读书,运动,早睡,冥想,喝水,写作").split(",");

class QuickCaptureModal extends Modal {
  constructor(app, plugin) { super(app); this.plugin = plugin; this.saving = false; }
  onOpen() {
    this.modalEl.addClass("planfold-modal", "planfold-capture-modal");
    this.titleEl.setText(L("Quick capture", "快速记录"));
    const c = this.contentEl;
    const ta = h(c, "textarea", "planfold-capture-input");
    ta.rows = 5;
    ta.placeholder = L("What's on your mind?", "想到什么？");
    const target = this.plugin.quickCaptureField();
    h(c, "div", "planfold-hint planfold-capture-target", L(`Today · ${target.label}`, `今天 · ${target.label}`));
    const foot = h(c, "div", "planfold-ob-foot");
    button(foot, L("Cancel", "取消"), "", () => this.close());
    h(foot, "span", "planfold-grow");
    const save = button(foot, L("Save", "保存"), "is-primary", async () => {
      if (this.saving || !ta.value.trim()) return;
      this.saving = true; save.disabled = true;
      try {
        await this.plugin.appendQuickCapture(ta.value);
        new Notice(L("Saved to today's note", "已保存到今日日记"));
        this.close();
      } catch (e) {
        console.error("Planfold: quick capture failed", e);
        new Notice(L("Couldn't save. Your text is still here.", "保存失败，内容仍保留在输入框中。"));
        this.saving = false; save.disabled = false;
      }
    });
    ta.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !e.isComposing) { e.preventDefault(); save.click(); }
    });
    setTimeout(() => ta.focus(), 80);
  }
  onClose() { this.contentEl.empty(); }
}

class MobileCaptureSetupModal extends Modal {
  constructor(app, plugin) { super(app); this.plugin = plugin; }
  icon(parent, name, cls) {
    const el = h(parent, "span", cls || "");
    try { setIcon(el, name); } catch (e) {}
    return el;
  }
  step(parent, n, title, desc, kind, draw) {
    const card = h(parent, "section", "planfold-guide-step");
    const head = h(card, "div", "planfold-guide-step-head");
    h(head, "span", "planfold-guide-num", String(n));
    h(head, "h4", "planfold-guide-title", title);
    if (desc) h(card, "p", "planfold-guide-desc", desc);
    const scene = h(card, "div", `planfold-ios planfold-ios-${kind}`);
    draw(scene, card);
    return card;
  }
  shortcutHead(scene, title) {
    const head = h(scene, "div", "planfold-ios-editor-head");
    this.icon(head, "chevron-left", "planfold-ios-round planfold-ios-back");
    const center = h(head, "div", "planfold-ios-editor-name");
    h(center, "span", "planfold-ios-app-icon is-safari");
    h(center, "strong", "", title);
    this.icon(center, "chevron-down", "planfold-ios-down");
    return head;
  }
  actionCard(scene, value, selected) {
    const row = h(scene, "div", "planfold-ios-action");
    this.icon(row, "arrow-up-right", "planfold-ios-action-icon");
    h(row, "strong", "", "Open");
    h(row, "span", "planfold-ios-url-token" + (selected ? " is-selected" : ""), value || "URL");
    this.icon(row, "x", "planfold-ios-action-x");
    return row;
  }
  editorToolbar(scene, shareOn) {
    const bar = h(scene, "div", "planfold-ios-toolbar");
    const search = h(bar, "div", "planfold-ios-toolbar-search");
    this.icon(search, "search"); h(search, "span", "", "Search Actions"); this.icon(search, "mic");
    const icons = h(bar, "div", "planfold-ios-toolbar-icons");
    this.icon(icons, "undo-2");
    this.icon(icons, "redo-2", "is-disabled");
    this.icon(icons, "info");
    this.icon(icons, "share", shareOn ? "is-target" : "");
    this.icon(icons, "play");
  }
  onOpen() {
    this.modalEl.addClass("planfold-modal", "planfold-mobile-setup");
    this.titleEl.setText(L("Mobile quick capture", "手机快速记录"));
    const c = this.contentEl;
    h(c, "p", "planfold-guide-intro", L("Set this up once, then open today's capture field from your Home Screen with one tap.", "只需设置一次，以后就能从主屏幕一键打开今天的记录框。"));
    const grid = h(c, "div", "planfold-guide-grid");

    this.step(grid, 1, L("Create a shortcut", "新建快捷指令"), L("Open Shortcuts and tap +.", "打开「快捷指令」，点击右上角 +。"), "library", (s) => {
      const top = h(s, "div", "planfold-ios-library-top");
      this.icon(top, "chevron-left", "planfold-ios-round");
      const actions = h(top, "div", "planfold-ios-library-actions"); h(actions, "span", "planfold-ios-pill", "Edit"); this.icon(actions, "plus", "planfold-ios-round is-target");
      h(s, "div", "planfold-ios-big-title", "All Shortcuts");
      const tiles = h(s, "div", "planfold-ios-tiles");
      for (const [cls, name] of [["is-gray", "Open URLs"], ["is-green", "Open App"], ["is-orange", "Daily Note"], ["is-yellow", "New Note"]]) { const t = h(tiles, "div", `planfold-ios-tile ${cls}`); h(t, "span", "", name); }
      const tabs = h(s, "div", "planfold-ios-tabs"); for (const [ic, tx] of [["folder", "Library"], ["check-circle", "Automation"], ["layout-grid", "Gallery"]]) { const x = h(tabs, "span", ""); this.icon(x, ic); h(x, "small", "", tx); }
    });

    this.step(grid, 2, L("Search for an action", "点击搜索操作"), L("Tap Search Actions at the bottom.", "点击底部的「搜索操作」。"), "new", (s) => {
      this.shortcutHead(s, "New Shortcut 1");
      h(s, "p", "planfold-ios-empty-copy", "Add actions from below to create a shortcut.");
      const sheet = h(s, "div", "planfold-ios-bottom-sheet"); h(sheet, "span", "planfold-ios-handle");
      const search = h(sheet, "div", "planfold-ios-search is-target"); this.icon(search, "search"); h(search, "span", "", "Search Actions"); this.icon(search, "mic");
      const chips = h(sheet, "div", "planfold-ios-chip-row"); for (const x of ["Sharing", "Documents", "Web"]) h(chips, "span", "", x);
      for (const [ic, tx] of [["message-square", "Send Message"], ["arrow-up-right", "Open App"], ["music", "Play Music"]]) { const row = h(sheet, "div", "planfold-ios-result"); this.icon(row, ic); h(row, "strong", "", tx); }
    });

    this.step(grid, 3, L("Choose Open URLs", "搜索并选择 Open URLs"), L("中文：搜索「网页」 · English: search “URLs”", "中文：搜索「网页」 · English: search “URLs”"), "results", (s) => {
      const search = h(s, "div", "planfold-ios-result-search"); this.icon(search, "search"); h(search, "span", "planfold-ios-search-token", "Web"); this.icon(search, "x-circle"); h(search, "b", "", "Cancel");
      for (const [ic, tx, cls] of [["search", "Search Web", ""], ["arrow-up-right", "Open URLs", " is-target"], ["image", "Find Giphy GIFs", ""]]) { const row = h(s, "div", `planfold-ios-search-result${cls}`); this.icon(row, ic); h(row, "strong", "", tx); this.icon(row, "info"); }
      h(s, "div", "planfold-ios-list-head", "Safari");
      for (const tx of ["Show Web View", "Add to Reading List"]) { const row = h(s, "div", "planfold-ios-search-result is-small"); h(row, "span", "planfold-ios-app-icon is-safari"); h(row, "strong", "", tx); this.icon(row, "info"); }
    });

    this.step(grid, 4, L("Select the URL field", "点击 URL 占位符"), L("Tap the pale URL token.", "点击浅蓝色 URL 占位符。"), "editor", (s) => {
      this.shortcutHead(s, "Open URLs 1"); this.actionCard(s, "", false); this.editorToolbar(s, false);
    });

    const paste = this.step(grid, 5, L("Paste the Planfold URL", "粘贴 Planfold 地址"), L("Paste the copied address into the URL field.", "把复制的地址粘贴到 URL 字段。"), "keyboard", (s) => {
      this.shortcutHead(s, "Open URLs 1"); this.actionCard(s, "obsidian://planfold-capture", false);
      const suggest = h(s, "div", "planfold-ios-suggest"); h(suggest, "span", "", "Select Variable"); h(suggest, "span", "", "Ask Each Time"); this.icon(suggest, "x");
      const kb = h(s, "div", "planfold-ios-keyboard");
      for (const ch of "qwertyuiopasdfghjklzxcvbnm") h(kb, "span", "", ch);
      h(kb, "span", "is-wide", "123"); h(kb, "span", "is-space", ""); h(kb, "span", "is-done", "✓");
    });
    const row = h(paste, "div", "planfold-shortcut-url-row");
    const url = h(row, "input", "planfold-shortcut-url");
    url.type = "text";
    url.readOnly = true;
    url.value = "obsidian://planfold-capture";
    button(row, L("Copy URL", "复制 URL"), "is-primary", async () => {
      let copied = false;
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(url.value);
          copied = true;
        }
      } catch (e) {}
      if (!copied) {
        url.focus(); url.select();
        try { copied = !!document.execCommand("copy"); } catch (e) {}
      }
      new Notice(copied ? L("Shortcut URL copied", "快捷 URL 已复制") : L("URL selected — choose Copy", "URL 已选中，请选择复制"));
    });

    this.step(grid, 6, L("Share the shortcut", "点击分享"), L("Close the keyboard, then tap Share.", "收起键盘，再点击底部分享。"), "editor", (s) => {
      this.shortcutHead(s, "Open URLs 1"); this.actionCard(s, "obsidian://planfold-capture", true); this.editorToolbar(s, true);
    });

    this.step(grid, 7, L("Add to Home Screen", "添加到主屏幕"), L("Choose Add to Home Screen in the share sheet.", "在分享面板选择「添加到主屏幕」。"), "share", (s) => {
      const behind = h(s, "div", "planfold-ios-share-behind"); this.actionCard(behind, "obsidian://planfold-capture", true);
      const sheet = h(s, "div", "planfold-ios-share-sheet"); h(sheet, "span", "planfold-ios-handle");
      const info = h(sheet, "div", "planfold-ios-share-info"); h(info, "span", "planfold-ios-app-icon is-safari"); const it = h(info, "div", ""); h(it, "strong", "", "Open URLs 1"); h(it, "span", "", "Options ›");
      const people = h(sheet, "div", "planfold-ios-people"); for (const tx of ["MacBook", "Messages", "Mail"]) { const p = h(people, "span", ""); h(p, "i"); h(p, "small", "", tx); }
      const actions = h(sheet, "div", "planfold-ios-share-actions");
      for (const [ic, tx, cls] of [["link", "Copy iCloud Link", ""], ["plus-square", "Add to Home Screen", " is-target"], ["square-pen", "Add to Quick Note", ""], ["chevron-down", "View More", ""]]) { const a = h(actions, "span", cls); this.icon(a, ic); h(a, "small", "", tx); }
    });

    this.step(grid, 8, L("Tap Add", "点击 Add"), L("Confirm the icon with Add.", "点击右上角「添加 / Add」。"), "homescreen", (s) => {
      const nav = h(s, "div", "planfold-ios-home-nav"); h(nav, "span", "planfold-ios-pill", "Cancel"); h(nav, "strong", "", "Home Screen"); h(nav, "span", "planfold-ios-pill is-blue is-target", "Add");
      const preview = h(s, "div", "planfold-ios-home-preview"); h(preview, "span", "planfold-ios-shortcuts-logo"); h(preview, "small", "", "Open URLs 1");
      const seg = h(s, "div", "planfold-ios-home-seg"); h(seg, "span", "", "Image"); h(seg, "span", "is-on", "Symbol");
      const colors = h(s, "div", "planfold-ios-colors"); for (let i = 0; i < 15; i++) h(colors, "span", `c${i + 1}`);
      const search = h(s, "div", "planfold-ios-symbol-search"); this.icon(search, "search"); h(search, "span", "", "Search Symbols"); this.icon(search, "mic");
    });

    const inside = h(c, "section", "planfold-setup-inline");
    const copy = h(inside, "div", ""); h(copy, "h3", "planfold-h3", L("Inside Obsidian", "在 Obsidian 里"));
    h(copy, "p", "planfold-muted", L("Run “Planfold: Quick capture to today” from the command palette or a configured mobile action.", "也可以从命令面板运行「Planfold: Quick capture to today」，或使用已配置的移动端操作。"));
    button(inside, L("Test quick capture", "测试快速记录"), "", () => { this.close(); new QuickCaptureModal(this.app, this.plugin).open(); });
    h(c, "p", "planfold-guide-done", L("Once complete, the Home Screen icon opens Planfold's capture field directly.", "完成后，点击主屏幕图标就会直接打开 Planfold 记录框。"));
  }
  onClose() { this.contentEl.empty(); }
}

class OnboardingModal extends Modal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
    this.step = 0;
    this.lang = plugin.settings.language || guessLang();
    this.ex = plugin.existingDaily();
    this.where = this.ex.count > 0 && this.ex.enabled ? "keep" : "new";
    this.picked = null;
  }
  async onOpen() {
    this.modalEl.addClass("planfold-modal", "planfold-onboarding");
    await this.plugin.goals();
    this.picked = new Set((this.plugin.goalsCache || []).filter((g) => g.active).map((g) => g.name));
    this.draw();
  }
  draw() {
    LANG = this.lang;
    const c = this.contentEl;
    c.empty();
    const steps = h(c, "div", "planfold-ob-steps");
    for (let i = 0; i < 3; i++) h(steps, "span", "planfold-ob-step" + (i <= this.step ? " is-on" : ""));
    if (this.step === 0) {
      h(c, "h2", "planfold-h2", "Welcome to Planfold · 欢迎使用 Planfold");
      h(c, "p", "planfold-muted", "Choose a language · 选择语言");
      const row = h(c, "div", "planfold-ob-cards is-two");
      for (const [k, t] of [["en", "English"], ["zh", "中文"]]) {
        const b = h(row, "button", "planfold-ob-card" + (this.lang === k ? " is-on" : ""), t); b.type = "button";
        b.addEventListener("click", () => { this.lang = k; this.draw(); });
      }
    } else if (this.step === 1) {
      h(c, "p", "planfold-muted", L("Planfold helps you plan each day, build habits, and look back regularly.", "Planfold 帮你做每日计划、养成习惯，并定期回顾总结。"));
      h(c, "h2", "planfold-h2", L("Where should your daily notes go?", "每天的日记要存在哪里？"));
      h(c, "p", "planfold-muted", L("Planfold makes one note per day for that day's plan and reflection.", "Planfold 每天会建一篇日记，用来写当天的计划和复盘。"));
      const opts = h(c, "div", "planfold-ob-cards");
      const keepTitle = this.ex.folder ? L(`Keep using my ${this.ex.folder}/ folder`, `继续用我现在的 ${this.ex.folder}/ 文件夹`) : L("Keep using my daily notes (vault root)", "继续用我现在的日记（放在库的根目录）");
      if (this.ex.count > 0 && this.ex.enabled) this.option(opts, "keep", keepTitle, L(`${this.ex.count} notes found. Planfold adds its sections only to new notes; old notes stay as they are.`, `找到 ${this.ex.count} 篇日记。Planfold 只在新日记里加入自己的段落，旧日记不会改动。`));
      const tf = this.plugin.settings.migratedFrom ? this.plugin.dir() : "Planfold";
      this.option(opts, "new", L(`Create a new ${tf}/ folder`, `新建一个 ${tf}/ 文件夹`), L(`Daily notes go in ${tf}/Daily, named like ${moment().format(DKEY)}.`, `日记放在 ${tf}/Daily，文件名像 ${moment().format(DKEY)}。`));
    } else {
      h(c, "h2", "planfold-h2", L("Pick a few habits", "选几个想坚持的习惯"));
      h(c, "p", "planfold-muted", L("They show up in every daily note as a checkbox. You can change them any time.", "它们会以勾选框出现在每天的日记里，随时可以修改。"));
      const chips = h(c, "div", "planfold-chips");
      const all = [...new Set([...(this.plugin.goalsCache || []).filter((g) => g.active).map((g) => g.name), ...HABIT_SUGGEST(), ...this.picked])];
      for (const name of all) {
        const b = h(chips, "button", "planfold-chip" + (this.picked.has(name) ? " is-on" : ""), name); b.type = "button";
        b.addEventListener("click", () => { this.picked.has(name) ? this.picked.delete(name) : this.picked.add(name); this.draw(); });
      }
      const inp = addInput(c, L("Add your own…", "自己添加…"), (v) => { this.picked.add(v); this.draw(); });
      inp.addClass("planfold-input");
    }
    const foot = h(c, "div", "planfold-ob-foot");
    if (this.step > 0) button(foot, L("Back", "上一步"), "", () => { this.step--; this.draw(); });
    h(foot, "span", "planfold-grow");
    if (this.step === 2) button(foot, L("Skip", "跳过"), "planfold-link", () => this.finish(true));
    button(foot, this.step === 2 ? L("Start using Planfold", "开始使用") : L("Next", "下一步"), "is-primary", () => { if (this.step < 2) { this.step++; this.draw(); } else this.finish(false); });
  }
  option(parent, key, title, sub) {
    const b = h(parent, "button", "planfold-ob-option" + (this.where === key ? " is-on" : "")); b.type = "button";
    h(b, "span", "planfold-ob-radio");
    const t = h(b, "span", "planfold-ob-option-text");
    h(t, "strong", "", title);
    h(t, "span", "planfold-muted", sub);
    b.addEventListener("click", () => { this.where = key; this.draw(); });
  }
  async finish(skipHabits) {
    const p = this.plugin, S = p.settings;
    const langChanged = S.language !== this.lang;
    S.language = this.lang; LANG = this.lang;
    if (!S.templatesEdited && (langChanged || !S.templates)) S.templates = defaultTemplates(this.lang);
    if (!S.migratedFrom) S.folder = "Planfold";
    if (this.where === "keep") S.dailySource = "obsidian";
    else { S.dailySource = "custom"; S.dailyFolder = `${p.dir()}/Daily`; S.dailyFormat = DKEY; }
    if (!skipHabits) {
      const old = p.goalsCache || [];
      const list = old.map((g) => Object.assign({}, g, { active: this.picked.has(g.name) }));
      for (const name of this.picked) if (!old.some((g) => g.name === name)) list.push({ name, period: "weekly", target: 7, unit: "days", active: true });
      const same = list.length === old.length && list.every((g, i) => g.active === old[i].active);
      if (!same) await p.saveGoals(list);
    }
    S.setupDone = true;
    await p.saveSettings();
    this.close();
    p.refreshAll();
  }
  onClose() { this.contentEl.empty(); LANG = this.plugin.settings.language || guessLang(); }
}

class ProjectsModal extends Modal {
  constructor(app, plugin, done) { super(app); this.plugin = plugin; this.done = done; this.sel = new Set(plugin.settings.homeProjects); this.open_ = new Set(); this.q = ""; }
  onOpen() { this.modalEl.addClass("planfold-modal"); this.titleEl.setText(L("Choose project folders", "选择项目文件夹")); this.draw(); }
  draw() {
    const c = this.contentEl;
    c.empty();
    h(c, "p", "planfold-muted", L("Any folder, at any level. Nothing gets moved.", "任意层级的文件夹都可以，不会移动任何文件。"));
    const inp = h(c, "input", "planfold-input");
    inp.placeholder = L("Search folders…", "搜索文件夹…");
    inp.value = this.q;
    inp.addEventListener("input", () => { this.q = inp.value; this.drawTree(tree); });
    const tree = h(c, "div", "planfold-tree");
    this.drawTree(tree);
    const foot = h(c, "div", "planfold-ob-foot");
    h(foot, "span", "planfold-muted", L(`${this.sel.size} selected`, `已选 ${this.sel.size} 个`));
    h(foot, "span", "planfold-grow");
    button(foot, L("Cancel", "取消"), "", () => this.close());
    button(foot, L("Save", "保存"), "is-primary", async () => {
      const order = this.plugin.settings.homeProjects.filter((p) => this.sel.has(p));
      for (const p of this.sel) if (!order.includes(p)) order.push(p);
      this.plugin.settings.homeProjects = order;
      await this.plugin.saveSettings(); this.close(); this.done && this.done();
    });
    setTimeout(() => inp.focus(), 50);
  }
  drawTree(tree) {
    tree.empty();
    const q = this.q.trim().toLowerCase();
    const root = this.app.vault.getRoot();
    const walk = (folder, depth, parent) => {
      const kids = folder.children.filter((x) => x instanceof TFolder && !x.name.startsWith(".")).sort((a, b) => a.name.localeCompare(b.name));
      for (const f of kids) {
        const match = !q || f.path.toLowerCase().includes(q);
        const hasSub = f.children.some((x) => x instanceof TFolder);
        if (q && !match) { walk(f, depth, parent); continue; }
        const row = h(parent, "div", "planfold-tree-row");
        row.style.paddingLeft = `${q ? 4 : depth * 16 + 4}px`;
        const tog = h(row, "button", "planfold-tree-tog" + (hasSub && !q ? "" : " is-empty"), hasSub && !q ? (this.open_.has(f.path) ? "▾" : "▸") : "");
        tog.type = "button";
        tog.addEventListener("click", () => { this.open_.has(f.path) ? this.open_.delete(f.path) : this.open_.add(f.path); this.drawTree(tree); });
        const lab = h(row, "label", "planfold-tree-label");
        const cb = h(lab, "input"); cb.type = "checkbox"; cb.checked = this.sel.has(f.path);
        cb.addEventListener("change", () => { cb.checked ? this.sel.add(f.path) : this.sel.delete(f.path); });
        h(lab, "span", "", q ? f.path : f.name);
        if (q || this.open_.has(f.path)) { if (!q) walk(f, depth + 1, parent); }
        if (q) walk(f, depth, parent);
      }
    };
    walk(root, 0, tree);
    if (!tree.childElementCount) h(tree, "div", "planfold-empty-line", L("No folders found.", "没有找到文件夹。"));
  }
  onClose() { this.contentEl.empty(); }
}

/* =====================================================================
   Settings → Planfold
   ===================================================================== */
class PlanfoldSettingTab extends PluginSettingTab {
  constructor(app, plugin) { super(app, plugin); this.plugin = plugin; this.page = "notes"; }
  display() {
    const p = this.plugin;
    if (p.settingsPage) { this.page = p.settingsPage; p.settingsPage = null; }
    const c = this.containerEl;
    c.empty();
    c.addClass("planfold-settings");
    // Grouped by what the person is trying to do, not by how Planfold is built inside
    const groups = [
      { id: "writing", label: L("Writing", "写作"), pages: [["notes", L("Notes", "笔记")], ["templates", L("Templates", "模板")], ["capture", L("Quick capture", "快速记录")]] },
      { id: "tracking", label: L("Tracking", "追踪"), pages: [["habits", L("Habits", "习惯")]] },
      { id: "home", label: L("Home", "主页"), pages: [["home", L("Home", "主页")]] },
      { id: "system", label: L("System", "系统"), pages: [["general", L("Language & calendar", "语言与日历")], ["license", L("License", "授权")]] },
    ];
    const cur = groups.find((g) => g.pages.some(([k]) => k === this.page)) || groups[0];
    const nav = h(c, "div", "planfold-seg planfold-set-nav");
    for (const g of groups) { const b = h(nav, "button", g === cur ? "is-on" : "", g.label); b.type = "button"; b.addEventListener("click", () => { this.page = g.pages[0][0]; this.display(); }); }
    if (cur.pages.length > 1) {
      const subnav = h(c, "div", "planfold-set-subnav");
      for (const [k, t] of cur.pages) { const b = h(subnav, "button", "planfold-set-subtab" + (k === this.page ? " is-on" : ""), t); b.type = "button"; b.addEventListener("click", () => { this.page = k; this.display(); }); }
    }
    const body = h(c, "div", "planfold-set-body");
    this["page_" + this.page](body);
  }
  save(redraw) { return this.plugin.saveSettings().then(() => { this.plugin.refreshAll(); if (redraw) this.display(); }); }
  sub(el, t) { h(el, "h3", "planfold-set-sub", t); }
  intro(el, t) { h(el, "p", "planfold-muted planfold-set-intro", t); }
  row(el, name, desc) { const s = new obsidian.Setting(el).setName(name); if (desc) s.setDesc(desc); return s; }

  page_notes(el) {
    const p = this.plugin, S = p.settings;
    this.intro(el, L("Planfold reads and writes plain Markdown notes. Change where they live and how they're named.", "Planfold 读写的都是普通 Markdown 笔记。你可以在这里修改它们的位置和命名方式。"));
    this.sub(el, L("Daily", "日记"));
    this.row(el, L("Daily notes", "日记来源"), L("Follow Obsidian's Daily notes settings, or let Planfold keep its own.", "跟随 Obsidian「日记」插件的设置，或者由 Planfold 自己管理。"))
      .addDropdown((d) => d.addOption("obsidian", L("Obsidian Daily notes", "Obsidian 日记")).addOption("custom", L("Planfold's own", "Planfold 自己的")).setValue(S.dailySource).onChange((v) => { S.dailySource = v; if (v === "custom" && !S.dailyFolder) S.dailyFolder = `${p.dir()}/Daily`; this.save(true); }));
    if (S.dailySource === "custom") {
      this.row(el, L("Folder", "文件夹"), L("Where daily notes are created.", "新日记创建的位置。")).addText((t) => t.setValue(S.dailyFolder).onChange((v) => { S.dailyFolder = v; this.save(); }));
      this.row(el, L("File name", "文件名"), L(`Today becomes ${moment().format(S.dailyFormat || DKEY)}.md`, `今天的日记会是 ${moment().format(S.dailyFormat || DKEY)}.md`)).addText((t) => t.setValue(S.dailyFormat).onChange((v) => { S.dailyFormat = v || DKEY; this.save(); }));
    } else {
      const o = p.dailyOpts();
      this.row(el, L("Current location", "当前位置"), `${o.folder || L("vault root", "库根目录")}/${moment().format(o.format)}.md`);
    }
    this.row(el, L("Add Planfold sections to old notes", "给旧日记加入 Planfold 段落"), L("When you open a note written before Planfold.", "打开安装 Planfold 之前写的日记时。"))
      .addDropdown((d) => d.addOption("ask", L("Ask each time", "每次询问")).addOption("always", L("Always", "总是")).addOption("never", L("Never", "从不")).setValue(S.oldNotes).onChange((v) => { S.oldNotes = v; this.save(); }));
    if (S.oldNoteSkip.length) this.row(el, L(`${S.oldNoteSkip.length} notes marked “Not for this note”`, `${S.oldNoteSkip.length} 篇标记为「这篇不用」`)).addButton((b) => b.setButtonText(L("Ask again", "重新询问")).onClick(() => { S.oldNoteSkip = []; this.save(true); }));
    this.sub(el, L("Weekly · Monthly · Yearly", "周 · 月 · 年"));
    this.row(el, L("Planfold folder", "Planfold 文件夹"), L("Holds week, month and year notes and Goals.md.", "存放周、月、年笔记和 Goals.md。")).addText((t) => t.setValue(S.folder).onChange((v) => { S.folder = v || "Planfold"; this.save(); }));
    for (const sc of ["week", "month", "year"]) {
      const name = { week: L("Weekly notes", "周笔记"), month: L("Monthly notes", "月笔记"), year: L("Yearly notes", "年笔记") }[sc];
      this.row(el, name, `${p.scopeFolder(sc)}/${moment().format(p.scopeFormat(sc))}.md`)
        .addText((t) => t.setPlaceholder(`${p.dir()}/${{ week: "Week", month: "Month", year: "Year" }[sc]}`).setValue(S[sc + "Folder"]).onChange((v) => { S[sc + "Folder"] = v; this.save(); }))
        .addText((t) => t.setValue(S[sc + "Format"]).onChange((v) => { S[sc + "Format"] = v; this.save(); }));
    }
  }

  page_capture(el) {
    const p = this.plugin, S = p.settings;
    this.intro(el, L("Capture a thought from anywhere — it lands in today's Daily note.", "随时记下一个想法，它会写进今天的日记。"));
    this.row(el, L("Save to", "保存到"), L("The Daily Note section used by Quick Capture.", "快速记录写入的日记段落。")).addDropdown((d) => {
      for (const f of S.templates.day || []) d.addOption(f.id, f.label);
      d.setValue(S.quickCaptureField || "free").onChange((v) => { S.quickCaptureField = v; this.save(); });
    });
    this.row(el, L("Add capture time", "添加记录时间"), L("Prefix every capture with the current time.", "每条记录前加上当前时间。")).addToggle((t) => t.setValue(S.quickCaptureTimestamp !== false).onChange((v) => { S.quickCaptureTimestamp = v; this.save(); }));
    this.row(el, L("Mobile setup", "手机端设置"), L("Test capture and set up Obsidian Quick Action or an iPhone Home Screen shortcut.", "测试快速记录，并设置 Obsidian 快捷操作或 iPhone 主屏幕入口。"))
      .addButton((b) => b.setButtonText(L("Set up", "开始设置")).onClick(() => new MobileCaptureSetupModal(this.app, p).open()));
  }

  page_templates(el) {
    const p = this.plugin, S = p.settings;
    this.intro(el, L("The sections in each note. Every time period has one note. Changes only apply to new notes; renamed sections are still found in old ones. Review's calendar shows the first Daily section.", "每个时间段都对应一张笔记。修改只影响以后的新笔记；改了名字的段落在旧笔记里仍然找得到。回顾页的日历显示日记的第一个段落。"));
    const names = { day: L("Daily note", "日记"), week: L("Weekly note", "周笔记"), month: L("Monthly note", "月笔记"), year: L("Yearly note", "年笔记") };
    for (const sc of SCOPES) {
      this.sub(el, names[sc]);
      const list = S.templates[sc];
      list.forEach((f, i) => {
        const s = new obsidian.Setting(el).addText((t) => {
          t.setValue(f.label);
          t.inputEl.addEventListener("change", () => {
            const v = t.getValue().trim(); if (!v || v === f.label) return;
            f.prev = [...new Set([...(f.prev || []), f.label])]; f.label = v; S.templatesEdited = true; this.save();
          });
        }).addText((t) => t.setPlaceholder(L("Hint (optional)", "提示文字（可选）")).setValue(f.hint || "").onChange((v) => { f.hint = v; S.templatesEdited = true; this.save(); }));
        s.addExtraButton((b) => b.setIcon("arrow-up").setTooltip(L("Move up", "上移")).setDisabled(i === 0).onClick(() => { if (!i) return; list.splice(i - 1, 0, list.splice(i, 1)[0]); S.templatesEdited = true; this.save(true); }));
        s.addExtraButton((b) => b.setIcon("x").setTooltip(L("Remove", "移除")).onClick(() => { list.splice(i, 1); S.templatesEdited = true; this.save(true); }));
      });
      this.row(el, "").addButton((b) => b.setButtonText(L("+ Add section", "+ 添加段落")).onClick(() => { list.push({ id: "f" + Date.now().toString(36), label: L("New section", "新段落"), hint: "", prev: [] }); S.templatesEdited = true; this.save(true); }));
    }
    this.sub(el, L("Mood", "心情"));
    this.row(el, L("Ask for a mood each day", "每天记录心情"), L("Five dots, light to dark. Optional — never required.", "五个由浅到深的点，可以不填。")).addToggle((t) => t.setValue(S.askMood).onChange((v) => { S.askMood = v; this.save(); }));
    this.row(el, L("Reset templates", "恢复默认模板"), L("Back to the default sections in the current language.", "恢复成当前语言的默认段落。")).addButton((b) => b.setButtonText(L("Reset", "恢复")).onClick(() => { S.templates = defaultTemplates(LANG); S.templatesEdited = false; this.save(true); }));
  }

  page_habits(el) {
    const p = this.plugin;
    this.intro(el, L("Check in once per day. The weekly target becomes a quiet “this week” counter in Daily Note and the goal line in Review. Stored in ", "每天最多打卡一次。每周目标会显示为日记里的「本周进度」，并作为回顾页的目标线。保存在 ") + p.goalsPath());
    const draw = async () => {
      const list = (await p.goals()).map((g) => Object.assign({}, g));
      const box = h(el, "div", "planfold-set-habits");
      const commit = async () => { await p.saveGoals(list); p.refreshAll(); };
      list.forEach((g, i) => {
        if (!g.active) return;
        const s = new obsidian.Setting(box).setName(g.name).setDesc(L("Shown as a daily check-in.", "每天显示为一个打卡项。")).addText((t) => { t.setPlaceholder(L("Habit name", "习惯名称")).setValue(g.name); t.inputEl.addEventListener("change", () => { const v = t.getValue().trim(); if (v) { g.name = v; commit(); } }); });
        s.settingEl.addClass("planfold-habit-setting");
        if (g.period === "weekly" && /^(days?|天)$/i.test(g.unit)) s.addDropdown((d) => { for (let n = 1; n <= 7; n++) d.addOption(String(n), L(`${n} day${n > 1 ? "s" : ""} a week`, `每周 ${n} 天`)); d.setValue(String(Math.min(7, g.target))).onChange((v) => { g.target = +v; commit(); }); });
        else s.setDesc(L(`From 0.21.0: ${g.period}, ${g.target} ${g.unit}. Any check-in counts as done.`, `来自 0.21.0：${g.period}，${g.target} ${g.unit}。有打卡就算完成。`));
        s.addExtraButton((b) => b.setIcon("archive").setTooltip(L("Archive", "归档")).onClick(async () => { g.active = false; await commit(); this.display(); }));
      });
      const addHabit = new obsidian.Setting(box).addText((t) => {
        t.setPlaceholder(L("New habit, e.g. Read", "新习惯，例如：读书"));
        t.inputEl.addEventListener("keydown", async (e) => { if (e.key === "Enter" && t.getValue().trim()) { list.push({ name: t.getValue().trim(), period: "weekly", target: 7, unit: "days", active: true }); await commit(); this.display(); } });
      }).setName(L("Add habit", "添加习惯")).setDesc(L("Type and press Enter.", "输入后按回车。"));
      addHabit.settingEl.addClass("planfold-habit-add");
      const arch = list.filter((g) => !g.active);
      if (arch.length) {
        this.sub(box, L("Archived", "已归档"));
        h(box, "p", "planfold-muted planfold-habit-archive-copy", L("Archived habits keep their history in Review but stop appearing in new notes.", "归档的习惯会保留在回顾页的历史里，但不再出现在新日记中。"));
        arch.forEach((g) => {
          const s = new obsidian.Setting(box).setName(g.name).addButton((b) => b.setButtonText(L("Restore", "恢复")).onClick(async () => { g.active = true; await commit(); this.display(); }));
          s.settingEl.addClass("planfold-habit-archived");
        });
      }
    };
    draw();
  }

  page_home(el) {
    const p = this.plugin, S = p.settings;
    this.sub(el, L("Tabs", "标签页"));
    this.intro(el, L("Choose the page Planfold opens on, then arrange the navigation independently.", "选择 Planfold 的启动页面，再单独调整顶部导航的顺序。"));
    this.row(el, L("Start page", "启动页面"), L("This does not change the tab order.", "不会改变标签顺序。")).addDropdown((d) => {
      S.tabOrder.forEach((t) => d.addOption(t, TAB_LABEL()[t]));
      d.setValue(S.startTab || S.tabOrder[0]).onChange((v) => { S.startTab = v; this.save(); });
    });
    this.sub(el, L("Tab order", "标签顺序"));
    S.tabOrder.forEach((t, i) => {
      const s = new obsidian.Setting(el).setName(`${i + 1}. ${TAB_LABEL()[t]}`).setDesc(t === S.startTab ? L("Start page", "启动页面") : "");
      s.settingEl.addClass("planfold-order-setting");
      s
        .addExtraButton((b) => b.setIcon("arrow-up").setDisabled(i === 0).onClick(() => { if (!i) return; S.tabOrder.splice(i - 1, 0, S.tabOrder.splice(i, 1)[0]); this.save(true); }))
        .addExtraButton((b) => b.setIcon("arrow-down").setDisabled(i === S.tabOrder.length - 1).onClick(() => { if (i === S.tabOrder.length - 1) return; S.tabOrder.splice(i + 1, 0, S.tabOrder.splice(i, 1)[0]); this.save(true); }));
    });
    this.row(el, L("Open Planfold when Obsidian starts", "启动 Obsidian 时打开 Planfold")).addToggle((t) => t.setValue(S.openOnStartup).onChange((v) => { S.openOnStartup = v; this.save(); }));
    this.row(el, L("Your name", "你的名字"), L("Shown in the greeting.", "显示在问候语里。")).addText((t) => t.setValue(S.displayName).onChange((v) => { S.displayName = v.trim(); this.save(); }));
    this.sub(el, L("Home layout", "主页布局"));
    this.intro(el, L("The default keeps today in focus. Reorder cards, change their width, or hide what you don't need.", "默认布局把今天放在中心。你可以调整板块顺序、宽度，或隐藏不需要的内容。"));
    this.row(el, L("Customize Home", "自定义主页"), L("Arrange the real cards directly on Home.", "直接在主页上排列真实板块。"))
      .addButton((b) => b.setButtonText(L("Customize", "开始排列")).onClick(async () => { const v = await p.openView("home"); if (v instanceof PlanfoldView) { v.home.customizing = true; v.render(); } }));
    this.row(el, L("Default layout", "默认布局"), L("To-do on the left; Habits and Quick note are separate cards on the right. Time and mood stay in the top bar; the full calendar lives in Obsidian's right sidebar.", "待办在左；习惯和随手记是右侧两张独立卡片。时间和心情保留在顶部，完整日历位于 Obsidian 右侧边栏。"))
      .addButton((b) => b.setButtonText(L("Reset", "恢复默认")).onClick(async () => { S.homeLayout = defaultHomeLayout(); S.homeLayoutVersion = HOME_LAYOUT_VERSION; await this.save(true); }));
    this.sub(el, L("File explorer", "文件栏"));
    this.row(el, L("Pinned and Recent in the file explorer", "在文件栏顶部显示置顶和最近"), L("Right-click any note → Pin. Recent lists what you opened on this device.", "在任意笔记上右键 →「置顶」。「最近」是这台设备上打开过的笔记。"))
      .addToggle((t) => t.setValue(S.explorerShortcuts !== false).onChange(async (v) => { S.explorerShortcuts = v; await this.save(); p.mountExplorer(); }));
    this.sub(el, L("Appearance", "外观"));
    this.row(el, L("Colours", "配色"), L("Fourfold: the sage palette, mono type and rounded shapes of the design, for Home and the rest of Obsidian (sidebars, tabs, file list). Follow my theme: your theme's colours and accent, nothing outside Planfold changes.", "Fourfold：设计稿里的灰青配色、等宽字体和圆角，主页和整个 Obsidian（侧栏、标签栏、文件列表）一起换。跟随主题：用你主题的颜色和强调色，Planfold 以外的界面都不改。"))
      .addDropdown((d) => d.addOption("fourfold", "Fourfold").addOption("theme", L("Follow my theme", "跟随主题")).setValue(S.homePalette || "theme").onChange(async (v) => { S.homePalette = v; await this.save(); p.applyLook(); }));
  }

  page_general(el) {
    const p = this.plugin, S = p.settings;
    this.sub(el, L("Language", "语言"));
    this.row(el, L("Interface language", "界面语言"), L("Note properties are always written in English.", "笔记属性始终以英文写入。")).addDropdown((d) => d.addOption("en", "English").addOption("zh", "中文").setValue(LANG).onChange((v) => {
      S.language = v; LANG = v;
      if (!S.templatesEdited) S.templates = defaultTemplates(v);
      this.save(true);
    }));
    this.sub(el, L("Calendar", "日历"));
    this.row(el, L("Week starts on", "每周开始于"), L("How the sidebar and Review calendars are drawn. Weekly notes always follow ISO weeks (Mon–Sun).", "右侧栏和回顾页日历从哪天开始。周笔记始终按 ISO 周（周一到周日）。")).addDropdown((d) => d.addOption("monday", L("Monday", "周一")).addOption("sunday", L("Sunday", "周日")).setValue(S.weekStart).onChange((v) => { S.weekStart = v; this.save(); }));
    this.row(el, L("Time format", "时间格式")).addDropdown((d) => d.addOption("", L("Automatic", "自动")).addOption("12", L("12-hour", "12 小时制")).addOption("24", L("24-hour", "24 小时制")).setValue(S.timeFormat).onChange((v) => { S.timeFormat = v; this.save(); }));
    this.sub(el, L("Data", "数据"));
    this.row(el, L("Rebuild activity index", "重建活动记录"), L("If Recent or Calendar look wrong after moving files.", "移动文件后，如果最近或日历显示不对，可以重建。")).addButton((b) => b.setButtonText(L("Rebuild", "重建")).onClick(async () => { await p.rebuildActivity(); p.refreshAll(); new Notice(L("Activity rebuilt", "已重建")); }));
    this.row(el, L("Run setup again", "重新运行引导")).addButton((b) => b.setButtonText(L("Open welcome", "打开欢迎页")).onClick(() => new OnboardingModal(this.app, p).open()));
  }

  page_license(el) {
    const p = this.plugin, S = p.settings;
    if (p.license) {
      const box = h(el, "div", "planfold-panel planfold-license");
      h(box, "strong", "", L(`Licensed to ${p.license.n || "you"}`, `已授权给 ${p.license.n || "你"}`));
      h(box, "div", "planfold-muted", L("Works offline.", "可离线使用。"));
    }
    this.row(el, L("License key", "授权码"), L("One license per person, for your own devices.", "一人一份授权，可用于自己的多台设备。")).addText((t) => {
      t.setPlaceholder("PLANFOLD-…").setValue(S.license);
      t.inputEl.addEventListener("change", async () => {
        const lic = await verifyLicense(t.getValue());
        if (!lic && t.getValue().trim()) { new Notice(L("This key doesn't look right. Copy the whole key, starting with PLANFOLD-.", "授权码不对。请完整复制，以 PLANFOLD- 开头。")); return; }
        S.license = t.getValue().replace(/\s+/g, ""); p.license = lic; await this.save(true);
      });
    });
  }
}

module.exports = PlanfoldPlugin;

/* =====================================================================
   File explorer: Pinned and Recent, at the top of Obsidian's own file list
   proto.31 — the notes you come back to live where you already look for files,
   not on a second sidebar inside Home. Rows reuse Obsidian's own tree classes,
   so they look native in every theme.
   ===================================================================== */
Object.assign(PlanfoldPlugin.prototype, {
  explorerLeaves() { return this.app.workspace.getLeavesOfType("file-explorer"); },

  mountExplorer() {
    for (const leaf of this.explorerLeaves()) {
      const root = leaf.view && leaf.view.containerEl;
      const list = root && root.querySelector(".nav-files-container");
      if (!list) continue;
      const shell = list.parentElement;
      let box = list.querySelector(":scope > .planfold-explorer");
      const legacyBox = shell.querySelector(":scope > .planfold-explorer");
      if (!this.settings.explorerShortcuts) {
        if (box) box.remove();
        if (legacyBox) legacyBox.remove();
        shell.classList.remove("planfold-explorer-shell");
        continue;
      }
      shell.classList.remove("planfold-explorer-shell");
      /* The shortcuts are the first rows of Obsidian's own scroll container.
         Keeping one scroll flow prevents folders from ever painting behind them. */
      if (!box && legacyBox) {
        box = legacyBox;
        list.insertBefore(box, list.firstChild);
      }
      if (!box) {
        box = document.createElement("div");
        box.className = "planfold-explorer";
        list.insertBefore(box, list.firstChild);
      }
      this.drawExplorer(box);
    }
  },

  unmountExplorer() {
    document.querySelectorAll(".planfold-explorer").forEach((el) => el.remove());
    /* Remove the RC8 migration class if a live workspace still has it. */
    document.querySelectorAll(".planfold-explorer-shell").forEach((el) => el.classList.remove("planfold-explorer-shell"));
  },

  /** Redraw soon (opening a note, pinning, renaming): one redraw per burst. */
  refreshExplorer() {
    clearTimeout(this._explorerT);
    this._explorerT = setTimeout(() => this.mountExplorer(), 120);
  },

  /** Opening a shortcut must not turn the file tree into a second navigation
      event. Obsidian reveals the active file in the native tree after openFile;
      keep each file explorer at the exact position the user chose instead. */
  async openExplorerShortcut(file, newTab) {
    const positions = this.explorerLeaves().map((leaf) => {
      const root = leaf.view && leaf.view.containerEl;
      const list = root && root.querySelector(".nav-files-container");
      return list ? { leaf, top: list.scrollTop, left: list.scrollLeft } : null;
    }).filter(Boolean);
    const restore = () => {
      for (const pos of positions) {
        const root = pos.leaf.view && pos.leaf.view.containerEl;
        const list = root && root.querySelector(".nav-files-container");
        if (!list) continue;
        list.scrollTop = pos.top;
        list.scrollLeft = pos.left;
      }
    };
    await this.openFile(file, newTab);
    // Core reveal and Planfold's shortcut redraw land in adjacent frames. Restore
    // after both, without a transition or a visible counter-scroll.
    restore();
    requestAnimationFrame(() => { restore(); requestAnimationFrame(restore); });
    clearTimeout(this._explorerScrollT);
    this._explorerScrollT = setTimeout(restore, 160);
  },

  drawExplorer(box) {
    box.empty();
    const S = this.settings, active = this.app.workspace.getActiveFile();
    const collapsed = S.explorerCollapsed || (S.explorerCollapsed = {});
    const group = (key, label, files, meta, empty) => {
      const sec = h(box, "div", "planfold-explorer-group tree-item nav-folder" + (collapsed[key] ? " is-collapsed" : ""));
      const head = h(sec, "div", "planfold-explorer-head tree-item-self nav-folder-title is-clickable mod-collapsible");
      const arrow = h(head, "div", "tree-item-icon collapse-icon nav-folder-collapse-indicator" + (collapsed[key] ? " is-collapsed" : ""));
      try { setIcon(arrow, "right-triangle"); } catch (e) {}
      h(head, "div", "tree-item-inner nav-folder-title-content", label);
      if (files.length) h(h(head, "div", "tree-item-flair-outer"), "span", "tree-item-flair", String(files.length));
      head.addEventListener("click", async () => { collapsed[key] = !collapsed[key]; await this.saveSettings(); this.mountExplorer(); });
      if (collapsed[key]) return;
      const kids = h(sec, "div", "tree-item-children nav-folder-children");
      if (!files.length) { h(kids, "div", "planfold-explorer-empty", empty); return; }
      for (const f of files) {
        const item = h(kids, "div", "tree-item nav-file");
        const self = h(item, "div", "tree-item-self nav-file-title is-clickable planfold-explorer-row" + (active && active.path === f.path ? " is-active" : ""));
        self.setAttr("data-path", f.path);
        self.draggable = true;
        h(self, "div", "tree-item-inner nav-file-title-content", f.basename);
        const m = meta(f);
        if (m) h(h(self, "div", "tree-item-flair-outer"), "span", "tree-item-flair planfold-explorer-meta", m);
        self.addEventListener("click", (e) => this.openExplorerShortcut(f, e.metaKey || e.ctrlKey));
        self.addEventListener("auxclick", (e) => { if (e.button === 1) this.openExplorerShortcut(f, true); });
        self.addEventListener("dragstart", (e) => {
          try { const dm = this.app.dragManager; dm.onDragStart(e, dm.dragFile(e, f)); } catch (err) {}
        });
        self.addEventListener("contextmenu", (e) => {
          const menu = new obsidian.Menu();
          const on = S.homePinnedPaths.includes(f.path);
          menu.addItem((i) => i.setTitle(on ? L("Unpin", "取消置顶") : L("Pin", "置顶")).setIcon(on ? "pin-off" : "pin").onClick(() => this.togglePin(f)));
          menu.addItem((i) => i.setTitle(L("Open in new tab", "在新标签页打开")).setIcon("file-plus").onClick(() => this.openExplorerShortcut(f, true)));
          if (on && S.homePinnedPaths.length > 1) {
            const at = S.homePinnedPaths.indexOf(f.path);
            if (at > 0) menu.addItem((i) => i.setTitle(L("Move up", "上移")).setIcon("arrow-up").onClick(() => this.movePin(f.path, -1)));
            if (at < S.homePinnedPaths.length - 1) menu.addItem((i) => i.setTitle(L("Move down", "下移")).setIcon("arrow-down").onClick(() => this.movePin(f.path, 1)));
          }
          menu.showAtMouseEvent(e);
        });
      }
    };
    group("pinned", L("PINNED", "PINNED 置顶"), this.pinnedFiles(), () => "", L("Right-click a note → Pin", "在笔记上右键 →「置顶」"));
    const recent = this.recentFiles(5);
    group("recent", L("RECENT", "RECENT 最近"), recent, (f) => {
      const t = S.homeRecentTimes[f.path] || f.stat.mtime, m = moment(t);
      return m.isSame(moment(), "day") ? m.format("HH:mm") : m.format(LANG === "zh" ? "M/D" : "MMM D");
    }, L("Notes you open show up here.", "打开过的笔记会出现在这里。"));
  },

  async movePin(path, dir) {
    const l = [...this.settings.homePinnedPaths], i = l.indexOf(path), j = i + dir;
    if (i < 0 || j < 0 || j >= l.length) return;
    [l[i], l[j]] = [l[j], l[i]];
    this.settings.homePinnedPaths = l;
    await this.saveSettings();
    this.refreshExplorer();
  },

  /** One appearance for all of Obsidian: with Home colours = Fourfold (the default) the sidebars, tabs and file rows
      take the same sage palette, mono type and rounded shapes as Home. "Follow my theme" turns all of it off. */
  applyLook() { document.body.toggleClass("planfold-look", this.settings.homePalette !== "theme"); },
});
