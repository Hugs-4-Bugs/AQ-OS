// ─── Data Export Service ─────────────────────────────────────────
// Comprehensive export utility for AcquisitionOS
// Supports: CSV, JSON, TSV (Excel-compatible) with column selection,
// date formatting, timestamped filenames, and progress callbacks.
// ─────────────────────────────────────────────────────────────────

/** Supported export formats */
export type ExportFormat = 'csv' | 'json' | 'tsv';

/** Column type hint for formatting */
export type ColumnType = 'string' | 'number' | 'date' | 'boolean' | 'currency';

/** Definition of a single exportable column */
export interface ColumnDef {
  key: string;
  label: string;
  type: ColumnType;
  format?: (val: unknown) => string;
}

/** Entity types that have predefined column sets */
export type EntityType = 'leads' | 'deals' | 'activities' | 'workflows';

/** Progress callback signature */
export type ProgressCallback = (progress: { current: number; total: number; percent: number }) => void;

// ─── Column Definitions ────────────────────────────────────────

/** Predefined column definitions for each entity type */
const COLUMN_DEFINITIONS: Record<EntityType, ColumnDef[]> = {
  leads: [
    { key: 'businessName', label: 'Business Name', type: 'string' },
    { key: 'ownerName', label: 'Contact Name', type: 'string' },
    { key: 'email', label: 'Email', type: 'string' },
    { key: 'phone', label: 'Phone', type: 'string' },
    { key: 'website', label: 'Website', type: 'string' },
    { key: 'location', label: 'Location', type: 'string', format: (val: unknown) => {
      // Combine city and country
      const record = val as Record<string, unknown> | undefined;
      if (!record) return '';
      const city = record.city ?? '';
      const country = record.country ?? '';
      return [city, country].filter(Boolean).join(', ');
    }},
    { key: 'niche', label: 'Industry', type: 'string' },
    { key: 'conversionScore', label: 'Score', type: 'number' },
    { key: 'stage', label: 'Stage', type: 'string' },
    { key: 'status', label: 'Status', type: 'string', format: (val: unknown) => {
      const record = val as Record<string, unknown> | undefined;
      if (!record) return '';
      return String(record.stage ?? '');
    }},
    { key: 'source', label: 'Source', type: 'string' },
    { key: 'proposedPrice', label: 'Value', type: 'currency', format: (val: unknown) => {
      const record = val as Record<string, unknown> | undefined;
      if (!record) return '';
      const price = record.proposedPrice ?? record.finalPrice;
      return price ? `$${Number(price).toLocaleString()}` : '';
    }},
    { key: 'createdAt', label: 'Created Date', type: 'date' },
    { key: 'lastContact', label: 'Last Contact', type: 'date' },
    { key: 'tags', label: 'Tags', type: 'string', format: (val: unknown) => {
      const tags = val as string[] | undefined;
      return tags && tags.length > 0 ? tags.join('; ') : '';
    }},
  ],
  deals: [
    { key: 'projectType', label: 'Deal Name', type: 'string' },
    { key: 'company', label: 'Company', type: 'string', format: (val: unknown) => {
      const record = val as Record<string, unknown> | undefined;
      if (!record) return '';
      const lead = record.lead as Record<string, unknown> | undefined;
      return lead?.businessName ? String(lead.businessName) : '';
    }},
    { key: 'proposedPrice', label: 'Value', type: 'currency' },
    { key: 'status', label: 'Stage', type: 'string' },
    { key: 'probability', label: 'Probability', type: 'number', format: (val: unknown) => {
      const record = val as Record<string, unknown> | undefined;
      if (!record) return '';
      // Derive probability from status if not present
      const status = String(record.status ?? '');
      const probabilityMap: Record<string, string> = {
        proposal: '40%', negotiation: '60%', 'closed-won': '100%',
        'closed-lost': '0%', active: '50%', draft: '10%',
      };
      return probabilityMap[status] ?? `${val}`;
    }},
    { key: 'contact', label: 'Contact', type: 'string', format: (val: unknown) => {
      const record = val as Record<string, unknown> | undefined;
      if (!record) return '';
      const lead = record.lead as Record<string, unknown> | undefined;
      return lead?.ownerName ? String(lead.ownerName) : '';
    }},
    { key: 'createdAt', label: 'Created Date', type: 'date' },
    { key: 'closeDate', label: 'Close Date', type: 'date', format: (val: unknown) => {
      const record = val as Record<string, unknown> | undefined;
      if (!record) return '';
      return record.updatedAt ? formatExportValue(record.updatedAt, 'date') : '';
    }},
    { key: 'notes', label: 'Notes', type: 'string' },
  ],
  activities: [
    { key: 'id', label: 'ID', type: 'string' },
    { key: 'leadId', label: 'Lead ID', type: 'string' },
    { key: 'type', label: 'Type', type: 'string' },
    { key: 'description', label: 'Description', type: 'string' },
    { key: 'createdAt', label: 'Date', type: 'date' },
    { key: 'metadata', label: 'Metadata', type: 'string', format: (val: unknown) => {
      if (!val) return '';
      try { return JSON.stringify(val); } catch { return String(val); }
    }},
  ],
  workflows: [
    { key: 'id', label: 'ID', type: 'string' },
    { key: 'name', label: 'Name', type: 'string' },
    { key: 'status', label: 'Status', type: 'string' },
    { key: 'leadCount', label: 'Leads', type: 'number' },
    { key: 'createdAt', label: 'Created', type: 'date' },
    { key: 'updatedAt', label: 'Updated', type: 'date' },
  ],
};

/**
 * Returns the default column definitions for a given entity type.
 * These are used to populate the column picker in the export dialog.
 */
export function getColumnDefs(entityType: EntityType): ColumnDef[] {
  return COLUMN_DEFINITIONS[entityType] ?? [];
}

// ─── Value Formatting ──────────────────────────────────────────

/**
 * Format a single value for export based on its column type.
 * Handles null/undefined, dates, booleans, currency, and custom formatters.
 */
export function formatExportValue(value: unknown, type: ColumnType): string {
  if (value === null || value === undefined) return '';

  switch (type) {
    case 'date': {
      const d = new Date(String(value));
      if (isNaN(d.getTime())) return String(value);
      return d.toLocaleDateString('en-US', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit',
      });
    }
    case 'number': {
      const num = Number(value);
      return isNaN(num) ? String(value) : num.toLocaleString();
    }
    case 'currency': {
      const amount = Number(value);
      if (isNaN(amount)) return String(value);
      return new Intl.NumberFormat('en-US', {
        style: 'currency', currency: 'USD',
        minimumFractionDigits: 0, maximumFractionDigits: 2,
      }).format(amount);
    }
    case 'boolean':
      return value === true || String(value).toLowerCase() === 'true' ? 'Yes' : 'No';
    case 'string':
    default:
      return String(value);
  }
}

// ─── Filename Generation ───────────────────────────────────────

/**
 * Generate a timestamped filename for an export file.
 * Format: `{prefix}-YYYYMMDD-HHmmss.{extension}`
 */
export function generateFilename(prefix: string, extension: string): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const timestamp = [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    '-',
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join('');
  return `${prefix}-${timestamp}.${extension}`;
}

// ─── CSV Escaping ──────────────────────────────────────────────

/**
 * Escape a value for CSV/TSV output.
 * Wraps in double quotes if it contains delimiters, quotes, or newlines.
 */
function escapeCSVField(value: string, delimiter: string): string {
  if (value.includes(delimiter) || value.includes('"') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

// ─── Export: CSV ───────────────────────────────────────────────

/**
 * Export tabular data as a CSV file and trigger browser download.
 * Includes UTF-8 BOM for Excel compatibility.
 *
 * @param data    - Array of row objects
 * @param columns - Column definitions (must have `key` and `label`)
 * @param filename - Desired filename (without extension). Will be auto-generated if empty.
 * @param onProgress - Optional progress callback for large datasets.
 */
export function exportToCSV(
  data: Record<string, unknown>[],
  columns: ColumnDef[],
  filename?: string,
  onProgress?: ProgressCallback,
): void {
  const total = data.length;
  const delimiter = ',';

  // Header row
  const header = columns.map((c) => escapeCSVField(c.label, delimiter)).join(delimiter);

  // Data rows
  const rows: string[] = [];
  for (let i = 0; i < total; i++) {
    const row = data[i];
    const formatted = columns.map((col) => {
      let rawValue: unknown;
      if (col.format) {
        rawValue = col.format(row);
      } else {
        rawValue = row[col.key];
      }
      const formattedValue = col.format
        ? String(rawValue)
        : formatExportValue(rawValue, col.type);
      return escapeCSVField(formattedValue, delimiter);
    });
    rows.push(formatted.join(delimiter));

    // Report progress every 500 rows
    if (onProgress && (i + 1) % 500 === 0) {
      onProgress({ current: i + 1, total, percent: Math.round(((i + 1) / total) * 100) });
    }
  }

  const csvContent = [header, ...rows].join('\n');
  const bom = '\uFEFF';
  const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, filename ?? generateFilename('export', 'csv'));
  onProgress?.({ current: total, total, percent: 100 });
}

// ─── Export: JSON ──────────────────────────────────────────────

/**
 * Export tabular data as a JSON file and trigger browser download.
 * Each row is mapped to an object with human-readable column labels.
 *
 * @param data    - Array of row objects
 * @param columns - Column definitions
 * @param filename - Desired filename (without extension). Auto-generated if empty.
 * @param onProgress - Optional progress callback.
 */
export function exportToJSON(
  data: Record<string, unknown>[],
  columns: ColumnDef[],
  filename?: string,
  onProgress?: ProgressCallback,
): void {
  const total = data.length;
  const exported = data.map((row, i) => {
    const mapped: Record<string, unknown> = {};
    for (const col of columns) {
      let value: unknown;
      if (col.format) {
        value = col.format(row);
      } else {
        value = row[col.key];
      }
      mapped[col.label] = col.format
        ? String(value)
        : formatExportValue(value, col.type);
    }

    if (onProgress && (i + 1) % 500 === 0) {
      onProgress({ current: i + 1, total, percent: Math.round(((i + 1) / total) * 100) });
    }

    return mapped;
  });

  const jsonContent = JSON.stringify(exported, null, 2);
  const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
  triggerDownload(blob, filename ?? generateFilename('export', 'json'));
  onProgress?.({ current: total, total, percent: 100 });
}

// ─── Export: TSV (Excel-compatible) ────────────────────────────

/**
 * Export tabular data as a TSV file and trigger browser download.
 * TSV is well-supported by Excel and other spreadsheet applications.
 *
 * @param data    - Array of row objects
 * @param columns - Column definitions
 * @param filename - Desired filename (without extension). Auto-generated if empty.
 * @param onProgress - Optional progress callback.
 */
export function exportToTSV(
  data: Record<string, unknown>[],
  columns: ColumnDef[],
  filename?: string,
  onProgress?: ProgressCallback,
): void {
  const total = data.length;
  const delimiter = '\t';

  // Header row
  const header = columns.map((c) => escapeCSVField(c.label, delimiter)).join(delimiter);

  // Data rows
  const rows: string[] = [];
  for (let i = 0; i < total; i++) {
    const row = data[i];
    const formatted = columns.map((col) => {
      let rawValue: unknown;
      if (col.format) {
        rawValue = col.format(row);
      } else {
        rawValue = row[col.key];
      }
      const formattedValue = col.format
        ? String(rawValue)
        : formatExportValue(rawValue, col.type);
      return escapeCSVField(formattedValue, delimiter);
    });
    rows.push(formatted.join(delimiter));

    if (onProgress && (i + 1) % 500 === 0) {
      onProgress({ current: i + 1, total, percent: Math.round(((i + 1) / total) * 100) });
    }
  }

  const tsvContent = [header, ...rows].join('\n');
  // BOM for proper UTF-8 display in Excel
  const bom = '\uFEFF';
  const blob = new Blob([bom + tsvContent], { type: 'text/tab-separated-values;charset=utf-8;' });
  triggerDownload(blob, filename ?? generateFilename('export', 'tsv'));
  onProgress?.({ current: total, total, percent: 100 });
}

// ─── Generic Export Dispatcher ─────────────────────────────────

/**
 * Export data to a specified format.
 * Dispatches to the appropriate export function based on the format.
 */
export function exportData(
  format: ExportFormat,
  data: Record<string, unknown>[],
  columns: ColumnDef[],
  filename?: string,
  onProgress?: ProgressCallback,
): void {
  switch (format) {
    case 'csv':
      exportToCSV(data, columns, filename, onProgress);
      break;
    case 'json':
      exportToJSON(data, columns, filename, onProgress);
      break;
    case 'tsv':
      exportToTSV(data, columns, filename, onProgress);
      break;
    default: {
      const _exhaustive: never = format;
      throw new Error(`Unknown export format: ${_exhaustive}`);
    }
  }
}

// ─── Browser Download Helper ───────────────────────────────────

/**
 * Create a temporary anchor element to trigger a file download from a Blob.
 */
function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();

  // Clean up to avoid memory leaks
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ─── MIME Type Helpers ─────────────────────────────────────────

/** Get the file extension for a given export format */
export function getFormatExtension(format: ExportFormat): string {
  const extensions: Record<ExportFormat, string> = {
    csv: 'csv',
    json: 'json',
    tsv: 'tsv',
  };
  return extensions[format];
}

/** Get the MIME type for a given export format */
export function getFormatMimeType(format: ExportFormat): string {
  const mimeTypes: Record<ExportFormat, string> = {
    csv: 'text/csv;charset=utf-8;',
    json: 'application/json;charset=utf-8;',
    tsv: 'text/tab-separated-values;charset=utf-8;',
  };
  return mimeTypes[format];
}

/** Get a human-readable description for each export format */
export function getFormatDescription(format: ExportFormat): string {
  const descriptions: Record<ExportFormat, string> = {
    csv: 'Comma-separated values — works with Excel, Google Sheets, and most data tools.',
    json: 'JSON array — ideal for APIs, databases, and programmatic processing.',
    tsv: 'Tab-separated values — native Excel format with excellent compatibility.',
  };
  return descriptions[format];
}

/** Resolve the data value for a given column from a row object */
export function resolveColumnValue(row: Record<string, unknown>, col: ColumnDef): string {
  if (col.format) {
    return String(col.format(row));
  }
  return formatExportValue(row[col.key], col.type);
}
