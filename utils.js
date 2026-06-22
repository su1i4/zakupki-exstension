export function esc(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

export function fmtSum(n) {
  if (!n && n !== 0) return "—";
  return new Intl.NumberFormat("ru-RU").format(Number(n));
}