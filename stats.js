import { API_TENDERS_STATS } from "./config.js";
import { statsStatusEl, statsContentEl } from "./dom.js";
import { esc, fmtSum } from "./utils.js";

function setStatsStatus(text, type = "", spinner = false) {
  statsStatusEl.className = "status" + (type ? " " + type : "");
  statsStatusEl.innerHTML = (spinner ? '<span class="spinner"></span>' : "") + text;
}

function ratingColor(r) {
  if (r === "A+" || r === "A") return "var(--green)";
  if (r === "B" || r === "C") return "var(--text-soft)";
  return "var(--red)"; // D / F
}

export async function loadStats() {
  setStatsStatus("Загружаю…", "", true);
  statsContentEl.innerHTML = "";
  try {
    const res = await fetch(API_TENDERS_STATS);
    if (!res.ok) throw new Error("сервер " + res.status);
    const s = await res.json();
    renderStats(s);
    setStatsStatus("");
  } catch (e) {
    setStatsStatus("Ошибка: " + e.message + " — запущен ли Nest?", "err");
  }
}

function renderStats(s) {
  if (!s.total) {
    statsContentEl.innerHTML = `
      <div class="empty">
        База пуста.<br>
        Тендеры собираются автоматически<br>с портала закупок.
      </div>`;
    return;
  }

  const v = s.byVerdict || {};
  const go = v["Стоит участвовать"] || 0;
  const care = v["С осторожностью"] || 0;
  const stop = v["Не рекомендуется"] || 0;
  const noVerdict = s.total - go - care - stop;
  const total = go + care + stop;
  const w = (n) => (total ? ((n / total) * 100).toFixed(1) + "%" : "0%");

  let html = `
    <div class="stat-grid">
      <div class="stat-card wide">
        <div class="stat-label">Общая потенциальная прибыль</div>
        <div class="stat-value green">${fmtSum(s.totalProfit)}</div>
        <div class="stat-sub">сом</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Средняя рентабельность</div>
        <div class="stat-value">${s.avgMargin != null ? s.avgMargin + "%" : "—"}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Активных тендеров</div>
        <div class="stat-value">${fmtSum(s.activeCount)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Новых за сегодня</div>
        <div class="stat-value">${fmtSum(s.newToday)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Прибыльных</div>
        <div class="stat-value green">${s.profitableCount ?? 0}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Убыточных</div>
        <div class="stat-value red">${s.lossCount ?? 0}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Низкая маржа (C–D)</div>
        <div class="stat-value">${s.lowMarginCount ?? 0}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Всего проанализировано</div>
        <div class="stat-value">${fmtSum(s.total)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Общая сумма закупок</div>
        <div class="stat-value">${fmtSum(s.totalSum)}</div>
        <div class="stat-sub">сом</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Средняя сумма закупки</div>
        <div class="stat-value">${fmtSum(s.avgSum)}</div>
        <div class="stat-sub">сом</div>
      </div>
      <div class="stat-card wide">
        <div class="stat-label">Распределение вердиктов</div>
        <div class="verdict-bar">
          <div class="vb-go" style="width:${w(go)}"></div>
          <div class="vb-care" style="width:${w(care)}"></div>
          <div class="vb-stop" style="width:${w(stop)}"></div>
        </div>
        <div class="stat-sub">${go} стоит · ${care} осторожно · ${stop} не реком.${noVerdict ? ` · ${noVerdict} без оценки` : ""}</div>
      </div>
    </div>`;

  // рейтинги A+ … F (упорядочены)
  if (s.byRating?.length) {
    const order = ["A+", "A", "B", "C", "D", "F"];
    const sorted = [...s.byRating].sort(
      (a, b) => order.indexOf(a.rating) - order.indexOf(b.rating)
    );
    html += `<div class="block-label">По рейтингу</div>`;
    html += `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px;">`;
    sorted.forEach((r) => {
      html += `<div style="display:flex;align-items:center;gap:6px;padding:4px 10px;border:1px solid var(--line-soft);border-radius:6px;font-size:13px;">
        <b style="color:${ratingColor(r.rating)};">${esc(r.rating)}</b>
        <span style="color:var(--text-soft);">${r.count}</span>
      </div>`;
    });
    html += `</div>`;
  }

  // по категориям
  // по категориям — горизонтальные бары
  if (s.byCategory?.length) {
    const maxCat = Math.max(...s.byCategory.map((c) => c.count));
    html += `<div class="block-label">По категориям</div>`;
    s.byCategory.forEach((c) => {
      const pct = maxCat ? (c.count / maxCat) * 100 : 0;
      html += `
        <div style="margin-bottom:8px;">
          <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px;">
            <span style="color:var(--text-soft);">${esc(c.category)}</span>
            <b>${c.count}</b>
          </div>
          <div style="height:6px;background:var(--line-soft);border-radius:4px;overflow:hidden;">
            <div style="height:100%;width:${pct}%;background:var(--accent);border-radius:4px;"></div>
          </div>
        </div>`;
    });
  }

  // топ заказчиков
  if (s.topOrgs?.length) {
    html += `<div class="block-label">Топ заказчиков</div>`;
    s.topOrgs.forEach((o) => {
      html += `<div class="org-row"><div class="o-name">${esc(o.organization)}</div><div class="o-count">${o.count}</div></div>`;
    });
  }

  statsContentEl.innerHTML = html;
}