// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Lead Import/Export Service
// Phase 7: CSV/JSON import and export with validation & chunking
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { logAuditEvent } from '@/lib/lead-audit';
import { checkDuplicate } from '@/lib/lead-dedup-service';

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
  data: string;
  filename: string;
  contentType: string;
  recordCount: number;
  error?: string;
}

const IMPORT_MAX_ROWS = parseInt(process.env.IMPORT_MAX_ROWS || '1000', 10);
const EXPORT_MAX_ROWS = parseInt(process.env.EXPORT_MAX_ROWS || '5000', 10);

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

// ===== CSV EXPORT =====

/**
 * Export leads as CSV.
 */
export async function exportCSV(
  userId: string,
  filters: LeadFilters
): Promise<ExportResult> {
  try {
    const leads = await getFilteredLeads(userId, filters, EXPORT_MAX_ROWS);

    if (leads.length === 0) {
      return { success: false, data: '', filename: '', contentType: 'text/csv', recordCount: 0, error: 'No leads found matching filters' };
    }

    // Build CSV
    const headers = [
      'businessName', 'ownerName', 'email', 'phone', 'whatsapp', 'website',
      'linkedin', 'instagram', 'facebook', 'city', 'country', 'niche',
      'rating', 'reviews', 'stage', 'source', 'estimatedQuality',
      'estimatedRevenue', 'replyScore', 'conversionScore', 'urgencyScore',
      'revenuePotentialScore', 'hasWebsite', 'websiteQuality', 'createdAt',
    ];

    const csvRows = [headers.join(',')];

    for (const lead of leads) {
      const row = headers.map((h) => {
        const val = lead[h as keyof typeof lead];
        if (val === null || val === undefined) return '';
        const str = String(val);
        // Escape CSV: wrap in quotes if contains comma, quote, or newline
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      });
      csvRows.push(row.join(','));
    }

    const csvData = csvRows.join('\n');
    const filename = `leads_export_${new Date().toISOString().split('T')[0]}.csv`;

    // Audit log
    await logAuditEvent(userId, 'export_generated', {
      format: 'csv',
      recordCount: leads.length,
      filters,
    });

    return {
      success: true,
      data: csvData,
      filename,
      contentType: 'text/csv',
      recordCount: leads.length,
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

// ===== JSON EXPORT =====

/**
 * Export leads as JSON.
 */
export async function exportJSON(
  userId: string,
  filters: LeadFilters
): Promise<ExportResult> {
  try {
    const leads = await getFilteredLeads(userId, filters, EXPORT_MAX_ROWS);

    if (leads.length === 0) {
      return { success: false, data: '', filename: '', contentType: 'application/json', recordCount: 0, error: 'No leads found matching filters' };
    }

    const jsonData = JSON.stringify(leads, null, 2);
    const filename = `leads_export_${new Date().toISOString().split('T')[0]}.json`;

    // Audit log
    await logAuditEvent(userId, 'export_generated', {
      format: 'json',
      recordCount: leads.length,
      filters,
    });

    return {
      success: true,
      data: jsonData,
      filename,
      contentType: 'application/json',
      recordCount: leads.length,
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

async function getFilteredLeads(
  userId: string,
  filters: LeadFilters,
  maxRows: number
): Promise<Array<Record<string, unknown>>> {
  // Get user's orgId
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { orgId: true },
  });

  const where: Record<string, unknown> = {
    isActive: true,
  };

  if (user?.orgId) {
    where.orgId = user.orgId;
  } else {
    where.userId = userId;
  }

  if (filters.stage) where.stage = filters.stage;
  if (filters.niche) where.niche = filters.niche;
  if (filters.country) where.country = filters.country;
  if (filters.city) where.city = filters.city;
  if (filters.source) where.source = filters.source;
  if (filters.minRating) where.rating = { gte: filters.minRating };

  if (filters.dateFrom || filters.dateTo) {
    const createdAt: Record<string, Date> = {};
    if (filters.dateFrom) createdAt.gte = new Date(filters.dateFrom);
    if (filters.dateTo) createdAt.lte = new Date(filters.dateTo);
    where.createdAt = createdAt;
  }

  const leads = await db.lead.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: maxRows,
  });

  return leads as unknown as Array<Record<string, unknown>>;
}
