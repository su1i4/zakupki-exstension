import { API_NEW_COUNT, API_NEW, API_MARK_VIEWED } from "./config.js";
import { bell, bellBadge, newStatusEl, newContentEl, newRefreshBtn } from "./dom.js";
import { esc, fmtSum } from "./utils.js";

let newItems = [];

function setNewStatus(text, type = "", spinner = false) {
  newStatusEl.className = "status" + (type ? " " + type : "");
  newStatusEl.innerHTML = (spinner ? '<span class="spinner"></span>' : "") + text;
}

// опрос баджа (нужен ещё и stats.js — экспортируем)
export async function updateBadge() {
  try {
    const res = await fetch(API_NEW_COUNT);
    if (!res.ok) return;
    const { count } = await res.json();
    if (count > 0) {
      bellBadge.textContent = count > 99 ? "99+" : String(count);
      bellBadge.hidden = false;
    } else {
      bellBadge.hidden = true;
    }
  } catch {
    // бэк недоступен — молча
  }
}

async function markViewed() {
  try {
    await fetch(API_MARK_VIEWED, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
  } catch {}
}

function openNew() {
  document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
  document.querySelectorAll(".pane").forEach((p) => p.classList.remove("active"));
  bell.classList.add("active");
  document.getElementById("pane-new").classList.add("active");
  loadNew(true);
}

async function loadNew(opened = false) {
  setNewStatus("Загружаю…", "", true);
  try {
    const res = await fetch(API_NEW);
    if (!res.ok) throw new Error("сервер " + res.status);
    const items = await res.json();

    const known = new Set(newItems.map((i) => i.number));
    const fresh = items.filter((i) => !known.has(i.number));
    newItems = [...fresh, ...newItems];

    renderNew();

    if (items.length) {
      await markViewed();
      await updateBadge();
      setNewStatus(opened ? "" : `Добавлено новых: ${fresh.length}`, fresh.length ? "ok" : "");
    } else {
      setNewStatus(newItems.length ? "Новых пока нет" : "", "");
    }
  } catch (e) {
    setNewStatus("Ошибка: " + e.message + " — запущен ли Nest?", "err");
  }
}

function renderNew() {
  if (!newItems.length) {
    newContentEl.innerHTML = `
      <div class="empty">
        Пока нет новых закупок.<br>
        Появятся здесь, когда парсер найдёт свежие.
      </div>`;
    return;
  }
  let html = "";
  newItems.forEach((it) => {
    const sum = it.plannedSumRaw || (it.plannedSum ? fmtSum(it.plannedSum) : "—");
    const clickable = it.url ? ` data-url="${esc(it.url)}"` : "";
    html += `
      <div class="list-card${it.url ? " clickable" : ""}"${clickable}>
        <div class="list-name">${esc(it.name)}</div>
        <div class="list-meta">${esc(it.method || "—")} · ${esc(sum)} сом · до ${esc(it.deadline || "—")}</div>
        <div class="list-org">${esc(it.organization || "")}</div>
      </div>`;
  });
  newContentEl.innerHTML = html;
  newContentEl.querySelectorAll(".list-card.clickable").forEach((card) => {
    card.addEventListener("click", () => {
      const url = card.getAttribute("data-url");
      if (url) chrome.tabs.create({ url });
    });
  });
}

bell.addEventListener("click", openNew);
newRefreshBtn.addEventListener("click", () => loadNew(false));

// старт: бадж сразу + опрос пока панель открыта
updateBadge();
setInterval(updateBadge, 25000);