const API_BASE = "http://localhost:4000";

export const API_ANALYZE = API_BASE + "/ai/analyze";
export const API_ANALYZE_LIST = API_BASE + "/ai/analyze-list";
export const API_TENDERS_SAVE = API_BASE + "/tenders";
export const API_TENDERS_STATS = API_BASE + "/tenders/stats";

export const API_NEW_COUNT = API_BASE + "/tenders/new-count";
export const API_NEW = API_BASE + "/tenders/new";
export const API_MARK_VIEWED = API_BASE + "/tenders/mark-viewed";

export const API_SCRAPE = API_BASE + "/tenders/scrape";
export const API_SCRAPE_STATUS = API_BASE + "/tenders/scrape/status";
export const API_SCRAPE_ACTIVE = API_BASE + "/tenders/scrape-active";

export const API_PRICE_SOURCES = API_BASE + "/price-sources";

export const CATEGORIES = [
  "Компьютеры", "Принтеры", "Сканеры", "Сетевое оборудование",
  "Медицина", "Строительство", "Автотранспорт", "Продукты",
  "ГСМ", "Канцелярия", "Мебель", "Услуги", "Прочее",
];