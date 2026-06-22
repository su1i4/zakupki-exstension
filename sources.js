import { API_PRICE_SOURCES } from "./config.js";
import {
  srcUrlInput, srcUrlAddBtn, srcFileInput, srcFileBtn,
  srcStatusEl, srcContentEl,
} from "./dom.js";
import { esc } from "./utils.js";

function setSrcStatus(text, type = "", spinner = false) {
  srcStatusEl.className = "status" + (type ? " " + type : "");
  srcStatusEl.innerHTML = (spinner ? '<span class="spinner"></span>' : "") + text;
}

// нужен main.js для переключения вкладок — экспортируем
export async function loadPriceSources() {
  setSrcStatus("Загружаю…", "", true);
  srcContentEl.innerHTML = "";
  try {
    const res = await fetch(API_PRICE_SOURCES);
    if (!res.ok) throw new Error("сервер " + res.status);
    const items = await res.json();
    renderSources(items);
    setSrcStatus(items.length ? `Источников: ${items.length}` : "", items.length ? "ok" : "");
  } catch (e) {
    setSrcStatus("Ошибка: " + e.message + " — запущен ли Nest?", "err");
  }
}

function renderSources(items) {
  if (!items.length) {
    srcContentEl.innerHTML = `
      <div class="empty">
        Источников цен пока нет.<br>
        Добавьте ссылку на сайт или загрузите Excel-прайс.
      </div>`;
    return;
  }

  let html = "";
  items.forEach((it) => {
    const isUrl = it.type === "url";
    const badge = isUrl
      ? `<span class="tag muted">ссылка</span>`
      : `<span class="tag ok">excel</span>`;
    const sub = isUrl
      ? `<a class="source-link" href="${esc(it.url)}" target="_blank">↗ ${esc(it.url)}</a>`
      : `<div class="list-org">файл · ${esc(it.filename || "")}</div>`;
    const offStyle = it.enabled ? "" : "opacity:.5;";

    html += `
      <div class="list-card" style="${offStyle}">
        <div class="tags">${badge}</div>
        <div class="list-name">${esc(it.title)}</div>
        ${sub}
        <div class="tender-actions">
          <button class="btn-mini src-toggle" data-id="${it.id}" data-en="${it.enabled ? 1 : 0}">
            ${it.enabled ? "Выключить" : "Включить"}
          </button>
          <button class="btn-mini src-del" data-id="${it.id}">Удалить</button>
        </div>
      </div>`;
  });
  srcContentEl.innerHTML = html;

  srcContentEl.querySelectorAll(".src-del").forEach((b) => {
    b.addEventListener("click", async () => {
      const id = b.getAttribute("data-id");
      setSrcStatus("Удаляю…", "", true);
      try {
        const r = await fetch(`${API_PRICE_SOURCES}/${id}`, { method: "DELETE" });
        if (!r.ok) throw new Error("сервер " + r.status);
        loadPriceSources();
      } catch (e) {
        setSrcStatus("Ошибка удаления: " + e.message, "err");
      }
    });
  });

  srcContentEl.querySelectorAll(".src-toggle").forEach((b) => {
    b.addEventListener("click", async () => {
      const id = b.getAttribute("data-id");
      const enabled = b.getAttribute("data-en") === "1";
      try {
        const r = await fetch(`${API_PRICE_SOURCES}/${id}/toggle`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled: !enabled }),
        });
        if (!r.ok) throw new Error("сервер " + r.status);
        loadPriceSources();
      } catch (e) {
        setSrcStatus("Ошибка: " + e.message, "err");
      }
    });
  });
}

// --- добавить ссылку ---
srcUrlAddBtn.addEventListener("click", async () => {
  const url = (srcUrlInput.value || "").trim();
  if (!url) { setSrcStatus("Введите ссылку", "err"); return; }
  if (!/^https?:\/\//i.test(url)) {
    setSrcStatus("Ссылка должна начинаться с http:// или https://", "err");
    return;
  }
  setSrcStatus("Добавляю…", "", true);
  try {
    const r = await fetch(`${API_PRICE_SOURCES}/url`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    if (!r.ok) throw new Error("сервер " + r.status);
    srcUrlInput.value = "";
    loadPriceSources();
  } catch (e) {
    setSrcStatus("Не добавил: " + e.message, "err");
  }
});

srcUrlInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") srcUrlAddBtn.click();
});

// --- загрузить файл ---
srcFileBtn.addEventListener("click", () => srcFileInput.click());

srcFileInput.addEventListener("change", async () => {
  const file = srcFileInput.files && srcFileInput.files[0];
  if (!file) return;
  setSrcStatus(`Загружаю «${file.name}»…`, "", true);
  try {
    const fd = new FormData();
    fd.append("file", file);
    const r = await fetch(`${API_PRICE_SOURCES}/upload`, { method: "POST", body: fd });
    if (!r.ok) throw new Error("сервер " + r.status);
    srcFileInput.value = "";
    loadPriceSources();
  } catch (e) {
    setSrcStatus("Ошибка загрузки: " + e.message, "err");
  }
});