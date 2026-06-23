import {
  API_TENDERS_SAVE,
  API_SCRAPE_ACTIVE,
  API_SCRAPE_STATUS,
  CATEGORIES,
} from "./config.js";
import {
  tendersStatusEl,
  tendersContentEl,
  tendersRefreshBtn,
  tendersScrapeBtn,
} from "./dom.js";
import { esc } from "./utils.js";
import { updateBadge } from "./notifications.js";

let tendersData = [];
let scrapePoll = null;

// --- пагинация (серверная) ---
const PAGE_SIZE = 10;
let currentPage = 1;
let totalPages = 1;
let totalCount = 0;

// --- сортировка (серверная) ---
const SORT_OPTIONS = [
  ["publishedAt", "Дата публикации"],
  ["deadlineAt", "Срок подачи"],
  ["plannedSum", "Сумма"],
  ["margin", "Маржа"],
  ["profit", "Чистая прибыль"],
  ["createdAt", "Добавлено"],
];
let sortBy = "publishedAt";
let sortOrder = "DESC";

// --- фильтры ---
let category = ""; // "" = все
let verdict = ""; // "" = любой
let rating = ""; // "" = любой
let minSum = ""; // сумма от
let minMargin = ""; // маржа % от
let minProfit = ""; // прибыль от
let analyzedOnly = false; // только с оценкой
let filtersOpen = false; // раскрыта ли панель фильтров

function setTendersStatus(text, type = "", spinner = false) {
  tendersStatusEl.className = "status" + (type ? " " + type : "");
  tendersStatusEl.innerHTML =
    (spinner ? '<span class="spinner"></span>' : "") + text;
}

function verdictTagClass(verdict) {
  const v = (verdict || "").toLowerCase();
  if (v.includes("стоит")) return "ok";
  if (v.includes("не реком")) return "stop";
  return "warn";
}

// analysis может прийти объектом или строкой (jsonb / text)
function parseAnalysis(a) {
  if (!a) return {};
  if (typeof a === "string") {
    try {
      return JSON.parse(a);
    } catch {
      return {};
    }
  }
  return a;
}

// собрать URL списка с page/limit/sort/фильтрами
function buildListUrl(base, page) {
  const params = {
    page,
    limit: PAGE_SIZE,
    sortBy,
    sortOrder,
    activeOnly: "true",
  };
  if (category) params.category = category;
  if (verdict) params.verdict = verdict;
  if (rating) params.rating = rating;
  if (minSum) params.minSum = minSum;
  if (minMargin) params.minMargin = minMargin;
  if (minProfit) params.minProfit = minProfit;
  if (analyzedOnly) params.analyzed = "true";

  try {
    const u = new URL(base);
    Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
    return u.toString();
  } catch {
    const sep = base.includes("?") ? "&" : "?";
    const qs = Object.entries(params)
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join("&");
    return `${base}${sep}${qs}`;
  }
}

// нужен main.js для переключения вкладок — экспортируем
export async function loadTenders(page = 1) {
  setTendersStatus("Загружаю…", "", true);
  tendersContentEl.innerHTML = "";
  try {
    const res = await fetch(buildListUrl(API_TENDERS_SAVE, page));
    if (!res.ok) throw new Error("сервер " + res.status);
    const data = await res.json();

    // поддержка нового формата {items,total,page,totalPages} и старого (массив)
    if (Array.isArray(data)) {
      tendersData = data;
      totalCount = data.length;
      currentPage = 1;
      totalPages = 1;
    } else {
      tendersData = data.items || [];
      totalCount = data.total ?? tendersData.length;
      currentPage = data.page ?? page;
      totalPages =
        data.totalPages ?? Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
      if (data.sortBy) sortBy = data.sortBy;
      if (data.sortOrder) sortOrder = data.sortOrder;
    }

    // если страница уехала за пределы (данные изменились) — вернёмся на первую
    if (!tendersData.length && currentPage > 1) {
      return loadTenders(1);
    }

    renderTenders(tendersData);
    setTendersStatus(
      totalCount ? `Тендеров с анализом: ${totalCount}` : "",
      totalCount ? "ok" : "",
    );
  } catch (e) {
    setTendersStatus("Ошибка: " + e.message + " — запущен ли Nest?", "err");
  }
}

// панель фильтров + сортировки
function buildSortBar() {
  const sortOpts = SORT_OPTIONS.map(
    ([v, l]) =>
      `<option value="${v}" ${v === sortBy ? "selected" : ""}>${l}</option>`,
  ).join("");

  const catOpts = ['<option value="">Все категории</option>']
    .concat(
      CATEGORIES.map(
        (c) =>
          `<option value="${c}" ${c === category ? "selected" : ""}>${esc(c)}</option>`,
      ),
    )
    .join("");

  const verdictOpts = [
    ["", "Любой вердикт"],
    ["Стоит участвовать", "Стоит участвовать"],
    ["С осторожностью", "С осторожностью"],
    ["Не рекомендуется", "Не рекомендуется"],
  ]
    .map(
      ([v, l]) =>
        `<option value="${esc(v)}" ${v === verdict ? "selected" : ""}>${esc(l)}</option>`,
    )
    .join("");

  const ratingOpts = ['<option value="">Любой рейтинг</option>']
    .concat(
      ["A+", "A", "B", "C", "D", "F"].map(
        (r) =>
          `<option value="${r}" ${r === rating ? "selected" : ""}>${r}</option>`,
      ),
    )
    .join("");

  const arrow = sortOrder === "DESC" ? "↓ убыв." : "↑ возр.";
  const activeCount = [
    verdict,
    rating,
    minSum,
    minMargin,
    minProfit,
    analyzedOnly,
  ].filter(Boolean).length;
  const inp =
    "padding:5px 8px;width:100%;box-sizing:border-box;font-size:12px;";

  return `
    <div class="sort-bar" style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px;">
      <div style="display:flex;gap:6px;align-items:center;">
        <select id="catFilter" class="btn-mini" style="flex:1;padding:5px 8px;">${catOpts}</select>
        <button id="filtToggle" class="btn-mini ${filtersOpen ? "active" : ""}" title="Фильтры" style="white-space:nowrap;">⚙${activeCount ? ` ${activeCount}` : ""}</button>
      </div>

      <div id="advFilters" ${filtersOpen ? "" : "hidden"} style="display:flex;flex-direction:column;gap:6px;padding:8px;border:1px solid var(--line-soft);border-radius:8px;">
        <div style="display:flex;gap:6px;">
          <select id="fVerdict" class="btn-mini" style="flex:1;padding:5px 8px;">${verdictOpts}</select>
          <select id="fRating" class="btn-mini" style="width:92px;padding:5px 8px;">${ratingOpts}</select>
        </div>
        <div style="display:flex;gap:6px;">
          <input id="fMinSum" class="btn-mini" type="number" inputmode="numeric" placeholder="Сумма от" value="${esc(minSum)}" style="${inp}">
          <input id="fMinProfit" class="btn-mini" type="number" inputmode="numeric" placeholder="Прибыль от" value="${esc(minProfit)}" style="${inp}">
          <input id="fMinMargin" class="btn-mini" type="number" inputmode="numeric" placeholder="Маржа % от" value="${esc(minMargin)}" style="${inp}">
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text-soft);cursor:pointer;">
            <input id="fAnalyzed" type="checkbox" ${analyzedOnly ? "checked" : ""}> только с оценкой
          </label>
          <button id="filtReset" class="btn-mini">Сбросить</button>
        </div>
      </div>

      <div style="display:flex;gap:6px;align-items:center;">
        <span style="font-size:11px;color:var(--text-faint);">Сортировка</span>
        <select id="sortField" class="btn-mini" style="flex:1;padding:5px 8px;">${sortOpts}</select>
        <button id="sortDir" class="btn-mini" title="Сменить направление">${arrow}</button>
      </div>
    </div>`;
}

function bindSortBar() {
  const onChange = (id, fn) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("change", fn);
  };

  onChange("catFilter", (e) => {
    category = e.target.value;
    loadTenders(1);
  });
  onChange("fVerdict", (e) => {
    verdict = e.target.value;
    loadTenders(1);
  });
  onChange("fRating", (e) => {
    rating = e.target.value;
    loadTenders(1);
  });
  onChange("fMinSum", (e) => {
    minSum = e.target.value.trim();
    loadTenders(1);
  });
  onChange("fMinProfit", (e) => {
    minProfit = e.target.value.trim();
    loadTenders(1);
  });
  onChange("fMinMargin", (e) => {
    minMargin = e.target.value.trim();
    loadTenders(1);
  });
  onChange("fAnalyzed", (e) => {
    analyzedOnly = e.target.checked;
    loadTenders(1);
  });
  onChange("sortField", (e) => {
    sortBy = e.target.value;
    loadTenders(1);
  });

  const dir = document.getElementById("sortDir");
  if (dir)
    dir.addEventListener("click", () => {
      sortOrder = sortOrder === "DESC" ? "ASC" : "DESC";
      loadTenders(1);
    });

  // тоггл панели фильтров — без перезагрузки данных
  const toggle = document.getElementById("filtToggle");
  const panel = document.getElementById("advFilters");
  if (toggle && panel) {
    toggle.addEventListener("click", () => {
      filtersOpen = !filtersOpen;
      panel.hidden = !filtersOpen;
      toggle.classList.toggle("active", filtersOpen);
    });
  }

  // сброс всех фильтров
  const reset = document.getElementById("filtReset");
  if (reset)
    reset.addEventListener("click", () => {
      category = "";
      verdict = "";
      rating = "";
      minSum = "";
      minMargin = "";
      minProfit = "";
      analyzedOnly = false;
      loadTenders(1);
    });
}

function renderTenders(items) {
  let html = buildSortBar();

  if (!items.length) {
    html += `
      <div class="empty">
        Пока нет проанализированных тендеров.<br>
        Нажмите «Найти и проанализировать новые» или сделайте анализ вручную.
      </div>`;
    tendersContentEl.innerHTML = html;
    bindSortBar();
    return;
  }

  items.forEach((it, i) => {
    const a = parseAnalysis(it.analysis);
    const vTag = a.verdict
      ? `<span class="tag ${verdictTagClass(a.verdict)}">${esc(a.verdict)}</span>`
      : "";
    const catTag = it.category
      ? `<span class="tag" style="background:var(--line-soft);color:var(--text-soft);">${esc(it.category)}</span>`
      : "";
    const sum = it.plannedSum ? esc(String(it.plannedSum)) : "—";
    const hasDetails =
      it.cost != null ||
      a.lots?.length ||
      a.risks?.length ||
      a.profitable ||
      a.guarantee != null ||
      a.winProbability != null ||
      a.sources?.length;
    html += `
      <div class="list-card">
        <div class="list-name">${esc(it.name)}</div>
        <div class="list-meta">${esc(it.method || "—")} · ${sum}</div>
        <div class="list-meta">Опубл.: ${esc(it.publishDate || "—")} · Срок: ${esc(it.deadline || "—")}</div>
        <div class="tags">${vTag}${catTag}</div>
        ${a.verdictReason ? `<div class="list-reason">${esc(a.verdictReason)}</div>` : ""}
        <div class="list-org">${esc(it.organization || "")}</div>
        <div class="tender-actions">
          ${hasDetails ? `<button class="btn-mini t-toggle" data-idx="${i}">Подробнее</button>` : ""}
          ${it.url ? `<button class="btn-mini t-open" data-url="${esc(it.url)}">Открыть ↗</button>` : ""}
        </div>
        <div class="tender-details" id="tdet-${i}" hidden></div>
      </div>`;
  });

  html += buildPagination(currentPage, totalPages, totalCount);

  tendersContentEl.innerHTML = html;

  bindSortBar();

  tendersContentEl.querySelectorAll(".t-open").forEach((b) => {
    b.addEventListener("click", () => {
      const url = b.getAttribute("data-url");
      if (url) chrome.tabs.create({ url });
    });
  });

  tendersContentEl.querySelectorAll(".t-toggle").forEach((b) => {
    b.addEventListener("click", () => {
      const idx = b.getAttribute("data-idx");
      const det = document.getElementById("tdet-" + idx);
      if (!det) return;
      if (det.hidden) {
        if (!det.innerHTML)
          det.innerHTML = buildAnalysisDetails(tendersData[idx]);
        det.hidden = false;
        b.textContent = "Скрыть";
      } else {
        det.hidden = true;
        b.textContent = "Подробнее";
      }
    });
  });

  // --- навигация по страницам ---
  const prevBtn = tendersContentEl.querySelector(".pg-prev");
  const nextBtn = tendersContentEl.querySelector(".pg-next");
  if (prevBtn) {
    prevBtn.addEventListener("click", () => {
      if (currentPage > 1) {
        loadTenders(currentPage - 1);
        window.scrollTo({ top: 0 });
      }
    });
  }
  if (nextBtn) {
    nextBtn.addEventListener("click", () => {
      if (currentPage < totalPages) {
        loadTenders(currentPage + 1);
        window.scrollTo({ top: 0 });
      }
    });
  }
  tendersContentEl.querySelectorAll(".pg-num").forEach((b) => {
    b.addEventListener("click", () => {
      const p = parseInt(b.getAttribute("data-page"), 10);
      if (p && p !== currentPage) {
        loadTenders(p);
        window.scrollTo({ top: 0 });
      }
    });
  });
}

// список номеров страниц с окном вокруг текущей: [1, …, 4, 5, 6, …, 10]
function pageList(page, pages) {
  const out = [];
  const left = Math.max(2, page - 1);
  const right = Math.min(pages - 1, page + 1);
  out.push(1);
  if (left > 2) out.push("…");
  for (let p = left; p <= right; p++) out.push(p);
  if (right < pages - 1) out.push("…");
  if (pages > 1) out.push(pages);
  return out;
}

function buildPagination(page, pages, total) {
  if (pages <= 1) return "";
  const disStyle = 'style="opacity:.4;cursor:not-allowed;"';

  const nums = pageList(page, pages)
    .map((p) => {
      if (p === "…")
        return `<span style="padding:0 2px;color:var(--text-faint);font-size:12px;">…</span>`;
      const active = p === page;
      const activeStyle = active
        ? 'style="background:var(--accent);color:#fff;border-color:var(--accent);cursor:default;"'
        : "";
      return `<button class="btn-mini pg-num" data-page="${p}" ${active ? "disabled" : ""} ${activeStyle}>${p}</button>`;
    })
    .join("");

  return `
    <div class="pager" style="margin-top:14px;padding-top:12px;border-top:1px solid var(--line-soft);">
      <div style="display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:6px;">
        <button class="btn-mini pg-prev" ${page <= 1 ? `disabled ${disStyle}` : ""}>←</button>
        ${nums}
        <button class="btn-mini pg-next" ${page >= pages ? `disabled ${disStyle}` : ""}>→</button>
      </div>
      <div style="text-align:center;font-size:11px;color:var(--text-faint);margin-top:8px;">Стр. ${page} из ${pages} · всего ${total}</div>
    </div>`;
}

// bigint-колонки из Postgres приходят строками — аккуратно приводим к числу
function toNum(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return isNaN(n) ? null : n;
}
function fmtSom(v) {
  const n = toNum(v);
  return n === null ? "—" : Math.round(n).toLocaleString("ru-RU") + " сом";
}
function fmtPct(v) {
  const n = toNum(v);
  return n === null ? "—" : n + "%";
}
function ratingClass(r) {
  if (r === "A+" || r === "A") return "low"; // зелёный
  if (r === "B" || r === "C") return "ok"; // нейтральный
  return "high"; // D/F/убыток — красный
}

// общая строка label/value (используется в нескольких блоках)
function detailRow(label, value, style = "") {
  return `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--line-soft);font-size:13px;">
       <span style="color:var(--text-soft);">${label}</span>
       <b style="${style}">${value}</b>
     </div>`;
}

// блок юнит-экономики из колонок тендера (ТЗ Шаг 5)
function buildEconomics(it) {
  if (it.cost == null) return ""; // себестоимость не оценена (услуга/работа без данных)

  const net = toNum(it.profit);
  const netColor =
    net === null ? "" : net >= 0 ? "color:var(--green);" : "color:var(--red);";

  const ratingBadge = it.rating
    ? `<span class="badge ${ratingClass(it.rating)}">${esc(it.rating)}</span>`
    : "—";

  return (
    `<div class="block-label">Юнит-экономика</div>` +
    `<div style="margin-bottom:6px;">` +
    detailRow("Цена тендера", fmtSom(it.plannedSum)) +
    detailRow("Себестоимость", fmtSom(it.cost)) +
    detailRow("Валовая прибыль", fmtSom(it.grossProfit)) +
    detailRow("Чистая прибыль", fmtSom(it.profit), netColor + "font-weight:700;") +
    detailRow("Маржа", fmtPct(it.margin)) +
    detailRow("ROI", fmtPct(it.roi)) +
    `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0 2px;font-size:13px;">
       <span style="color:var(--text-soft);">Рейтинг</span>${ratingBadge}
     </div>` +
    `</div>`
  );
}

// обеспечение + вероятность выигрыша (ТЗ Шаг 6 и Шаг 7)
function buildOverview(a) {
  const hasGuarantee = a.guarantee != null && a.guarantee !== "";
  const hasWin = a.winProbability != null;
  if (!hasGuarantee && !hasWin) return "";

  let html = `<div class="block-label">Обеспечение и шансы</div><div style="margin-bottom:6px;">`;

  if (hasGuarantee) {
    html += detailRow("Гарантийное обеспечение", esc(String(a.guarantee)));
  }

  if (hasWin) {
    const wp = toNum(a.winProbability);
    const wpColor =
      wp === null
        ? ""
        : wp >= 60
          ? "color:var(--green);"
          : wp >= 30
            ? "color:var(--text-soft);"
            : "color:var(--red);";
    html += detailRow(
      "Вероятность выигрыша",
      wp === null ? "—" : wp + "%",
      wpColor + "font-weight:700;",
    );
  }
  html += `</div>`;

  if (hasWin && a.winProbabilityNote) {
    html += `<div class="list-reason">${esc(a.winProbabilityNote)}</div>`;
  }
  return html;
}

// разбивка себестоимости лота по компонентам (ТЗ Шаг 4)
function buildCostBreakdown(lot) {
  const cb = lot.costBreakdown;
  if (!cb || typeof cb !== "object") return "";

  const parts = [
    ["Товар / прямые затраты", cb.goods],
    ["Доставка", cb.delivery],
    ["Налоги", cb.taxes],
    ["Комиссии / гарантии", cb.fees],
    ["Резерв", cb.reserve],
  ].filter(([, v]) => toNum(v) !== null);

  if (!parts.length && lot.cost == null) return "";

  let html = `<div class="cost-breakdown" style="margin-top:6px;padding-top:6px;border-top:1px dashed var(--line-soft);">`;
  parts.forEach(([label, v]) => {
    html += `<div style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0;color:var(--text-soft);">
        <span>${label}</span><span>${fmtSom(v)}</span>
      </div>`;
  });
  if (lot.cost != null) {
    html += `<div style="display:flex;justify-content:space-between;font-size:12px;padding:4px 0 2px;font-weight:700;">
        <span>Себестоимость лота</span><span>${fmtSom(lot.cost)}</span>
      </div>`;
  }
  html += `</div>`;
  return html;
}

function buildAnalysisDetails(it) {
  const a = parseAnalysis(it?.analysis);
  let html = buildEconomics(it);
  html += buildOverview(a);

  if (Array.isArray(a.lots) && a.lots.length) {
    html += `<div class="block-label">Лоты и цены</div>`;
    a.lots.forEach((lot) => {
      const pv = (lot.priceVerdict || "").toLowerCase();
      let bc = "ok";
      if (pv.includes("завыш")) bc = "high";
      else if (pv.includes("заниж")) bc = "low";

      const analogs =
        Array.isArray(lot.analogs) && lot.analogs.length
          ? `<div class="lot-analogs" style="margin-top:6px;font-size:12px;color:var(--text-soft);">
               <span style="color:var(--text-faint);">Аналоги:</span> ${lot.analogs.map((x) => esc(String(x))).join(", ")}
             </div>`
          : "";

      html += `<div class="lot-card">
        <div class="lot-head"><div class="lot-name">${esc(lot.name)}</div><div class="lot-type">${esc(lot.type || "")}</div></div>
        <div class="price-row">
          <div class="price-item"><div class="pl">Сумма закупки</div><div class="pv">${esc(lot.procurementSum || "—")}</div></div>
          <div class="price-item"><div class="pl">Рынок</div><div class="pv">${esc(lot.marketPrice || "—")}</div></div>
        </div>
        <span class="badge ${bc}">${esc(lot.priceVerdict || "нет данных")}</span>
        ${analogs}
        ${buildCostBreakdown(lot)}
        ${lot.costNote ? `<div class="lot-comment" style="font-style:italic;">${esc(lot.costNote)}</div>` : ""}
        ${lot.comment ? `<div class="lot-comment">${esc(lot.comment)}</div>` : ""}
      </div>`;
    });
  }

  if (Array.isArray(a.risks) && a.risks.length) {
    html += `<div class="block-label">Риски</div>`;
    a.risks.forEach((r) => {
      html += `<div class="risk-item"><span class="dot">→</span><span>${esc(r)}</span></div>`;
    });
  }

  if (a.profitable)
    html += `<div class="block-label">Выгодность</div><div class="profit">${esc(a.profitable)}</div>`;

  // источники веб-поиска Gemini (если бэк их приложил)
  if (Array.isArray(a.sources) && a.sources.length) {
    html += `<div class="block-label">Источники</div>`;
    a.sources.forEach((s) => {
      const uri = s && s.uri ? String(s.uri) : "";
      if (!uri) return;
      const title = s.title ? esc(String(s.title)) : esc(uri);
      html += `<div class="source-item" style="font-size:12px;padding:3px 0;">
          <a href="#" class="src-link" data-url="${esc(uri)}" style="color:var(--accent);text-decoration:none;">↗ ${title}</a>
        </div>`;
    });
  }

  return html || `<div class="list-reason">Детали анализа отсутствуют.</div>`;
}

// делегирование клика по ссылкам-источникам (открываем во вкладке, а не внутри панели)
tendersContentEl.addEventListener("click", (e) => {
  const link = e.target.closest(".src-link");
  if (!link) return;
  e.preventDefault();
  const url = link.getAttribute("data-url");
  if (url) chrome.tabs.create({ url });
});

// --- кнопка: собрать активные → проанализировать новые ---
tendersScrapeBtn.addEventListener("click", async () => {
  tendersScrapeBtn.disabled = true;
  setTendersStatus("Ищу активные закупки…", "", true);
  try {
    const res = await fetch(API_SCRAPE_ACTIVE, { method: "POST" });
    if (!res.ok) throw new Error("сервер " + res.status);
    pollScrape();
  } catch (e) {
    setTendersStatus(
      "Ошибка запуска: " + e.message + " — запущен ли Nest?",
      "err",
    );
    tendersScrapeBtn.disabled = false;
  }
});

function pollScrape() {
  clearInterval(scrapePoll);
  scrapePoll = setInterval(async () => {
    try {
      const res = await fetch(API_SCRAPE_STATUS);
      const s = await res.json();

      if (s.running) {
        // пока collected=0 идёт сбор страниц, потом анализ — показываем фазу
        const phase =
          s.collected > 0
            ? `Анализирую… ${s.collected}`
            : `Собираю страницы… ${s.pages || 0}`;
        setTendersStatus(phase, "", true);
        return;
      }

      clearInterval(scrapePoll);
      tendersScrapeBtn.disabled = false;

      // сначала обновим список (вдруг что-то успело проанализироваться)
      await loadTenders(1);
      updateBadge();

      // ВАЖНО: статус ошибки ставим ПОСЛЕ loadTenders, иначе он его затирает
      if (s.error) {
        setTendersStatus(
          `⚠ ${s.error}${s.collected ? ` · успело: ${s.collected}` : ""}`,
          "err",
        );
      } else if (s.failed) {
        setTendersStatus(
          `Готово: новых ${s.collected}, не удалось ${s.failed}` +
            (s.lastWarn ? ` · ${s.lastWarn}` : ""),
          "warn",
        );
      } else {
        setTendersStatus(`Готово: новых ${s.collected}`, "ok");
      }
    } catch {
      clearInterval(scrapePoll);
      tendersScrapeBtn.disabled = false;
      setTendersStatus("Потеряна связь с сервером", "err");
    }
  }, 2000);
}

// обновление — перезагружаем текущую страницу
tendersRefreshBtn.addEventListener("click", () => loadTenders(currentPage));