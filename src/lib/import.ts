import type { Lead } from './types';

/**
 * Column mapping from CSV header names to Lead object fields.
 * Supports multiple common header name variations.
 */
const COLUMN_ALIASES: Record<string, keyof Partial<Lead>> = {
  'business name': 'businessName',
  'businessname': 'businessName',
  'business': 'businessName',
  'company': 'businessName',
  'company name': 'businessName',
  'name': 'businessName',
  'owner': 'ownerName',
  'owner name': 'ownerName',
  'ownername': 'ownerName',
  'contact': 'ownerName',
  'contact name': 'ownerName',
  'niche': 'niche',
  'industry': 'niche',
  'category': 'niche',
  'country': 'country',
  'city': 'city',
  'email': 'email',
  'e-mail': 'email',
  'mail': 'email',
  'phone': 'phone',
  'telephone': 'phone',
  'tel': 'phone',
  'mobile': 'phone',
  'website': 'website',
  'url': 'website',
  'web': 'website',
  'domain': 'website',
  'notes': 'notes',
  'note': 'notes',
  'comments': 'notes',
  'description': 'notes',
};

interface ParseResult {
  leads: Partial<Lead>[];
  errors: string[];
}

/**
 * Parse CSV text into an array of partial Lead objects.
 * - First row is treated as the header row
 * - Headers are mapped to Lead fields using COLUMN_ALIASES
 * - Basic validation: businessName is required
 * - Returns parsed leads and any validation errors
 */
export function parseCSVLeads(csvText: string): ParseResult {
  const errors: string[] = [];
  const leads: Partial<Lead>[] = [];

  if (!csvText.trim()) {
    errors.push('CSV file is empty');
    return { leads, errors };
  }

  const lines = splitCSVLines(csvText);
  if (lines.length < 2) {
    errors.push('CSV file must have a header row and at least one data row');
    return { leads, errors };
  }

  // Parse header row
  const headers = parseCSVRow(lines[0]).map((h) => h.trim().toLowerCase());

  // Map headers to Lead field names
  const fieldMap: number[] = []; // index -> field key index or -1
  const fieldNames: (keyof Partial<Lead>)[] = [];

  for (let i = 0; i < headers.length; i++) {
    const alias = COLUMN_ALIASES[headers[i]];
    if (alias) {
      fieldMap.push(fieldNames.length);
      fieldNames.push(alias);
    } else {
      fieldMap.push(-1);
    }
  }

  if (fieldNames.length === 0) {
    errors.push('No recognized column headers found. Expected columns like: Business Name, Owner, Niche, Country, City, Email, Phone, Website, Notes');
    return { leads, errors };
  }

  // Parse data rows
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue; // skip empty rows

    const values = parseCSVRow(line);
    const lead: Partial<Lead> = {};

    for (let j = 0; j < values.length && j < fieldMap.length; j++) {
      const fieldIndex = fieldMap[j];
      if (fieldIndex >= 0 && fieldIndex < fieldNames.length) {
        const fieldName = fieldNames[fieldIndex];
        const value = values[j].trim();
        if (value) {
          (lead as Record<string, string>)[fieldName] = value;
        }
      }
    }

    // Validate: businessName is required
    if (!lead.businessName) {
      errors.push(`Row ${i + 1}: Missing business name`);
      continue;
    }

    leads.push(lead);
  }

  if (leads.length === 0 && errors.length === 0) {
    errors.push('No valid data rows found in CSV file');
  }

  return { leads, errors };
}

/**
 * Read a File object and return its text content using the FileReader API.
 */
export function readCSVFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

/**
 * Split CSV text into lines, respecting quoted fields that may contain newlines.
 */
function splitCSVLines(text: string): string[] {
  const lines: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (char === '"') {
      if (inQuotes && i + 1 < text.length && text[i + 1] === '"') {
        // Escaped double quote
        current += '""';
        i++;
      } else {
        inQuotes = !inQuotes;
        current += char;
      }
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && i + 1 < text.length && text[i + 1] === '\n') {
        i++; // skip \r\n
      }
      lines.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  if (current.trim()) {
    lines.push(current);
  }

  return lines;
}

/**
 * Parse a single CSV row, handling quoted fields with commas.
 */
function parseCSVRow(row: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < row.length; i++) {
    const char = row[i];

    if (char === '"') {
      if (inQuotes && i + 1 < row.length && row[i + 1] === '"') {
        // Escaped double quote -> single quote
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  values.push(current);
  return values;
}
