import { API_ANALYZE, API_ANALYZE_LIST, API_TENDERS_SAVE } from "./config.js";
import {
  collectBtn, analyzeBtn, statusEl,
  collectedEl, collectedContent, resultEl,
} from "./dom.js";
import { esc } from "./utils.js";

let collectedData = null;
let pageType = "unknown";
let currentTabId = null;
let lastListItems = null;

function setStatus(text, type = "", spinner = false) {
  statusEl.className = "status" + (type ? " " + type : "");
  statusEl.innerHTML = (spinner ? '<span class="spinner"></span>' : "") + text;
}

// --- кэш списка ---
function cacheKey(url) { return "scores:" + (url || "").split("#")[0]; }
async function saveScores(url, items, scores) {
  try { await chrome.storage.local.set({ [cacheKey(url)]: { items, scores, savedAt: Date.now() } }); } catch {}
}
async function loadScores(url) {
  try { const k = cacheKey(url); const d = await chrome.storage.local.get(k); return d[k] || null; } catch { return null; }
}

// ============================================================
// Определение страницы
// ============================================================
async function detectAndPrepare() {
  collectedData = null;
  lastListItems = null;
  collectedEl.classList.remove("show");
  resultEl.classList.remove("show");
  resultEl.innerHTML = "";

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    currentTabId = tab?.id ?? null;

    if (!tab?.url || !tab.url.includes("zakupki.okmot.kg")) {
      setStatus("Откройте zakupki.okmot.kg", "err");
      collectBtn.disabled = true;
      analyzeBtn.style.display = "none";
      return;
    }
    collectBtn.disabled = false;

    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["parser.js"] });
    const [{ result: type }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => detectPageType(),
    });
    pageType = type;

    if (type === "list") {
      collectBtn.textContent = "Оценить закупки на странице";
      analyzeBtn.style.display = "none";
      const cached = await loadScores(tab.url);
      if (cached?.items && cached?.scores) {
        lastListItems = cached.items;
        renderList(cached.items, cached.scores);
        const ago = Math.round((Date.now() - cached.savedAt) / 60000);
        setStatus(`Показан прошлый результат (${ago} мин назад). Можно обновить.`, "ok");
      } else {
        setStatus("Это список закупок — AI оценит их привлекательность");
      }
    } else if (type === "detail") {
      collectBtn.textContent = "Собрать данные закупки";
      analyzeBtn.style.display = "";
      setStatus("Это страница закупки — можно сделать полный анализ");
    } else {
      setStatus("Откройте список или страницу закупки");
    }
  } catch (e) {
    setStatus("Ошибка: " + e.message, "err");
  }
}

chrome.tabs.onActivated.addListener(() => detectAndPrepare());
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (tabId === currentTabId && info.status === "complete") detectAndPrepare();
});

// ============================================================
// Универсальная кнопка
// ============================================================
collectBtn.addEventListener("click", () => {
  if (pageType === "list") return scoreList();
  return collectDetail();
});

// ============================================================
// СПИСОК: AI-оценка пачки
// ============================================================
async function scoreList() {
  setStatus("Читаю таблицу…", "", true);
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const [{ result: data }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => parseListPage(),
    });
    if (!data?.items?.length) { setStatus("Не нашёл таблицу закупок", "err"); return; }

    setStatus(`AI оценивает ${data.items.length} закупок… 5–15 сек`, "", true);
    let scores = [];
    try {
      const res = await fetch(API_ANALYZE_LIST, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: data.items }),
      });
      if (!res.ok) throw new Error("сервер ответил " + res.status);
      const json = await res.json();
      scores = (json.result || json).scores || [];
    } catch (e) {
      setStatus("AI недоступен (" + e.message + ") — показываю без оценки", "err");
    }
    lastListItems = data.items;
    renderList(data.items, scores);
    if (scores.length) {
      setStatus(`Оценено закупок: ${data.items.length}`, "ok");
      if (tab?.url) saveScores(tab.url, data.items, scores);
    }
  } catch (e) {
    setStatus("Ошибка: " + e.message, "err");
  }
}

function levelClass(level) {
  const l = (level || "").toLowerCase();
  if (l.includes("высок")) return "ok";
  if (l.includes("низк")) return "stop";
  return "warn";
}
function levelRank(level) {
  const l = (level || "").toLowerCase();
  if (l.includes("высок")) return 3;
  if (l.includes("сред")) return 2;
  if (l.includes("низк")) return 1;
  return 0;
}

function renderList(items, scores) {
  const byIndex = {};
  scores.forEach((s) => { byIndex[s.index] = s; });
  const merged = items.map((it, i) => ({
    ...it,
    level: byIndex[i]?.level || "",
    reason: byIndex[i]?.reason || "",
    rank: levelRank(byIndex[i]?.level),
  }));
  merged.sort((a, b) => b.rank - a.rank);

  let html = `<div class="block-label">Закупки · оценка AI по привлекательности</div>`;
  merged.forEach((it) => {
    const lvlTag = it.level ? `<span class="tag ${levelClass(it.level)}">${esc(it.level)}</span>` : "";
    const clickable = it.url ? ` data-url="${esc(it.url)}"` : "";
    html += `
      <div class="list-card${it.url ? " clickable" : ""}"${clickable}>
        <div class="list-name">${esc(it.name)}</div>
        <div class="list-meta">${esc(it.type)} · ${esc(it.plannedSum)} сом · до ${esc(it.deadline)}</div>
        <div class="tags">${lvlTag}</div>
        ${it.reason ? `<div class="list-reason">${esc(it.reason)}</div>` : ""}
        <div class="list-org">${esc(it.organization)}</div>
      </div>`;
  });
  resultEl.innerHTML = html;
  resultEl.classList.add("show");
  collectedEl.classList.remove("show");

  resultEl.querySelectorAll(".list-card.clickable").forEach((card) => {
    card.addEventListener("click", () => {
      const url = card.getAttribute("data-url");
      if (url) chrome.tabs.create({ url });
    });
  });
}

// ============================================================
// ДЕТАЛЬНАЯ: сбор + AI-анализ + сохранение
// ============================================================
async function collectDetail() {
  setStatus("Читаю страницу…", "", true);
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const [{ result: data }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => parseProcurementPage(),
    });
    if (!data || (!data.general.number && data.lots.length === 0)) {
      setStatus("Не нашёл данных закупки", "err"); return;
    }
    collectedData = data;
    renderCollected(data);
    analyzeBtn.disabled = false;
    setStatus("Данные собраны", "ok");
  } catch (e) { setStatus("Ошибка: " + e.message, "err"); }
}

function renderCollected(data) {
  const g = data.general;
  let html = "";
  [["Номер", g.number], ["Закупка", g.name], ["Метод", g.method], ["Сумма", g.plannedSum], ["Срок", g.deadline]]
    .forEach(([k, v]) => { if (v) html += `<div class="row"><span class="k">${k}</span><span class="v">${esc(v)}</span></div>`; });
  if (data.lots.length) {
    html += `<div class="sec-label" style="margin-top:10px">Лоты: ${data.lots.length}</div>`;
    data.lots.forEach((l) => { html += `<div class="mini-lot">▸ ${esc(l.number)} ${esc(l.name)} — ${esc(l.sum)}</div>`; });
  }
  collectedContent.innerHTML = html;
  collectedEl.classList.add("show");
}

analyzeBtn.addEventListener("click", async () => {
  if (!collectedData) return;
  analyzeBtn.disabled = true;
  setStatus("AI ищет цены и анализирует… 10–30 сек", "", true);
  resultEl.classList.remove("show");
  resultEl.innerHTML = "";
  const text = buildTextForAI(collectedData);
  try {
    const res = await fetch(API_ANALYZE, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) throw new Error("сервер ответил " + res.status);
    const json = await res.json();
    const payload = json.result || json;
    renderResult(payload);

    try {
      await fetch(API_TENDERS_SAVE, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          number: collectedData.general.number,
          name: collectedData.general.name,
          organization: collectedData.general.organization,
          method: collectedData.general.method,
          plannedSum: collectedData.general.plannedSum,
          deadline: collectedData.general.deadline,
          url: collectedData.url,
          analysis: payload.analysis,
        }),
      });
      setStatus("Анализ готов · сохранено в базу", "ok");
    } catch (e) {
      setStatus("Анализ готов · сохранить в базу не удалось", "ok");
    }
  } catch (e) {
    setStatus("Ошибка: " + e.message + " — запущен ли Nest?", "err");
  } finally { analyzeBtn.disabled = false; }
});

function renderResult(payload) {
  const a = payload.analysis || {};
  const sources = payload.sources || [];
  if (a.raw) { resultEl.innerHTML = `<div class="raw-fallback">${esc(a.raw)}</div>`; resultEl.classList.add("show"); return; }

  const v = (a.verdict || "").toLowerCase();
  let vClass = "care";
  if (v.includes("стоит")) vClass = "go";
  else if (v.includes("не реком")) vClass = "stop";

  let html = `<div class="verdict ${vClass}">
      <div class="verdict-label">Вердикт</div>
      <div class="verdict-title">${esc(a.verdict || "—")}</div>
      <div class="verdict-reason">${esc(a.verdictReason || "")}</div></div>`;

  if (Array.isArray(a.lots) && a.lots.length) {
    html += `<div class="block-label">Лоты и цены</div>`;
    a.lots.forEach((lot) => {
      const pv = (lot.priceVerdict || "").toLowerCase();
      let bc = "ok", bt = lot.priceVerdict || "нет данных";
      if (pv.includes("завыш")) bc = "high"; else if (pv.includes("заниж")) bc = "low";
      html += `<div class="lot-card">
          <div class="lot-head"><div class="lot-name">${esc(lot.name)}</div><div class="lot-type">${esc(lot.type || "")}</div></div>
          <div class="price-row">
            <div class="price-item"><div class="pl">Сумма закупки</div><div class="pv">${esc(lot.procurementSum || "—")}</div></div>
            <div class="price-item"><div class="pl">Рынок (Бишкек)</div><div class="pv">${esc(lot.marketPrice || "—")}</div></div>
          </div>
          <span class="badge ${bc}">${esc(bt)}</span>
          ${lot.comment ? `<div class="lot-comment">${esc(lot.comment)}</div>` : ""}
        </div>`;
    });
  }
  if (Array.isArray(a.risks) && a.risks.length) {
    html += `<div class="block-label">Риски</div>`;
    a.risks.forEach((r) => { html += `<div class="risk-item"><span class="dot">→</span><span>${esc(r)}</span></div>`; });
  }
  if (a.profitable) html += `<div class="block-label">Выгодность</div><div class="profit">${esc(a.profitable)}</div>`;
  if (sources.length) {
    html += `<div class="block-label">Источники цен</div><div class="sources">`;
    sources.slice(0, 6).forEach((s) => { html += `<a class="source-link" href="${esc(s.uri)}" target="_blank">↗ ${esc(s.title || s.uri)}</a>`; });
    html += `<div class="source-note">Цены найдены через Google, могут отличаться от актуальных.</div></div>`;
  }
  resultEl.innerHTML = html;
  resultEl.classList.add("show");
}

function buildTextForAI(data) {
  const g = data.general;
  let text = `Закупка №${g.number}\nНаименование: ${g.name}\nОрганизация: ${g.organization}\nМетод закупок: ${g.method}\nПланируемая сумма: ${g.plannedSum}\nСрок подачи: ${g.deadline}\n\n`;
  if (data.lots.length) {
    text += `Лоты:\n`;
    data.lots.forEach((l) => { text += `- ${l.number} ${l.name}, сумма ${l.sum}, поставка: ${l.deliveryTerm}, место: ${l.place}\n`; });
    text += "\n";
  }
  if (data.requirements?.length) {
    text += `Квалификационные требования:\n`;
    data.requirements.forEach((r, i) => { text += `${i + 1}. ${r.qualification} — ${r.requirement}\n`; });
  }
  return text;
}

// первичная инициализация
detectAndPrepare();