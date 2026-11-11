// Minimal CSV parser (handles quoted fields, escaped quotes and CRLF) + column type detection.

export function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); if (row.length > 1 || row[0] !== '') rows.push(row); }
  return rows;
}

const MISSING = new Set(['', 'na', 'n/a', 'nan', 'null', 'none', '?', 'inf', '-inf', 'infinity', '-infinity']);

/** Converts raw CSV text into a column-oriented table: numeric columns -> Float64Array (NaN = missing). */
export function csvToTable(text) {
  const rows = parseCsv(text.replace(/^﻿/, ''));
  if (rows.length < 2) throw new Error('The CSV file is empty or has no data rows.');
  const header = rows[0].map((h) => h.trim());
  if (header.length < 2) throw new Error('The CSV needs at least 2 columns (features + a target label).');
  const nRows = rows.length - 1;
  if (nRows < 50) throw new Error('The CSV needs at least 50 rows to train and evaluate a model.');

  const columns = header.map((name, j) => {
    const raw = new Array(nRows);
    let nonEmpty = 0, numeric = 0;
    for (let i = 0; i < nRows; i++) {
      const v = (rows[i + 1][j] ?? '').trim();
      raw[i] = v;
      if (!MISSING.has(v.toLowerCase())) {
        nonEmpty++;
        if (v !== '' && Number.isFinite(Number(v))) numeric++;
      }
    }
    if (nonEmpty > 0 && numeric / nonEmpty >= 0.95) {
      const values = new Float64Array(nRows);
      for (let i = 0; i < nRows; i++) {
        const v = raw[i];
        values[i] = MISSING.has(v.toLowerCase()) || !Number.isFinite(Number(v)) ? NaN : Number(v);
      }
      return { name, type: 'numeric', values };
    }
    return { name, type: 'categorical', values: raw.map((v) => (MISSING.has(v.toLowerCase()) ? null : v)) };
  });
  return { nRows, columns };
}

export function tableToCsv(table) {
  const esc = (v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const lines = [table.columns.map((c) => esc(c.name)).join(',')];
  for (let i = 0; i < table.nRows; i++) {
    lines.push(table.columns.map((c) => {
      const v = c.values[i];
      if (c.type === 'numeric') return Number.isNaN(v) ? '' : String(v);
      return v == null ? '' : esc(String(v));
    }).join(','));
  }
  return lines.join('\n');
}

export function previewRows(table, n = 15) {
  return Array.from({ length: Math.min(n, table.nRows) }, (_, i) =>
    table.columns.map((c) => {
      const v = c.values[i];
      return c.type === 'numeric' ? (Number.isNaN(v) ? null : v) : v;
    }));
}
