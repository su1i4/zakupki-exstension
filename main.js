// подключаем модули ради их side-effect'ов (слушатели, инициализация)
import "./page-tab.js";
import "./notifications.js";
import { bell } from "./dom.js";
import { loadStats } from "./stats.js";
import { loadTenders } from "./tenders.js";
import { loadPriceSources } from "./sources.js";

// ============================================================
// Переключение вкладок
// ============================================================
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    bell.classList.remove("active"); // ушли с экрана «Новые»
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".pane").forEach((p) => p.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById("pane-" + tab.dataset.pane).classList.add("active");
    if (tab.dataset.pane === "stats") loadStats();
    if (tab.dataset.pane === "tenders") loadTenders();
    if (tab.dataset.pane === "sources") loadPriceSources();
  });
});