// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Advanced Reports Service
// Task 7: Create, execute, export, and schedule reports
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { getDashboardMetrics } from '@/lib/analytics-engine';

// ═══════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════

export type ReportType = 'custom' | 'saved' | 'scheduled';
export type ReportDashboard = 'executive' | 'sales' | 'ai' | 'ops';
export type ExportFormat = 'pdf' | 'csv' | 'json';

export interface ReportCreateData {
  name: string;
  description?: string;
  type: ReportType;
  dashboard?: ReportDashboard;
  filters?: Record<string, unknown>;
  chartConfig?: Record<string, unknown>;
  scheduleCron?: string;
  exportFormat?: ExportFormat;
  isPublic?: boolean;
}

export interface ReportUpdateData {
  name?: string;
  description?: string;
  type?: ReportType;
  dashboard?: ReportDashboard;
  filters?: Record<string, unknown>;
  chartConfig?: Record<string, unknown>;
  scheduleCron?: string;
  exportFormat?: ExportFormat;
  isPublic?: boolean;
}

export interface ReportExecutionResult {
  reportId: string;
  reportName: string;
  dashboard: string;
  filters: Record<string, unknown>;
  chartConfig: Record<string, unknown>;
  data: Record<string, unknown>;
  executedAt: string;
  executionTimeMs: number;
}

export interface ReportTemplate {
  id: string;
  name: string;
  description: string;
  type: ReportType;
  dashboard: ReportDashboard;
  filters: Record<string, unknown>;
  chartConfig: Record<string, unknown>;
  category: string;
}

// ═══════════════════════════════════════════════════════════════════
// VALIDATION HELPERS
// ═══════════════════════════════════════════════════════════════════

const VALID_REPORT_TYPES: ReportType[] = ['custom', 'saved', 'scheduled'];
const VALID_DASHBOARDS: ReportDashboard[] = ['executive', 'sales', 'ai', 'ops'];
const VALID_EXPORT_FORMATS: ExportFormat[] = ['pdf', 'csv', 'json'];

function validateCronExpression(cron: string): boolean {
  // Basic cron validation: 5 or 6 fields separated by spaces
  const parts = cron.trim().split(/\s+/);
  if (parts.length < 5 || parts.length > 6) return false;
  // Each field should only contain valid cron characters
  const validPattern = /^[\d*/,\-?]+$/;
  return parts.every(part => validPattern.test(part));
}

// ═══════════════════════════════════════════════════════════════════
// CREATE REPORT
// ═══════════════════════════════════════════════════════════════════

export async function createReport(
  userId: string,
  data: ReportCreateData
): Promise<{
  id: string;
  name: string;
  description: string | null;
  type: string;
  dashboard: string | null;
  filters: Record<string, unknown>;
  chartConfig: Record<string, unknown>;
  scheduleCron: string | null;
  exportFormat: string;
  isPublic: boolean;
  createdAt: Date;
}> {
  // Validate required fields
  if (!data.name || data.name.trim().length === 0) {
    throw new Error('Report name is required');
  }

  if (!VALID_REPORT_TYPES.includes(data.type)) {
    throw new Error(`Invalid type. Must be one of: ${VALID_REPORT_TYPES.join(', ')}`);
  }

  if (data.dashboard && !VALID_DASHBOARDS.includes(data.dashboard)) {
    throw new Error(`Invalid dashboard. Must be one of: ${VALID_DASHBOARDS.join(', ')}`);
  }

  if (data.exportFormat && !VALID_EXPORT_FORMATS.includes(data.exportFormat)) {
    throw new Error(`Invalid exportFormat. Must be one of: ${VALID_EXPORT_FORMATS.join(', ')}`);
  }

  if (data.scheduleCron && !validateCronExpression(data.scheduleCron)) {
    throw new Error('Invalid cron expression');
  }

  // Get user's orgId for org-scoped reports
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { orgId: true },
  });

  const report = await db.report.create({
    data: {
      userId,
      name: data.name.trim(),
      description: data.description || null,
      type: data.type,
      dashboard: data.dashboard || null,
      filters: JSON.stringify(data.filters || {}),
      chartConfig: JSON.stringify(data.chartConfig || {}),
      scheduleCron: data.scheduleCron || null,
      exportFormat: data.exportFormat || 'json',
      isPublic: data.isPublic || false,
      orgId: user?.orgId || null,
    },
  });

  // If scheduleCron is provided, compute nextRunAt
  if (data.scheduleCron) {
    const nextRunAt = computeNextRunAt(data.scheduleCron);
    await db.report.update({
      where: { id: report.id },
      data: { nextRunAt },
    });
  }

  // Audit log
  await db.auditLog.create({
    data: {
      userId,
      action: 'report_created',
      details: JSON.stringify({
        reportId: report.id,
        name: data.name,
        type: data.type,
        dashboard: data.dashboard,
        hasSchedule: !!data.scheduleCron,
      }),
      resource: 'report',
      resourceId: report.id,
    },
  }).catch(() => {});

  return {
    id: report.id,
    name: report.name ?? data.name.trim(),
    description: report.description,
    type: report.type ?? data.type,
    dashboard: report.dashboard,
    filters: JSON.parse(report.filters ?? '{}'),
    chartConfig: JSON.parse(report.chartConfig ?? '{}'),
    scheduleCron: report.scheduleCron,
    exportFormat: report.exportFormat ?? 'json',
    isPublic: report.isPublic,
    createdAt: report.createdAt,
  };
}

// ═══════════════════════════════════════════════════════════════════
// UPDATE REPORT
// ═══════════════════════════════════════════════════════════════════

export async function updateReport(
  reportId: string,
  userId: string,
  data: ReportUpdateData
): Promise<{
  id: string;
  name: string;
  updatedAt: Date;
}> {
  const report = await db.report.findUnique({ where: { id: reportId } });

  if (!report) {
    throw new Error('Report not found');
  }

  if (report.userId !== userId) {
    throw new Error('Only the report owner can update it');
  }

  // Validate fields
  if (data.type && !VALID_REPORT_TYPES.includes(data.type)) {
    throw new Error(`Invalid type. Must be one of: ${VALID_REPORT_TYPES.join(', ')}`);
  }

  if (data.dashboard && !VALID_DASHBOARDS.includes(data.dashboard)) {
    throw new Error(`Invalid dashboard. Must be one of: ${VALID_DASHBOARDS.join(', ')}`);
  }

  if (data.exportFormat && !VALID_EXPORT_FORMATS.includes(data.exportFormat)) {
    throw new Error(`Invalid exportFormat. Must be one of: ${VALID_EXPORT_FORMATS.join(', ')}`);
  }

  if (data.scheduleCron && !validateCronExpression(data.scheduleCron)) {
    throw new Error('Invalid cron expression');
  }

  const updateData: Record<string, unknown> = {};

  if (data.name !== undefined) updateData.name = data.name.trim();
  if (data.description !== undefined) updateData.description = data.description || null;
  if (data.type !== undefined) updateData.type = data.type;
  if (data.dashboard !== undefined) updateData.dashboard = data.dashboard || null;
  if (data.filters !== undefined) updateData.filters = JSON.stringify(data.filters);
  if (data.chartConfig !== undefined) updateData.chartConfig = JSON.stringify(data.chartConfig);
  if (data.scheduleCron !== undefined) {
    updateData.scheduleCron = data.scheduleCron || null;
    if (data.scheduleCron) {
      updateData.nextRunAt = computeNextRunAt(data.scheduleCron);
    } else {
      updateData.nextRunAt = null;
    }
  }
  if (data.exportFormat !== undefined) updateData.exportFormat = data.exportFormat;
  if (data.isPublic !== undefined) updateData.isPublic = data.isPublic;

  const updated = await db.report.update({
    where: { id: reportId },
    data: updateData,
  });

  // Audit log
  await db.auditLog.create({
    data: {
      userId,
      action: 'report_updated',
      details: JSON.stringify({
        reportId,
        updatedFields: Object.keys(data),
      }),
      resource: 'report',
      resourceId: reportId,
    },
  }).catch(() => {});

  return {
    id: updated.id,
    name: updated.name ?? 'Untitled Report',
    updatedAt: updated.updatedAt,
  };
}

// ═══════════════════════════════════════════════════════════════════
// DELETE REPORT
// ═══════════════════════════════════════════════════════════════════

export async function deleteReport(
  reportId: string,
  userId: string
): Promise<{ success: boolean; message: string }> {
  const report = await db.report.findUnique({ where: { id: reportId } });

  if (!report) {
    throw new Error('Report not found');
  }

  if (report.userId !== userId) {
    throw new Error('Only the report owner can delete it');
  }

  await db.report.delete({ where: { id: reportId } });

  // Audit log
  await db.auditLog.create({
    data: {
      userId,
      action: 'report_deleted',
      details: JSON.stringify({
        reportId,
        reportName: report.name,
        type: report.type,
      }),
      resource: 'report',
      resourceId: reportId,
    },
  }).catch(() => {});

  return { success: true, message: 'Report deleted successfully' };
}

// ═══════════════════════════════════════════════════════════════════
// GET REPORT
// ═══════════════════════════════════════════════════════════════════

export async function getReport(
  reportId: string,
  userId: string
): Promise<{
  id: string;
  userId: string;
  name: string;
  description: string | null;
  type: string;
  dashboard: string | null;
  filters: Record<string, unknown>;
  chartConfig: Record<string, unknown>;
  scheduleCron: string | null;
  lastRunAt: Date | null;
  nextRunAt: Date | null;
  exportFormat: string;
  lastExportUrl: string | null;
  isPublic: boolean;
  orgId: string | null;
  createdAt: Date;
  updatedAt: Date;
} | null> {
  const report = await db.report.findUnique({ where: { id: reportId } });

  if (!report) {
    return null;
  }

  // Verify ownership or public access
  if (report.userId !== userId && !report.isPublic) {
    throw new Error('Access denied');
  }

  return {
    id: report.id,
    userId: report.userId ?? userId,
    name: report.name ?? 'Untitled Report',
    description: report.description,
    type: report.type ?? 'custom',
    dashboard: report.dashboard,
    filters: JSON.parse(report.filters ?? '{}'),
    chartConfig: JSON.parse(report.chartConfig ?? '{}'),
    scheduleCron: report.scheduleCron,
    lastRunAt: report.lastRunAt,
    nextRunAt: report.nextRunAt,
    exportFormat: report.exportFormat ?? 'json',
    lastExportUrl: report.lastExportUrl,
    isPublic: report.isPublic,
    orgId: report.orgId,
    createdAt: report.createdAt,
    updatedAt: report.updatedAt,
  };
}

// ═══════════════════════════════════════════════════════════════════
// GET USER REPORTS
// ═══════════════════════════════════════════════════════════════════

export async function getUserReports(userId: string): Promise<Array<{
  id: string;
  name: string;
  description: string | null;
  type: string;
  dashboard: string | null;
  scheduleCron: string | null;
  lastRunAt: Date | null;
  nextRunAt: Date | null;
  exportFormat: string;
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
}>> {
  const reports = await db.report.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });

  return reports.map(report => ({
    id: report.id,
    name: report.name ?? 'Untitled Report',
    description: report.description,
    type: report.type ?? 'custom',
    dashboard: report.dashboard,
    scheduleCron: report.scheduleCron,
    lastRunAt: report.lastRunAt,
    nextRunAt: report.nextRunAt,
    exportFormat: report.exportFormat ?? 'json',
    isPublic: report.isPublic,
    createdAt: report.createdAt,
    updatedAt: report.updatedAt,
  }));
}

// ═══════════════════════════════════════════════════════════════════
// EXECUTE REPORT
// ═══════════════════════════════════════════════════════════════════

/**
 * Execute a report: run the analytics queries based on report config.
 * Generates data from the analytics engine using the report's dashboard
 * type and filters.
 */
export async function executeReport(
  reportId: string,
  userId: string
): Promise<ReportExecutionResult> {
  const report = await db.report.findUnique({ where: { id: reportId } });

  if (!report) {
    throw new Error('Report not found');
  }

  if (report.userId !== userId && !report.isPublic) {
    throw new Error('Access denied');
  }

  const startTime = Date.now();

  // Parse filters for date range
  const filters: Record<string, unknown> = JSON.parse(report.filters ?? '{}');
  let dateRange: { start: Date; end: Date } | undefined;

  if (filters.dateRange && typeof filters.dateRange === 'object') {
    const dr = filters.dateRange as { start?: string; end?: string };
    if (dr.start && dr.end) {
      dateRange = { start: new Date(dr.start), end: new Date(dr.end) };
    }
  }

  if (filters.period && typeof filters.period === 'string') {
    const now = new Date();
    const periodMs: Record<string, number> = {
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000,
      '90d': 90 * 24 * 60 * 60 * 1000,
      '1y': 365 * 24 * 60 * 60 * 1000,
    };
    const ms = periodMs[filters.period] || periodMs['30d'];
    dateRange = { start: new Date(now.getTime() - ms), end: now };
  }

  // Get user's orgId
  const user = report.userId
    ? await db.user.findUnique({
        where: { id: report.userId },
        select: { orgId: true },
      })
    : null;

  // Fetch dashboard metrics using the analytics engine
  const dashboard = (report.dashboard || 'executive') as ReportDashboard;
  const metrics = await getDashboardMetrics(
    report.userId ?? '',
    user?.orgId || undefined,
    dashboard,
    dateRange
  );

  const executionTimeMs = Date.now() - startTime;

  // Update report's lastRunAt and nextRunAt if scheduled
  const updateData: Record<string, unknown> = {
    lastRunAt: new Date(),
  };

  if (report.scheduleCron) {
    updateData.nextRunAt = computeNextRunAt(report.scheduleCron);
  }

  await db.report.update({
    where: { id: reportId },
    data: updateData,
  });

  // Audit log
  await db.auditLog.create({
    data: {
      userId: report.userId ?? undefined,
      action: 'report_executed',
      details: JSON.stringify({
        reportId,
        reportName: report.name,
        dashboard,
        executionTimeMs,
        dateRange: dateRange
          ? { start: dateRange.start.toISOString(), end: dateRange.end.toISOString() }
          : null,
      }),
      resource: 'report',
      resourceId: reportId,
    },
  }).catch(() => {});

  return {
    reportId,
    reportName: report.name ?? 'Untitled Report',
    dashboard,
    filters: JSON.parse(report.filters ?? '{}'),
    chartConfig: JSON.parse(report.chartConfig ?? '{}'),
    data: metrics as unknown as Record<string, unknown>,
    executedAt: new Date().toISOString(),
    executionTimeMs,
  };
}

// ═══════════════════════════════════════════════════════════════════
// EXPORT REPORT CSV
// ═══════════════════════════════════════════════════════════════════

/**
 * Export report data as CSV string content.
 * Flattens the metrics data into rows suitable for CSV.
 */
export async function exportReportCSV(
  reportId: string,
  userId: string
): Promise<{ csv: string; filename: string }> {
  const execution = await executeReport(reportId, userId);
  const data = execution.data;

  // Flatten nested metrics into tabular rows
  const rows: Record<string, string | number>[] = [];
  const timestamp = execution.executedAt;

  // Process each metric category in the data
  for (const [category, value] of Object.entries(data)) {
    if (category === 'generatedAt') continue;

    if (typeof value === 'object' && value !== null) {
      const metricObj = value as Record<string, unknown>;

      // Handle arrays (time series, breakdowns)
      for (const [key, val] of Object.entries(metricObj)) {
        if (Array.isArray(val)) {
          for (const item of val) {
            if (typeof item === 'object' && item !== null) {
              rows.push({
                category,
                metric: key,
                timestamp,
                ...flattenObject(item as Record<string, unknown>),
              });
            }
          }
        } else if (typeof val === 'object' && val !== null) {
          // Handle nested objects (like avgScores)
          rows.push({
            category,
            metric: key,
            timestamp,
            ...flattenObject(val as Record<string, unknown>),
          });
        } else {
          // Handle primitive values
          rows.push({
            category,
            metric: key,
            timestamp,
            value: String(val ?? ''),
          });
        }
      }
    }
  }

  // Generate CSV
  if (rows.length === 0) {
    const csv = 'category,metric,timestamp,value\nno_data,,,';
    const filename = `report-${execution.reportName.replace(/\s+/g, '_')}-${Date.now()}.csv`;

    await storeExportUrl(reportId, userId, filename);
    return { csv, filename };
  }

  // Collect all unique column headers
  const headers = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      headers.add(key);
    }
  }
  const headerArr = Array.from(headers);

  // Build CSV rows
  const csvLines: string[] = [headerArr.map(escapeCsvField).join(',')];
  for (const row of rows) {
    csvLines.push(headerArr.map(h => escapeCsvField(String(row[h] ?? ''))).join(','));
  }

  const csv = csvLines.join('\n');
  const filename = `report-${execution.reportName.replace(/\s+/g, '_')}-${Date.now()}.csv`;

  await storeExportUrl(reportId, userId, filename);

  // Audit log
  await db.auditLog.create({
    data: {
      userId,
      action: 'report_exported_csv',
      details: JSON.stringify({
        reportId,
        reportName: execution.reportName,
        filename,
        rowCount: rows.length,
      }),
      resource: 'report',
      resourceId: reportId,
    },
  }).catch(() => {});

  return { csv, filename };
}

// ═══════════════════════════════════════════════════════════════════
// EXPORT REPORT JSON
// ═══════════════════════════════════════════════════════════════════

/**
 * Export report data as JSON string.
 */
export async function exportReportJSON(
  reportId: string,
  userId: string
): Promise<{ json: string; filename: string }> {
  const execution = await executeReport(reportId, userId);

  const exportData = {
    report: {
      id: execution.reportId,
      name: execution.reportName,
      dashboard: execution.dashboard,
    },
    filters: execution.filters,
    chartConfig: execution.chartConfig,
    data: execution.data,
    executedAt: execution.executedAt,
    executionTimeMs: execution.executionTimeMs,
  };

  const json = JSON.stringify(exportData, null, 2);
  const filename = `report-${execution.reportName.replace(/\s+/g, '_')}-${Date.now()}.json`;

  await storeExportUrl(reportId, userId, filename);

  // Audit log
  await db.auditLog.create({
    data: {
      userId,
      action: 'report_exported_json',
      details: JSON.stringify({
        reportId,
        reportName: execution.reportName,
        filename,
      }),
      resource: 'report',
      resourceId: reportId,
    },
  }).catch(() => {});

  return { json, filename };
}

// ═══════════════════════════════════════════════════════════════════
// EXPORT REPORT PDF (structured data for PDF rendering)
// ═══════════════════════════════════════════════════════════════════

/**
 * Generate a structured PDF-like data object.
 * Since we can't easily generate real PDFs in this environment,
 * we create a structured report object with all data formatted
 * for PDF rendering.
 */
export async function exportReportPDF(
  reportId: string,
  userId: string
): Promise<{ pdfData: Record<string, unknown>; filename: string }> {
  const execution = await executeReport(reportId, userId);

  // Build a structured document suitable for PDF rendering
  const pdfData: Record<string, unknown> = {
    document: {
      title: `AcquisitionOS Report: ${execution.reportName}`,
      subtitle: `${execution.dashboard} Dashboard — Generated ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`,
      generatedAt: execution.executedAt,
      executionTimeMs: execution.executionTimeMs,
    },
    metadata: {
      reportId: execution.reportId,
      reportName: execution.reportName,
      dashboard: execution.dashboard,
      filters: execution.filters,
      chartConfig: execution.chartConfig,
    },
    sections: buildPdfSections(execution.data),
    footer: {
      text: 'Generated by AcquisitionOS Analytics',
      disclaimer: 'This report is for informational purposes only. Data is based on real-time analytics.',
    },
  };

  const filename = `report-${execution.reportName.replace(/\s+/g, '_')}-${Date.now()}.pdf`;

  // Store the export URL
  await db.report.update({
    where: { id: reportId },
    data: { lastExportUrl: filename },
  });

  // Audit log
  await db.auditLog.create({
    data: {
      userId,
      action: 'report_exported_pdf',
      details: JSON.stringify({
        reportId,
        reportName: execution.reportName,
        filename,
      }),
      resource: 'report',
      resourceId: reportId,
    },
  }).catch(() => {});

  return { pdfData, filename };
}

// ═══════════════════════════════════════════════════════════════════
// SCHEDULE REPORT
// ═══════════════════════════════════════════════════════════════════

/**
 * Set up scheduled execution for a report via cron expression.
 * Updates the report type to 'scheduled' and sets the cron + nextRunAt.
 */
export async function scheduleReport(
  reportId: string,
  userId: string,
  cronExpression: string
): Promise<{
  reportId: string;
  scheduleCron: string;
  nextRunAt: Date;
}> {
  const report = await db.report.findUnique({ where: { id: reportId } });

  if (!report) {
    throw new Error('Report not found');
  }

  if (report.userId !== userId) {
    throw new Error('Only the report owner can schedule it');
  }

  if (!validateCronExpression(cronExpression)) {
    throw new Error('Invalid cron expression. Expected format: minute hour day month weekday');
  }

  const nextRunAt = computeNextRunAt(cronExpression);

  await db.report.update({
    where: { id: reportId },
    data: {
      type: 'scheduled',
      scheduleCron: cronExpression,
      nextRunAt,
    },
  });

  // Audit log
  await db.auditLog.create({
    data: {
      userId,
      action: 'report_scheduled',
      details: JSON.stringify({
        reportId,
        reportName: report.name,
        scheduleCron: cronExpression,
        nextRunAt: nextRunAt.toISOString(),
      }),
      resource: 'report',
      resourceId: reportId,
    },
  }).catch(() => {});

  return { reportId, scheduleCron: cronExpression, nextRunAt };
}

// ═══════════════════════════════════════════════════════════════════
// UNSCHEDULE REPORT
// ═══════════════════════════════════════════════════════════════════

/**
 * Remove the schedule from a report.
 * Changes type back to 'saved' and clears cron + nextRunAt.
 */
export async function unscheduleReport(
  reportId: string,
  userId: string
): Promise<{ reportId: string; message: string }> {
  const report = await db.report.findUnique({ where: { id: reportId } });

  if (!report) {
    throw new Error('Report not found');
  }

  if (report.userId !== userId) {
    throw new Error('Only the report owner can unschedule it');
  }

  if (!report.scheduleCron) {
    return { reportId, message: 'Report is not scheduled' };
  }

  await db.report.update({
    where: { id: reportId },
    data: {
      type: 'saved',
      scheduleCron: null,
      nextRunAt: null,
    },
  });

  // Audit log
  await db.auditLog.create({
    data: {
      userId,
      action: 'report_unscheduled',
      details: JSON.stringify({
        reportId,
        reportName: report.name,
        previousCron: report.scheduleCron,
      }),
      resource: 'report',
      resourceId: reportId,
    },
  }).catch(() => {});

  return { reportId, message: 'Report schedule removed successfully' };
}

// ═══════════════════════════════════════════════════════════════════
// GET REPORT HISTORY
// ═══════════════════════════════════════════════════════════════════

/**
 * Get execution history for a report from the AuditLog.
 * Looks for report_executed, report_exported_* actions associated with this report.
 */
export async function getReportHistory(
  reportId: string,
  userId: string
): Promise<Array<{
  id: string;
  action: string;
  details: Record<string, unknown> | null;
  createdAt: Date;
}>> {
  const report = await db.report.findUnique({ where: { id: reportId } });

  if (!report) {
    throw new Error('Report not found');
  }

  if (report.userId !== userId) {
    throw new Error('Access denied');
  }

  const historyLogs = await db.auditLog.findMany({
    where: {
      resourceId: reportId,
      resource: 'report',
      action: {
        in: [
          'report_created',
          'report_updated',
          'report_executed',
          'report_exported_csv',
          'report_exported_json',
          'report_exported_pdf',
          'report_scheduled',
          'report_unscheduled',
          'report_deleted',
        ],
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  return historyLogs.map(log => ({
    id: log.id,
    action: log.action,
    details: log.details ? JSON.parse(log.details) : null,
    createdAt: log.createdAt,
  }));
}

// ═══════════════════════════════════════════════════════════════════
// RETRY REPORT
// ═══════════════════════════════════════════════════════════════════

/**
 * Retry a failed report execution.
 * Checks the audit log for a failed execution, then re-runs the report.
 */
export async function retryReport(
  reportId: string,
  userId: string
): Promise<ReportExecutionResult> {
  const report = await db.report.findUnique({ where: { id: reportId } });

  if (!report) {
    throw new Error('Report not found');
  }

  if (report.userId !== userId) {
    throw new Error('Only the report owner can retry execution');
  }

  // Check for recent failed execution in audit log
  const failedLog = await db.auditLog.findFirst({
    where: {
      resourceId: reportId,
      resource: 'report',
      action: 'report_execution_failed',
    },
    orderBy: { createdAt: 'desc' },
  });

  // Whether or not we find a failed log, we re-execute.
  // The existence of a failed log just confirms the retry context.
  try {
    const result = await executeReport(reportId, userId);

    // Audit log for retry
    await db.auditLog.create({
      data: {
        userId,
        action: 'report_retry_succeeded',
        details: JSON.stringify({
          reportId,
          reportName: report.name,
          previousFailedExecutionId: failedLog?.id || null,
          newExecutionTimeMs: result.executionTimeMs,
        }),
        resource: 'report',
        resourceId: reportId,
      },
    }).catch(() => {});

    return result;
  } catch (error) {
    // Log the failure
    await db.auditLog.create({
      data: {
        userId,
        action: 'report_execution_failed',
        details: JSON.stringify({
          reportId,
          reportName: report.name,
          error: error instanceof Error ? error.message : 'Unknown error',
          retriedFrom: failedLog?.id || null,
        }),
        resource: 'report',
        resourceId: reportId,
      },
    }).catch(() => {});

    throw error;
  }
}

// ═══════════════════════════════════════════════════════════════════
// GET REPORT TEMPLATES
// ═══════════════════════════════════════════════════════════════════

/**
 * Return predefined report templates.
 * Templates provide starting configurations for common report types.
 */
export function getReportTemplates(_userId: string): ReportTemplate[] {
  return [
    {
      id: 'executive_summary',
      name: 'Executive Summary',
      description: 'High-level overview of all key business metrics including leads, revenue, AI usage, and workflow health.',
      type: 'saved',
      dashboard: 'executive',
      filters: {
        period: '30d',
        includeComparison: true,
      },
      chartConfig: {
        primaryChart: 'line',
        secondaryChart: 'bar',
        layout: 'grid',
        sections: ['leads_overview', 'revenue_summary', 'ai_usage', 'workflow_health'],
      },
      category: 'overview',
    },
    {
      id: 'sales_performance',
      name: 'Sales Performance',
      description: 'Detailed sales funnel metrics, lead conversion rates, channel performance, and messaging effectiveness.',
      type: 'saved',
      dashboard: 'sales',
      filters: {
        period: '30d',
        includeFunnel: true,
        includeChannelBreakdown: true,
      },
      chartConfig: {
        primaryChart: 'funnel',
        secondaryChart: 'line',
        layout: 'vertical',
        sections: ['conversion_funnel', 'channel_breakdown', 'daily_volume', 'response_rates'],
      },
      category: 'sales',
    },
    {
      id: 'ai_usage',
      name: 'AI Usage Report',
      description: 'AI credit consumption, model usage breakdown, chat session analytics, and efficiency metrics.',
      type: 'saved',
      dashboard: 'ai',
      filters: {
        period: '30d',
        includeCreditBreakdown: true,
        includeModelUsage: true,
      },
      chartConfig: {
        primaryChart: 'bar',
        secondaryChart: 'pie',
        layout: 'grid',
        sections: ['credit_usage', 'model_distribution', 'analysis_volume', 'chat_usage'],
      },
      category: 'ai',
    },
    {
      id: 'ops_health',
      name: 'Operations Health',
      description: 'Workflow execution metrics, system reliability, queue depth, and message delivery performance.',
      type: 'saved',
      dashboard: 'ops',
      filters: {
        period: '7d',
        includeWorkflowMetrics: true,
        includeDeliveryMetrics: true,
      },
      chartConfig: {
        primaryChart: 'line',
        secondaryChart: 'bar',
        layout: 'grid',
        sections: ['execution_summary', 'success_failure_rate', 'runtime_distribution', 'delivery_performance'],
      },
      category: 'operations',
    },
  ];
}

// ═══════════════════════════════════════════════════════════════════
// INTERNAL HELPERS
// ═══════════════════════════════════════════════════════════════════

/**
 * Compute the next run time based on a cron expression.
 * This is a simplified implementation that provides approximate scheduling.
 */
function computeNextRunAt(cronExpression: string): Date {
  const parts = cronExpression.trim().split(/\s+/);
  const now = new Date();

  // Parse cron fields (minute hour day month weekday)
  const minute = parts[0] || '0';
  const hour = parts[1] || '0';
  const dayOfMonth = parts[2] || '*';
  const month = parts[3] || '*';
  const dayOfWeek = parts[4] || '*';

  // Start with the next occurrence
  const next = new Date(now);
  next.setSeconds(0, 0);

  // Handle simple numeric values
  if (minute !== '*' && !minute.includes('/') && !minute.includes(',') && !minute.includes('-')) {
    next.setMinutes(parseInt(minute, 10));
  } else if (minute.startsWith('*/')) {
    const interval = parseInt(minute.slice(2), 10);
    const currentMinute = next.getMinutes();
    next.setMinutes(currentMinute + (interval - (currentMinute % interval)));
  }

  if (hour !== '*' && !hour.includes('/') && !hour.includes(',') && !hour.includes('-')) {
    const targetHour = parseInt(hour, 10);
    if (next.getHours() > targetHour ||
        (next.getHours() === targetHour && next.getMinutes() <= now.getMinutes())) {
      next.setDate(next.getDate() + 1);
    }
    next.setHours(targetHour);
  } else if (hour.startsWith('*/')) {
    const interval = parseInt(hour.slice(2), 10);
    const currentHour = next.getHours();
    next.setHours(currentHour + (interval - (currentHour % interval)));
    if (next <= now) {
      next.setHours(next.getHours() + interval);
    }
  }

  // If the computed time is in the past, advance by one day
  if (next <= now) {
    next.setDate(next.getDate() + 1);
  }

  // Handle specific day of month
  if (dayOfMonth !== '*' && !dayOfMonth.includes('/')) {
    const targetDay = parseInt(dayOfMonth, 10);
    if (next.getDate() !== targetDay) {
      if (next.getDate() > targetDay) {
        next.setMonth(next.getMonth() + 1);
      }
      next.setDate(targetDay);
    }
  }

  // Handle specific month
  if (month !== '*' && !month.includes('/')) {
    const targetMonth = parseInt(month, 10) - 1; // JS months are 0-indexed
    if (next.getMonth() !== targetMonth) {
      next.setMonth(targetMonth);
      if (next <= now) {
        next.setFullYear(next.getFullYear() + 1);
      }
    }
  }

  // Handle specific day of week (0 = Sunday)
  if (dayOfWeek !== '*' && !dayOfWeek.includes('/')) {
    const targetDow = parseInt(dayOfWeek, 10);
    const currentDow = next.getDay();
    const daysUntil = (targetDow - currentDow + 7) % 7;
    if (daysUntil === 0 && next <= now) {
      next.setDate(next.getDate() + 7);
    } else if (daysUntil > 0) {
      next.setDate(next.getDate() + daysUntil);
    }
  }

  return next;
}

/**
 * Flatten a nested object into a single-level object with dot-notation keys.
 */
function flattenObject(obj: Record<string, unknown>, prefix = ''): Record<string, string | number> {
  const result: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(obj)) {
    const newKey = prefix ? `${prefix}_${key}` : key;
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      Object.assign(result, flattenObject(value as Record<string, unknown>, newKey));
    } else if (Array.isArray(value)) {
      result[newKey] = JSON.stringify(value);
    } else if (typeof value === 'number') {
      result[newKey] = value;
    } else {
      result[newKey] = String(value ?? '');
    }
  }
  return result;
}

/**
 * Escape a CSV field: wrap in quotes if it contains commas, quotes, or newlines.
 */
function escapeCsvField(field: string): string {
  if (field.includes(',') || field.includes('"') || field.includes('\n') || field.includes('\r')) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

/**
 * Store the export filename as the lastExportUrl for a report.
 */
async function storeExportUrl(reportId: string, userId: string, filename: string): Promise<void> {
  try {
    await db.report.update({
      where: { id: reportId },
      data: { lastExportUrl: filename },
    });
  } catch {
    // Non-critical: don't fail the export if we can't update the URL
  }

  void userId; // used for audit logging in the calling functions
}

/**
 * Build PDF sections from the metrics data.
 * Organizes the data into logical sections for PDF rendering.
 */
function buildPdfSections(data: Record<string, unknown>): Array<Record<string, unknown>> {
  const sections: Array<Record<string, unknown>> = [];

  for (const [key, value] of Object.entries(data)) {
    if (key === 'generatedAt' || value === null || value === undefined) continue;

    const section: Record<string, unknown> = {
      title: formatSectionTitle(key),
      type: key,
    };

    if (typeof value === 'object' && value !== null) {
      const metricObj = value as Record<string, unknown>;

      // Extract summary metrics (non-array, non-object values)
      const summary: Record<string, unknown> = {};
      const charts: Array<Record<string, unknown>> = [];
      const tables: Array<Record<string, unknown>> = [];

      for (const [metricKey, metricVal] of Object.entries(metricObj)) {
        if (metricVal === null || metricVal === undefined) continue;

        if (Array.isArray(metricVal)) {
          if (metricVal.length > 0) {
            if (typeof metricVal[0] === 'object' && metricVal[0] !== null) {
              tables.push({
                title: formatSectionTitle(metricKey),
                headers: Object.keys(metricVal[0] as Record<string, unknown>),
                rows: metricVal.map(item => {
                  if (typeof item === 'object' && item !== null) {
                    return Object.values(item as Record<string, unknown>).map(v =>
                      typeof v === 'number' ? Math.round(v * 100) / 100 : String(v ?? '')
                    );
                  }
                  return [String(item)];
                }),
              });
            } else {
              charts.push({
                title: formatSectionTitle(metricKey),
                type: 'list',
                data: metricVal,
              });
            }
          }
        } else if (typeof metricVal === 'object') {
          // Nested objects become sub-metrics
          for (const [subKey, subVal] of Object.entries(metricVal as Record<string, unknown>)) {
            summary[`${metricKey}_${subKey}`] = typeof subVal === 'number'
              ? Math.round(subVal * 100) / 100
              : subVal;
          }
        } else {
          summary[metricKey] = typeof metricVal === 'number'
            ? Math.round(metricVal * 100) / 100
            : metricVal;
        }
      }

      if (Object.keys(summary).length > 0) {
        section.summary = summary;
      }
      if (charts.length > 0) {
        section.charts = charts;
      }
      if (tables.length > 0) {
        section.tables = tables;
      }
    }

    sections.push(section);
  }

  return sections;
}

/**
 * Format a camelCase or snake_case key into a readable title.
 */
function formatSectionTitle(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .replace(/^\s+|\s+$/g, '')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}
