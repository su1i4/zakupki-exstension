function parseProcurementPage() {
  function getFieldByLabel(labelText) {
    const labels = document.querySelectorAll('.label');
    for (const label of labels) {
      if (label.textContent.trim() === labelText) {
        const next = label.nextElementSibling;
        if (next && next.classList.contains('text')) {
          return next.textContent.trim().replace(/\s+/g, ' ');
        }
      }
    }
    return '';
  }
  const general = {
    number: getFieldByLabel('Номер'),
    name: getFieldByLabel('Наименование закупки'),
    organization: getFieldByLabel('Закупающая организация'),
    method: getFieldByLabel('Метод закупок'),
    plannedSum: getFieldByLabel('Планируемая сумма'),
    publishDate: getFieldByLabel('Дата публикации'),
    deadline: getFieldByLabel('Срок подачи предложений поставщиков'),
  };
  const lots = [];
  document.querySelectorAll('[id$="lotsTable_data"] > tr').forEach((row) => {
    const cells = row.querySelectorAll('td');
    const lot = {};
    cells.forEach((cell) => {
      const labelSpan = cell.querySelector('span:not(.bold)');
      const boldSpan = cell.querySelector('span.bold');
      if (!labelSpan) return;
      const key = labelSpan.textContent.trim();
      let value = boldSpan ? boldSpan.textContent.trim() : cell.textContent.replace(key, '').trim();
      value = value.replace(/\s+/g, ' ');
      if (key === '№') lot.number = value;
      else if (key === 'Наименование лота') lot.name = value;
      else if (key === 'Сумма') lot.sum = value;
      else if (key.includes('Адрес')) lot.place = value;
      else if (key.includes('Сроки поставки')) lot.deliveryTerm = value;
    });
    if (lot.number || lot.name) lots.push(lot);
  });
  const requirements = [];
  document.querySelectorAll('.publicTableData').forEach((table) => {
    const headers = table.querySelector('thead')?.textContent || '';
    if (headers.includes('Квалификация')) {
      table.querySelectorAll('tbody tr').forEach((tr) => {
        const tds = tr.querySelectorAll('td');
        if (tds.length >= 3) {
          requirements.push({
            qualification: tds[1].textContent.trim().replace(/\s+/g, ' '),
            requirement: tds[2].textContent.trim().replace(/\s+/g, ' '),
          });
        }
      });
    }
  });
  return { general, lots, requirements, url: location.href };
}

function parseListPage() {
  function cellValue(cell) {
    const span = cell.querySelector('span');
    let txt = cell.textContent;
    if (span) txt = txt.replace(span.textContent, '');
    return txt.trim().replace(/\s+/g, ' ');
  }
  const items = [];
  document.querySelectorAll('[id$="table_data"] > tr').forEach((row) => {
    const cells = row.querySelectorAll('td');
    if (cells.length < 9) return;
    const item = {
      number: cellValue(cells[0]),
      organization: cellValue(cells[1]),
      type: cellValue(cells[2]),
      name: (cells[3].querySelector('.nameTender')?.textContent || cellValue(cells[3])).trim().replace(/\s+/g, ' '),
      method: cellValue(cells[5]),
      plannedSum: cellValue(cells[6]),
      publishDate: cellValue(cells[7]),
      deadline: cellValue(cells[8]),
    };
    const link = row.querySelector('a[href*="view.xhtml"]');
    if (link) item.url = link.href;
    if (item.number) items.push(item);
  });
  return { items };
}

function detectPageType() {
  const url = location.href;
  if (url.includes('view.xhtml')) return 'detail';
  if (url.includes('list.xhtml')) return 'list';
  if (document.querySelector('[id$="lotsTable_data"]')) return 'detail';
  if (document.querySelector('.nameTender')) return 'list';
  return 'unknown';
}
