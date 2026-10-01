// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Lead Import/Export Service
// Phase 7: CSV/JSON import and export with validation & chunking
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { logAuditEvent } from '@/lib/lead-audit';
import { checkDuplicate } from '@/lib/lead-dedup-service';
import { aliasesFor } from '@/lib/countries';
import ExcelJS from 'exceljs';

// ===== TYPES =====

export interface LeadFilters {
  stage?: string;
  niche?: string;
  country?: string;
  city?: string;
  source?: string;
  minRating?: number;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  // Qualification filters (spec §9/§11.4) — 'true' when set
  hasEmail?: string;
  hasPhone?: string;
  hasWebsite?: string;
  verificationStatus?: string;
  websiteStatus?: string;
}

export interface ImportResult {
  success: boolean;
  total: number;
  imported: number;
  duplicates: number;
  failed: number;
  errors: Array<{ row: number; message: string }>;
  preview?: Array<Record<string, unknown>>;
}

export interface ExportResult {
  success: boolean;
  /** Text formats return a string; .xlsx returns a Node Buffer. */
  data: string | Buffer;
  filename: string;
  contentType: string;
  recordCount: number;
  /** Rows matching the filters — may exceed recordCount when capped. */
  totalMatching?: number;
  error?: string;
}

const IMPORT_MAX_ROWS = parseInt(process.env.IMPORT_MAX_ROWS || '1000', 10);
// Safety ceiling for one export; env-overridable. Exports report — never
// silently hide — when more rows matched than were exported (spec §11.4).
const EXPORT_MAX_ROWS = parseInt(process.env.EXPORT_MAX_ROWS || '20000', 10);

// ===== CSV IMPORT =====

/**
 * Parse and import leads from CSV data.
 * Supports preview mode (parse without saving).
 */
export async function importCSV(
  userId: string,
  csvData: string,
  options?: {
    orgId?: string;
    preview?: boolean;
    skipDuplicates?: boolean;
  }
): Promise<ImportResult> {
  const errors: Array<{ row: number; message: string }> = [];
  let imported = 0;
  let duplicates = 0;
  let failed = 0;

  try {
    // Parse CSV
    const rows = parseCSV(csvData);

    if (rows.length === 0) {
      return { success: false, total: 0, imported: 0, duplicates: 0, failed: 0, errors: [{ row: 0, message: 'No data rows found in CSV' }] };
    }

    if (rows.length > IMPORT_MAX_ROWS) {
      return {
        success: false,
        total: rows.length,
        imported: 0,
        duplicates: 0,
        failed: rows.length,
        errors: [{ row: 0, message: `CSV exceeds maximum of ${IMPORT_MAX_ROWS} rows` }],
      };
    }

    // Preview mode — return parsed data without saving
    if (options?.preview) {
      return {
        success: true,
        total: rows.length,
        imported: 0,
        duplicates: 0,
        failed: 0,
        errors: [],
        preview: rows.slice(0, 20).map((row) => mapCSVRowToLead(row)),
      };
    }

    // Import each row
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const leadData = mapCSVRowToLead(row);

        if (!leadData.businessName) {
          errors.push({ row: i + 2, message: 'Missing required field: businessName' });
          failed++;
          continue;
        }

        // Check for duplicates
        if (options?.skipDuplicates !== false) {
          const dupCheck = await checkDuplicate(userId, {
            businessName: leadData.businessName as string,
            website: leadData.website as string | undefined,
            email: leadData.email as string | undefined,
            phone: leadData.phone as string | undefined,
          });

          if (dupCheck.isDuplicate) {
            duplicates++;
            continue;
          }
        }

        // Create lead
        await db.lead.create({
          data: {
            userId,
            orgId: options?.orgId || null,
            businessName: leadData.businessName as string,
            ownerName: (leadData.ownerName as string) || null,
            website: (leadData.website as string) || null,
            email: (leadData.email as string) || null,
            phone: (leadData.phone as string) || null,
            whatsapp: (leadData.whatsapp as string) || null,
            linkedin: (leadData.linkedin as string) || null,
            instagram: (leadData.instagram as string) || null,
            facebook: (leadData.facebook as string) || null,
            city: (leadData.city as string) || null,
            country: (leadData.country as string) || null,
            niche: (leadData.niche as string) || null,
            source: 'csv_import',
            stage: 'discovered',
            hasWebsite: !!(leadData.website),
            rating: typeof leadData.rating === 'number' ? leadData.rating : null,
          },
        });

        imported++;
      } catch (rowErr) {
        failed++;
        errors.push({ row: i + 2, message: rowErr instanceof Error ? rowErr.message : 'Row processing failed' });
      }
    }

    // Audit log
    await logAuditEvent(userId, 'lead_imported', {
      source: 'csv',
      total: rows.length,
      imported,
      duplicates,
      failed,
    });

    return { success: true, total: rows.length, imported, duplicates, failed, errors };
  } catch (error) {
    return {
      success: false,
      total: 0,
      imported: 0,
      duplicates: 0,
      failed: 0,
      errors: [{ row: 0, message: error instanceof Error ? error.message : 'CSV parsing failed' }],
    };
  }
}

// ===== EXPORT (CSV / XLSX / JSON) =====
// Spec §11: plan-aware bulk export with correct escaping, formula-injection
// protection, Unicode safety, batched server-side pagination (never limited
// to a UI page), and honest record counts (no silent truncation).

/** Columns every plan may receive — no secrets, no internal-only data. */
const EXPORT_HEADERS = [
  'businessName', 'ownerName', 'email', 'phone', 'whatsapp', 'website',
  'linkedin', 'instagram', 'facebook', 'sourceUrl', 'discoveredVia',
  'city', 'country', 'niche', 'employeeCount', 'employeeRange',
  'rating', 'reviews', 'stage', 'source', 'estimatedQuality',
  'estimatedRevenue', 'replyScore', 'conversionScore', 'urgencyScore',
  'revenuePotentialScore', 'hasWebsite', 'websiteQuality', 'websiteStatus',
  'verificationStatus', 'scoreReasoning', 'opportunityNotes', 'notes', 'createdAt',
];

/**
 * Spreadsheet formula-injection guard (spec §11.4): cells starting with
 * = + - @ or a tab/CR could execute as a formula in Excel. Prefix an
 * apostrophe so the value is treated as text.
 */
export function guardFormula(value: string): string {
  if (/^[=+\-@\t\r]/.test(value)) {
    return `'${value}`;
  }
  return value;
}

function cellToString(val: unknown): string {
  if (val === null || val === undefined) return '';
  const str = val instanceof Date ? val.toISOString() : String(val);
  return guardFormula(str);
}

export function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export interface ExportMeta {
  truncated: boolean;
  /** Total rows matching the filters (may exceed the exported count). */
  totalMatching: number;
}

/**
 * Batched, filter-aware lead fetch for exports. Pages through ALL matching
 * rows server-side (batch 500) instead of a single `take` — exports are not
 * limited to what a UI page shows (spec §11.1) and memory stays bounded.
 */
async function getFilteredLeads(
  userId: string,
  filters: LeadFilters,
  maxRows: number
): Promise<{ leads: Array<Record<string, unknown>>; truncated: boolean; totalMatching: number }> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { orgId: true },
  });

  const where: Record<string, unknown> = { isActive: true };

  // Tenant isolation — identical to GET /api/leads
  if (user?.orgId) {
    where.orgId = user.orgId;
  } else {
    where.userId = userId;
  }

  if (filters.stage) where.stage = filters.stage;
  if (filters.niche) where.niche = filters.niche;
  if (filters.city) where.city = { contains: filters.city };
  if (filters.source) where.source = filters.source;
  if (filters.minRating) where.rating = { gte: filters.minRating };
  if (filters.hasEmail === 'true') where.email = { not: null };
  if (filters.hasPhone === 'true') where.phone = { not: null };
  if (filters.hasWebsite === 'true') {
    where.hasWebsite = true;
    where.website = { not: null };
  }
  if (filters.verificationStatus) where.verificationStatus = filters.verificationStatus;
  if (filters.websiteStatus) where.websiteStatus = filters.websiteStatus;

  if (filters.dateFrom || filters.dateTo) {
    const createdAt: Record<string, Date> = {};
    if (filters.dateFrom) createdAt.gte = new Date(filters.dateFrom);
    if (filters.dateTo) createdAt.lte = new Date(filters.dateTo);
    where.createdAt = createdAt;
  }

  // Free-text search — was previously accepted but IGNORED (bug); now applied
  if (filters.search) {
    where.OR = [
      { businessName: { contains: filters.search } },
      { ownerName: { contains: filters.search } },
      { email: { contains: filters.search } },
      { city: { contains: filters.search } },
      { niche: { contains: filters.search } },
    ];
  }

  // Country filter with alias tolerance (same semantics as GET /api/leads)
  const andConds: Array<Record<string, unknown>> = [];
  if (filters.country) {
    andConds.push({ OR: aliasesFor(filters.country).map((v) => ({ country: { contains: v } })) });
  }
  if (filters.search) {
    andConds.push({
      OR: [
        { businessName: { contains: filters.search } },
        { ownerName: { contains: filters.search } },
        { email: { contains: filters.search } },
        { city: { contains: filters.search } },
        { niche: { contains: filters.search } },
      ],
    });
  }
  if (andConds.length > 0) {
    where.AND = andConds;
    delete where.OR;
  }

  const totalMatching = await db.lead.count({ where });

  const BATCH = 500;
  const collected: Array<Record<string, unknown>> = [];
  let skip = 0;
  while (collected.length < maxRows) {
    const batch = (await db.lead.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: Math.min(BATCH, maxRows - collected.length),
    })) as unknown as Array<Record<string, unknown>>;
    if (batch.length === 0) break;
    collected.push(...batch);
    skip += batch.length;
    if (batch.length < BATCH) break;
  }

  return { leads: collected, truncated: collected.length < totalMatching, totalMatching };
}

export async function exportCSV(
  userId: string,
  filters: LeadFilters
): Promise<ExportResult> {
  try {
    const { leads, truncated, totalMatching } = await getFilteredLeads(userId, filters, EXPORT_MAX_ROWS);

    if (leads.length === 0) {
      return { success: false, data: '', filename: '', contentType: 'text/csv', recordCount: 0, error: 'No leads found matching filters' };
    }

    const lines = [EXPORT_HEADERS.join(',')];
    for (const lead of leads) {
      lines.push(
        EXPORT_HEADERS.map((h) => csvEscape(cellToString(lead[h as keyof typeof lead]))).join(',')
      );
    }

    // UTF-8 BOM so Excel opens international characters correctly (spec §11.4)
    const csvData = '\ufeff' + lines.join('\n');
    const filename = `leads_export_${new Date().toISOString().split('T')[0]}.csv`;
    if (truncated) {
      console.warn(`[Export] CSV truncated: exported ${leads.length} of ${totalMatching} matching rows (cap ${EXPORT_MAX_ROWS})`);
    }

    await logAuditEvent(userId, 'export_generated', {
      format: 'csv',
      recordCount: leads.length,
      totalMatching,
      truncated,
      filters,
    });

    return {
      success: true,
      data: csvData,
      filename,
      contentType: 'text/csv; charset=utf-8',
      recordCount: leads.length,
      totalMatching,
      error: truncated ? `Export capped at ${EXPORT_MAX_ROWS} rows — ${totalMatching} leads matched the filters. Narrow the filters or raise EXPORT_MAX_ROWS.` : undefined,
    };
  } catch (error) {
    return {
      success: false,
      data: '',
      filename: '',
      contentType: 'text/csv',
      recordCount: 0,
      error: error instanceof Error ? error.message : 'Export failed',
    };
  }
}

export async function exportXLSX(
  userId: string,
  filters: LeadFilters
): Promise<ExportResult> {
  try {
    const { leads, truncated, totalMatching } = await getFilteredLeads(userId, filters, EXPORT_MAX_ROWS);

    if (leads.length === 0) {
      return { success: false, data: '', filename: '', contentType: '', recordCount: 0, error: 'No leads found matching filters' };
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'AcquisitionOS';
    workbook.created = new Date();
    const sheet = workbook.addWorksheet('Leads');

    // Header row
    sheet.addRow(EXPORT_HEADERS.map((h) =>
      h.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()).trim()
    ));
    sheet.getRow(1).font = { bold: true };

    for (const lead of leads) {
      sheet.addRow(
        EXPORT_HEADERS.map((h) => {
          const raw = lead[h as keyof typeof lead];
          if (raw === null || raw === undefined) return '';
          if (raw instanceof Date) return raw;
          return guardFormula(String(raw));
        })
      );
    }

    // Phone / postal / identifier columns stay TEXT so Excel never mangles them
    const phoneCol = EXPORT_HEADERS.indexOf('phone') + 1;
    const whatsappCol = EXPORT_HEADERS.indexOf('whatsapp') + 1;
    const createdCol = EXPORT_HEADERS.indexOf('createdAt') + 1;
    for (let i = 2; i <= leads.length + 1; i++) {
      if (phoneCol > 0) sheet.getCell(i, phoneCol).numFmt = '@';
      if (whatsappCol > 0) sheet.getCell(i, whatsappCol).numFmt = '@';
      if (createdCol > 0) sheet.getCell(i, createdCol).numFmt = 'yyyy-mm-dd hh:mm:ss';
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const filename = `leads_export_${new Date().toISOString().split('T')[0]}.xlsx`;

    await logAuditEvent(userId, 'export_generated', {
      format: 'xlsx',
      recordCount: leads.length,
      totalMatching,
      truncated,
      filters,
    });

    return {
      success: true,
      data: Buffer.from(buffer as ArrayBuffer),
      filename,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      recordCount: leads.length,
      totalMatching,
      error: truncated ? `Export capped at ${EXPORT_MAX_ROWS} rows — ${totalMatching} leads matched the filters.` : undefined,
    };
  } catch (error) {
    return {
      success: false,
      data: '',
      filename: '',
      contentType: '',
      recordCount: 0,
      error: error instanceof Error ? error.message : 'Export failed',
    };
  }
}

export async function exportJSON(
  userId: string,
  filters: LeadFilters
): Promise<ExportResult> {
  try {
    const { leads, truncated, totalMatching } = await getFilteredLeads(userId, filters, EXPORT_MAX_ROWS);

    if (leads.length === 0) {
      return { success: false, data: '', filename: '', contentType: 'application/json', recordCount: 0, error: 'No leads found matching filters' };
    }

    const jsonData = JSON.stringify(leads, null, 2);
    const filename = `leads_export_${new Date().toISOString().split('T')[0]}.json`;

    await logAuditEvent(userId, 'export_generated', {
      format: 'json',
      recordCount: leads.length,
      truncated,
      filters,
    });

    return {
      success: true,
      data: jsonData,
      filename,
      contentType: 'application/json',
      recordCount: leads.length,
      totalMatching,
      error: truncated ? `Export capped at ${EXPORT_MAX_ROWS} rows — matched leads exceed the cap.` : undefined,
    };
  } catch (error) {
    return {
      success: false,
      data: '',
      filename: '',
      contentType: 'application/json',
      recordCount: 0,
      error: error instanceof Error ? error.message : 'Export failed',
    };
  }
}

// ===== HELPER FUNCTIONS =====

function parseCSV(csvData: string): Record<string, string>[] {
  const lines = csvData.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];

  // Parse header
  const headers = parseCSVLine(lines[0]).map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));

  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((header, idx) => {
      row[header] = (values[idx] || '').trim();
    });
    rows.push(row);
  }

  return rows;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
  }

  result.push(current);
  return result;
}

function mapCSVRowToLead(row: Record<string, string>): Record<string, unknown> {
  return {
    businessName: row.business_name || row.businessname || row.name || row.company || '',
    ownerName: row.owner_name || row.ownername || row.contact || row.contact_name || '',
    email: row.email || row.e_mail || '',
    phone: row.phone || row.telephone || row.mobile || '',
    whatsapp: row.whatsapp || row.whatsapp_number || '',
    website: row.website || row.url || row.web || '',
    linkedin: row.linkedin || row.linkedin_url || '',
    instagram: row.instagram || row.instagram_url || '',
    facebook: row.facebook || row.facebook_url || '',
    city: row.city || row.location || '',
    country: row.country || '',
    niche: row.niche || row.industry || row.category || row.business_type || '',
    rating: row.rating ? parseFloat(row.rating) : undefined,
    reviews: row.reviews || row.review_count || '',
  };
}


