import type { Lead, Deal } from './types';

// Type for deals with lead info (as returned by fetchDeals)
export interface DealWithLead extends Deal {
  lead?: {
    id: string;
    businessName: string;
    niche?: string;
    country?: string;
    city?: string;
    ownerName?: string;
  };
}

/**
 * Escape a value for CSV output.
 * Wraps in double quotes if the value contains commas, double quotes, or newlines.
 * Doubles any existing double quotes within the value.
 */
function escapeCSV(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Convert an array of leads to a CSV string.
 * Columns: Business Name, Owner, Niche, Country, City, Stage, Reply Score,
 * Conversion Score, Urgency Score, Revenue Potential Score, Urgency,
 * Revenue Potential, Has Website, Website Quality, Email, Phone, Website,
 * Best Contact Person, Best Channel, Created At
 */
export function exportLeadsToCSV(leads: Lead[]): string {
  const headers = [
    'Business Name',
    'Owner',
    'Niche',
    'Country',
    'City',
    'Stage',
    'Reply Score',
    'Conversion Score',
    'Urgency Score',
    'Revenue Potential Score',
    'Urgency',
    'Revenue Potential',
    'Has Website',
    'Website Quality',
    'Email',
    'Phone',
    'Website',
    'Best Contact Person',
    'Best Channel',
    'Created At',
  ];

  const rows = leads.map((lead) => [
    lead.businessName,
    lead.ownerName ?? '',
    lead.niche ?? '',
    lead.country ?? '',
    lead.city ?? '',
    lead.stage,
    lead.replyScore,
    lead.conversionScore,
    lead.urgencyScore,
    lead.revenuePotentialScore,
    lead.urgency,
    lead.revenuePotential,
    lead.hasWebsite ? 'Yes' : 'No',
    lead.websiteQuality ?? '',
    lead.email ?? '',
    lead.phone ?? '',
    lead.website ?? '',
    lead.bestContactPerson ?? '',
    lead.bestChannel ?? '',
    lead.createdAt,
  ]);

  const csvLines = [
    headers.map(escapeCSV).join(','),
    ...rows.map((row) => row.map(escapeCSV).join(',')),
  ];

  return csvLines.join('\n');
}

/**
 * Convert an array of deals (with lead info) to a CSV string.
 * Columns: Business Name, Project Type, Status, Proposed Price, Final Price,
 * Currency, Scope, Created At, Updated At
 */
export function exportDealsToCSV(deals: DealWithLead[]): string {
  const headers = [
    'Business Name',
    'Project Type',
    'Status',
    'Proposed Price',
    'Final Price',
    'Currency',
    'Scope',
    'Created At',
    'Updated At',
  ];

  const rows = deals.map((deal) => [
    deal.lead?.businessName ?? '',
    deal.projectType ?? '',
    deal.status,
    deal.proposedPrice ?? '',
    deal.finalPrice ?? '',
    deal.currency,
    deal.projectScope ?? '',
    deal.createdAt,
    deal.updatedAt,
  ]);

  const csvLines = [
    headers.map(escapeCSV).join(','),
    ...rows.map((row) => row.map(escapeCSV).join(',')),
  ];

  return csvLines.join('\n');
}

/**
 * Create a Blob from a CSV string and trigger a browser download.
 */
export function downloadCSV(csvString: string, filename: string): void {
  // Add BOM for proper UTF-8 encoding in Excel
  const bom = '\uFEFF';
  const blob = new Blob([bom + csvString], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();

  // Clean up
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
