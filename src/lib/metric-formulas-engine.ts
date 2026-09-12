// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Metric Formulas Engine
// Create, validate, execute, and manage custom analytics formulas
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';

// ===== TYPES =====

export interface FormulaVariable {
  name: string;
  source: 'lead' | 'ai' | 'billing' | 'workflow' | 'formula';
  field: string;
  filter?: string;
  aggregate?: 'count' | 'sum' | 'avg' | 'min' | 'max';
}

export interface FormulaCreateInput {
  name: string;
  description?: string;
  formula: string;
  variables?: FormulaVariable[];
  resultType?: 'percentage' | 'ratio' | 'absolute';
  category?: string;
  isPublic?: boolean;
}

export interface FormulaUpdateInput {
  name?: string;
  description?: string;
  formula?: string;
  variables?: FormulaVariable[];
  resultType?: 'percentage' | 'ratio' | 'absolute';
  category?: string;
  isPublic?: boolean;
}

export interface FormulaValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  extractedVariables: string[];
}

export interface FormulaExecutionResult {
  formulaId: string;
  result: number;
  resultType: string;
  variables: Record<string, number>;
  computedAt: Date;
}

// ===== FORMULA PARSING & VALIDATION =====

/** Valid operators allowed in formulas */
const VALID_OPERATORS = ['+', '-', '*', '/', '(', ')', '%', '^'];
const VALID_FUNCTIONS = ['abs', 'round', 'floor', 'ceil', 'min', 'max', 'sqrt', 'log', 'pow'];

/** Extract variable names from a formula string */
export function extractVariableNames(formula: string): string[] {
  // Remove all operators, numbers, functions, and whitespace
  let cleaned = formula;

  // Remove known functions
  for (const fn of VALID_FUNCTIONS) {
    cleaned = cleaned.replace(new RegExp(`\\b${fn}\\b`, 'gi'), '');
  }

  // Remove numbers (including decimals)
  cleaned = cleaned.replace(/\d+\.?\d*/g, '');

  // Remove operators and parentheses
  for (const op of VALID_OPERATORS) {
    cleaned = cleaned.replace(new RegExp(`\\${op === '^' ? '\\^' : op}`, 'g'), ' ');
  }

  // Remove whitespace and split
  const tokens = cleaned
    .split(/\s+/)
    .map(t => t.trim())
    .filter(t => t.length > 0);

  // Filter to valid variable names (alphanumeric + underscores)
  const variablePattern = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
  return tokens.filter(t => variablePattern.test(t));
}

/** Check for circular references in formula variables */
function checkCircularReferences(
  formula: string,
  variables: FormulaVariable[],
  visited: Set<string> = new Set()
): string[] {
  const errors: string[] = [];
  const varNames = extractVariableNames(formula);

  for (const varName of varNames) {
    if (visited.has(varName)) {
      errors.push(`Circular reference detected: variable "${varName}" is referenced in a loop`);
      continue;
    }

    // Check if the variable references another formula
    const variableDef = variables.find(v => v.name === varName);
    if (variableDef && variableDef.source === 'formula') {
      visited.add(varName);
      const subErrors = checkCircularReferences(variableDef.field, variables, visited);
      errors.push(...subErrors);
      visited.delete(varName);
    }
  }

  return errors;
}

/** Validate formula syntax */
export function validateFormula(
  formula: string,
  variables?: FormulaVariable[]
): FormulaValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check empty formula
  if (!formula || formula.trim().length === 0) {
    errors.push('Formula cannot be empty');
    return { valid: false, errors, warnings, extractedVariables: [] };
  }

  // Check for balanced parentheses
  let parenCount = 0;
  for (const char of formula) {
    if (char === '(') parenCount++;
    if (char === ')') parenCount--;
    if (parenCount < 0) {
      errors.push('Unbalanced parentheses: closing parenthesis without matching opening');
      break;
    }
  }
  if (parenCount > 0) {
    errors.push('Unbalanced parentheses: missing closing parenthesis');
  }

  // Check for invalid characters
  const invalidChars = formula.match(/[^a-zA-Z0-9_\s+\-*/().%^,]/g);
  if (invalidChars) {
    const uniqueInvalid = [...new Set(invalidChars)];
    errors.push(`Invalid characters in formula: ${uniqueInvalid.join(', ')}`);
  }

  // Check for division by zero patterns
  if (/\/\s*0(?![.0-9])/.test(formula)) {
    warnings.push('Potential division by zero detected');
  }

  // Check for consecutive operators (e.g., ++, **)
  if (/[+\-*/^]{2,}/.test(formula.replace(/\s/g, ''))) {
    errors.push('Consecutive operators detected — check formula syntax');
  }

  // Check for missing operands (e.g., formula starts or ends with operator)
  const trimmed = formula.trim();
  if (/^[+\-*/^]/.test(trimmed) && !trimmed.startsWith('-')) {
    errors.push('Formula cannot start with an operator (except negative sign)');
  }
  if (/[+\-*/^]$/.test(trimmed)) {
    errors.push('Formula cannot end with an operator');
  }

  // Extract variable names
  const extractedVariables = extractVariableNames(formula);

  // Check for missing variable definitions
  if (variables && variables.length > 0) {
    const definedVarNames = new Set(variables.map(v => v.name));
    for (const varName of extractedVariables) {
      if (!definedVarNames.has(varName)) {
        warnings.push(`Variable "${varName}" is used in formula but not defined in variables list`);
      }
    }

    // Check for defined but unused variables
    for (const v of variables) {
      if (!extractedVariables.includes(v.name)) {
        warnings.push(`Variable "${v.name}" is defined but not used in formula`);
      }
    }

    // Check for circular references
    const circularErrors = checkCircularReferences(formula, variables);
    errors.push(...circularErrors);
  }

  // Try to evaluate with dummy values to verify syntax
  try {
    const dummyVars: Record<string, number> = {};
    for (const varName of extractedVariables) {
      dummyVars[varName] = 1;
    }
    evaluateFormulaString(formula, dummyVars);
  } catch (err) {
    errors.push(`Formula evaluation test failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    extractedVariables,
  };
}

/** Safely evaluate a formula string with given variable values */
export function evaluateFormulaString(
  formula: string,
  variableValues: Record<string, number>
): number {
  let processed = formula;

  // Replace functions with Math equivalents
  processed = processed.replace(/\babs\b/gi, 'Math.abs');
  processed = processed.replace(/\bround\b/gi, 'Math.round');
  processed = processed.replace(/\bfloor\b/gi, 'Math.floor');
  processed = processed.replace(/\bceil\b/gi, 'Math.ceil');
  processed = processed.replace(/\bmin\b/gi, 'Math.min');
  processed = processed.replace(/\bmax\b/gi, 'Math.max');
  processed = processed.replace(/\bsqrt\b/gi, 'Math.sqrt');
  processed = processed.replace(/\blog\b/gi, 'Math.log');
  processed = processed.replace(/\bpow\b/gi, 'Math.pow');

  // Replace ^ with ** for exponentiation
  processed = processed.replace(/\^/g, '**');

  // Replace variable names with their values
  const varNames = extractVariableNames(formula);
  // Sort by length descending to avoid partial replacements (e.g., "total" before "tot")
  const sortedVarNames = [...varNames].sort((a, b) => b.length - a.length);

  for (const varName of sortedVarNames) {
    const value = variableValues[varName];
    if (value === undefined) {
      throw new Error(`Variable "${varName}" is not defined`);
    }
    // Use word boundary replacement
    const regex = new RegExp(`\\b${varName}\\b`, 'g');
    processed = processed.replace(regex, `(${value})`);
  }

  // Validate the processed string only contains safe characters
  if (/[a-zA-Z_]/.test(processed.replace(/Math\.(abs|round|floor|ceil|min|max|sqrt|log|pow)/g, ''))) {
    throw new Error('Formula contains undefined variables or invalid identifiers');
  }

  // Evaluate using Function constructor (safer than eval)
  try {
    const fn = new Function(`"use strict"; return (${processed});`);
    const result = fn() as number;

    if (typeof result !== 'number' || !isFinite(result)) {
      if (result === Infinity || result === -Infinity) {
        throw new Error('Division by zero in formula');
      }
      if (isNaN(result)) {
        throw new Error('Formula result is NaN');
      }
      throw new Error('Formula did not produce a valid number');
    }

    return result;
  } catch (err) {
    if (err instanceof Error) {
      throw new Error(`Formula execution error: ${err.message}`);
    }
    throw new Error('Formula execution failed');
  }
}

// ===== VARIABLE RESOLUTION =====

/**
 * Resolve a formula variable from the database.
 * Variables define: { name, source: "lead"|"ai"|"billing"|"workflow", field, filter?, aggregate? }
 */
export async function resolveVariable(
  variable: FormulaVariable,
  userId: string
): Promise<number> {
  const { source, field, filter, aggregate = 'count' } = variable;

  switch (source) {
    case 'lead':
      return resolveLeadVariable(userId, field, filter, aggregate);
    case 'ai':
      return resolveAiVariable(userId, field, filter, aggregate);
    case 'billing':
      return resolveBillingVariable(userId, field, filter, aggregate);
    case 'workflow':
      return resolveWorkflowVariable(userId, field, filter, aggregate);
    default:
      throw new Error(`Unknown variable source: ${source}`);
  }
}

/** Resolve lead source variables */
async function resolveLeadVariable(
  userId: string,
  field: string,
  filter?: string,
  aggregate: string = 'count'
): Promise<number> {
  const baseWhere: Record<string, unknown> = {
    userId,
    isActive: true,
  };

  // Apply filter
  if (filter) {
    if (filter.startsWith('stage:')) {
      baseWhere.stage = filter.replace('stage:', '');
    } else if (filter.startsWith('niche:')) {
      baseWhere.niche = filter.replace('niche:', '');
    } else if (filter.startsWith('country:')) {
      baseWhere.country = filter.replace('country:', '');
    } else if (filter.startsWith('hasWebsite:')) {
      baseWhere.hasWebsite = filter.replace('hasWebsite:', '') === 'true';
    } else if (filter === 'contacted') {
      baseWhere.stage = { notIn: ['discovered', 'analyzed'] };
    } else if (filter === 'replied') {
      baseWhere.stage = { in: ['replied', 'interested', 'negotiation', 'proposal_sent', 'closed_won'] };
    } else if (filter === 'won') {
      baseWhere.stage = 'closed_won';
    } else if (filter === 'lost') {
      baseWhere.stage = 'closed_lost';
    }
  }

  // Aggregate by field
  if (field === 'count' || aggregate === 'count') {
    return db.lead.count({ where: baseWhere });
  }

  if (field === 'conversionScore' || field === 'replyScore' || field === 'urgencyScore' || field === 'revenuePotentialScore') {
    if (aggregate === 'avg') {
      const leads = await db.lead.findMany({
        where: baseWhere,
        select: { [field]: true },
      });
      if (leads.length === 0) return 0;
      const sum = leads.reduce((s, l) => s + ((l as Record<string, unknown>)[field] as number), 0);
      return sum / leads.length;
    }
    if (aggregate === 'sum') {
      const leads = await db.lead.findMany({
        where: baseWhere,
        select: { [field]: true },
      });
      return leads.reduce((s, l) => s + ((l as Record<string, unknown>)[field] as number), 0);
    }
    if (aggregate === 'max') {
      const result = await db.lead.findFirst({
        where: baseWhere,
        select: { [field]: true },
        orderBy: { [field]: 'desc' },
      });
      const row = result as unknown as Record<string, number | null> | null;
      return row?.[field] ?? 0;
    }
    if (aggregate === 'min') {
      const result = await db.lead.findFirst({
        where: baseWhere,
        select: { [field]: true },
        orderBy: { [field]: 'asc' },
      });
      const row = result as unknown as Record<string, number | null> | null;
      return row?.[field] ?? 0;
    }
  }

  // Default: count
  return db.lead.count({ where: baseWhere });
}

/** Resolve AI source variables */
async function resolveAiVariable(
  userId: string,
  field: string,
  _filter?: string,
  aggregate: string = 'count'
): Promise<number> {
  // AI variables: credits usage, chat sessions, etc.
  if (field === 'creditsUsed') {
    const result = await db.creditsLedger.aggregate({
      where: {
        userId,
        credits: { lt: 0 },
      },
      _sum: { credits: true },
    });
    return Math.abs(result._sum.credits ?? 0);
  }

  if (field === 'chatSessions') {
    return db.aiChatSession.count({ where: { userId } });
  }

  if (field === 'chatMessages') {
    return db.aiChatMessage.count({
      where: {
        session: { userId },
      },
    });
  }

  if (field === 'aiAnalyses') {
    return db.leadAnalysis.count({
      where: {
        lead: { userId },
      },
    });
  }

  if (field === 'competitorAnalyses') {
    return db.competitorAnalysis.count({ where: { userId } });
  }

  if (field === 'avgWebsiteQuality') {
    if (aggregate === 'avg') {
      const analyses = await db.leadAnalysis.findMany({
        where: { lead: { userId } },
        select: { websiteQualityScore: true },
      });
      if (analyses.length === 0) return 0;
      return analyses.reduce((s, a) => s + a.websiteQualityScore, 0) / analyses.length;
    }
    return db.leadAnalysis.count({
      where: { lead: { userId } },
    });
  }

  if (field === 'avgDigitalMaturity') {
    const analyses = await db.leadAnalysis.findMany({
      where: { lead: { userId } },
      select: { digitalMaturityScore: true },
    });
    if (analyses.length === 0) return 0;
    return analyses.reduce((s, a) => s + a.digitalMaturityScore, 0) / analyses.length;
  }

  // Default
  return 0;
}

/** Resolve billing source variables */
async function resolveBillingVariable(
  userId: string,
  field: string,
  _filter?: string,
  aggregate: string = 'count'
): Promise<number> {
  if (field === 'totalPayments') {
    const result = await db.paymentOrder.aggregate({
      where: { userId, status: 'completed' },
      _sum: { amount: true },
    });
    return result._sum.amount ?? 0;
  }

  if (field === 'paymentCount') {
    return db.paymentOrder.count({ where: { userId, status: 'completed' } });
  }

  if (field === 'mrr') {
    // Calculate Monthly Recurring Revenue
    const activeSubscriptions = await db.subscription.findMany({
      where: { userId, status: 'active', billingCycle: 'monthly' },
      select: { id: true },
    });
    const yearlySubscriptions = await db.subscription.findMany({
      where: { userId, status: 'active', billingCycle: 'yearly' },
      select: { id: true },
    });

    // Use plan pricing for MRR calculation
    const planPricing: Record<string, { monthly: number; yearly: number }> = {
      free: { monthly: 0, yearly: 0 },
      pro: { monthly: 49, yearly: 470 },
      elite: { monthly: 149, yearly: 1430 },
    };

    // Get user plan for pricing
    const user = await db.user.findUnique({ where: { id: userId }, select: { plan: true } });
    const plan = user?.plan ?? 'free';
    const monthlyRevenue = activeSubscriptions.length * (planPricing[plan]?.monthly ?? 0);
    const yearlyRevenueAnnual = yearlySubscriptions.length * (planPricing[plan]?.yearly ?? 0);
    const yearlyRevenueMonthly = yearlyRevenueAnnual / 12;

    return Math.round((monthlyRevenue + yearlyRevenueMonthly) * 100) / 100;
  }

  if (field === 'creditsBalance') {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { credits: true },
    });
    return user?.credits ?? 0;
  }

  if (field === 'creditsUsed') {
    const result = await db.creditsLedger.aggregate({
      where: { userId, credits: { lt: 0 } },
      _sum: { credits: true },
    });
    return Math.abs(result._sum.credits ?? 0);
  }

  if (field === 'creditsAdded') {
    const result = await db.creditsLedger.aggregate({
      where: { userId, credits: { gt: 0 } },
      _sum: { credits: true },
    });
    return result._sum.credits ?? 0;
  }

  if (field === 'addonCount') {
    return db.creditAddon.count({ where: { userId } });
  }

  if (field === 'invoiceCount') {
    return db.invoice.count({ where: { userId } });
  }

  if (field === 'avgDealValue') {
    const deals = await db.deal.findMany({
      where: { lead: { userId }, status: 'closed_won' },
      select: { finalPrice: true },
    });
    const wonDeals = deals.filter(d => d.finalPrice !== null);
    if (wonDeals.length === 0) return 0;
    return wonDeals.reduce((s, d) => s + (d.finalPrice ?? 0), 0) / wonDeals.length;
  }

  if (field === 'totalDealValue') {
    if (aggregate === 'sum') {
      const deals = await db.deal.findMany({
        where: { lead: { userId }, status: 'closed_won' },
        select: { finalPrice: true },
      });
      return deals.reduce((s, d) => s + (d.finalPrice ?? 0), 0);
    }
    const result = await db.deal.aggregate({
      where: { lead: { userId }, status: 'closed_won' },
      _sum: { finalPrice: true },
    });
    return result._sum.finalPrice ?? 0;
  }

  // Default
  return 0;
}

/** Resolve workflow source variables */
async function resolveWorkflowVariable(
  userId: string,
  field: string,
  _filter?: string,
  aggregate: string = 'count'
): Promise<number> {
  if (field === 'workflowCount') {
    return db.workflowDefinition.count({ where: { userId } });
  }

  if (field === 'activeWorkflows') {
    return db.workflowDefinition.count({ where: { userId, status: 'active' } });
  }

  if (field === 'totalExecutions') {
    const result = await db.workflowDefinition.aggregate({
      where: { userId },
      _sum: { runCount: true },
    });
    return result._sum.runCount ?? 0;
  }

  if (field === 'successExecutions') {
    const result = await db.workflowDefinition.aggregate({
      where: { userId },
      _sum: { successCount: true },
    });
    return result._sum.successCount ?? 0;
  }

  if (field === 'failedExecutions') {
    const result = await db.workflowDefinition.aggregate({
      where: { userId },
      _sum: { failureCount: true },
    });
    return result._sum.failureCount ?? 0;
  }

  if (field === 'successRate') {
    const totals = await db.workflowDefinition.aggregate({
      where: { userId },
      _sum: { runCount: true, successCount: true },
    });
    const total = totals._sum.runCount ?? 0;
    const successes = totals._sum.successCount ?? 0;
    return total > 0 ? (successes / total) * 100 : 0;
  }

  if (field === 'avgRuntime') {
    const result = await db.workflowDefinition.aggregate({
      where: { userId, runCount: { gt: 0 } },
      _avg: { avgRuntimeMs: true },
    });
    return result._avg.avgRuntimeMs ?? 0;
  }

  if (field === 'executionCount') {
    return db.workflowExecution.count({ where: { userId } });
  }

  if (field === 'completedExecutions') {
    return db.workflowExecution.count({ where: { userId, status: 'completed' } });
  }

  if (field === 'failedExecutionCount') {
    return db.workflowExecution.count({ where: { userId, status: 'failed' } });
  }

  // Default
  return 0;
}

// ===== FORMULA CRUD =====

/**
 * Create a custom formula. Validates, parses, extracts variables, and stores.
 */
export async function createFormula(
  userId: string,
  data: FormulaCreateInput
): Promise<{
  success: boolean;
  formula?: {
    id: string;
    name: string;
    formula: string;
    resultType: string;
    category: string;
    variables: string;
    createdAt: Date;
  };
  errors?: string[];
}> {
  // Validate formula
  const variables = data.variables ?? [];
  const validation = validateFormula(data.formula, variables);

  if (!validation.valid) {
    return { success: false, errors: validation.errors };
  }

  // Extract variable references if not provided
  const finalVariables = variables.length > 0
    ? variables
    : validation.extractedVariables.map(name => ({
        name,
        source: 'lead' as const,
        field: 'count',
        aggregate: 'count' as const,
      }));

  // Create formula
  const formula = await db.analyticsFormula.create({
    data: {
      userId,
      name: data.name,
      description: data.description ?? null,
      formula: data.formula,
      variables: JSON.stringify(finalVariables),
      resultType: data.resultType ?? 'percentage',
      category: data.category ?? 'custom',
      isPublic: data.isPublic ?? false,
    },
  });

  return {
    success: true,
    formula: {
      id: formula.id,
      name: formula.name ?? data.name,
      formula: formula.formula ?? data.formula,
      resultType: formula.resultType ?? data.resultType ?? 'percentage',
      category: formula.category ?? data.category ?? 'custom',
      variables: formula.variables ?? JSON.stringify(finalVariables),
      createdAt: formula.createdAt,
    },
  };
}

/**
 * Update a formula if owned by user.
 */
export async function updateFormula(
  formulaId: string,
  userId: string,
  data: FormulaUpdateInput
): Promise<{
  success: boolean;
  formula?: {
    id: string;
    name: string;
    formula: string;
    resultType: string;
    category: string;
    variables: string;
    updatedAt: Date;
  };
  errors?: string[];
}> {
  // Check ownership
  const existing = await db.analyticsFormula.findUnique({
    where: { id: formulaId },
  });

  if (!existing) {
    return { success: false, errors: ['Formula not found'] };
  }

  if (existing.userId !== userId) {
    return { success: false, errors: ['You do not own this formula'] };
  }

  // Validate new formula if provided
  if (data.formula) {
    const variables = data.variables ?? JSON.parse(existing.variables || '[]') as FormulaVariable[];
    const validation = validateFormula(data.formula, variables);
    if (!validation.valid) {
      return { success: false, errors: validation.errors };
    }
  }

  // Build update data
  const updateData: Record<string, unknown> = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.formula !== undefined) updateData.formula = data.formula;
  if (data.variables !== undefined) updateData.variables = JSON.stringify(data.variables);
  if (data.resultType !== undefined) updateData.resultType = data.resultType;
  if (data.category !== undefined) updateData.category = data.category;
  if (data.isPublic !== undefined) updateData.isPublic = data.isPublic;

  // Reset computed result when formula changes
  if (data.formula || data.variables) {
    updateData.lastResult = null;
    updateData.lastComputedAt = null;
  }

  const formula = await db.analyticsFormula.update({
    where: { id: formulaId },
    data: updateData,
  });

  return {
    success: true,
    formula: {
      id: formula.id,
      name: formula.name ?? 'Untitled Formula',
      formula: formula.formula ?? '',
      resultType: formula.resultType ?? 'number',
      category: formula.category ?? 'custom',
      variables: formula.variables ?? '[]',
      updatedAt: formula.lastComputedAt ?? formula.createdAt,
    },
  };
}

/**
 * Delete a formula.
 */
export async function deleteFormula(
  formulaId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  const existing = await db.analyticsFormula.findUnique({
    where: { id: formulaId },
  });

  if (!existing) {
    return { success: false, error: 'Formula not found' };
  }

  if (existing.userId !== userId) {
    return { success: false, error: 'You do not own this formula' };
  }

  await db.analyticsFormula.delete({
    where: { id: formulaId },
  });

  return { success: true };
}

/**
 * Execute a stored formula: resolve variables from DB, compute result, store lastResult.
 */
export async function executeFormula(
  formulaId: string,
  userId: string
): Promise<FormulaExecutionResult> {
  const formula = await db.analyticsFormula.findUnique({
    where: { id: formulaId },
  });

  if (!formula) {
    throw new Error('Formula not found');
  }

  if (formula.userId !== userId && !formula.isPublic) {
    throw new Error('You do not have access to this formula');
  }

  // Parse variables
  const variables: FormulaVariable[] = JSON.parse(formula.variables || '[]');

  // Resolve each variable
  const variableValues: Record<string, number> = {};
  for (const variable of variables) {
    try {
      variableValues[variable.name] = await resolveVariable(variable, formula.userId ?? userId);
    } catch (err) {
      console.error(`Failed to resolve variable "${variable.name}":`, err);
      variableValues[variable.name] = 0;
    }
  }

  // Execute formula
  let result: number;
  try {
    result = evaluateFormulaString(formula.formula ?? '', variableValues);

    // Apply result type formatting
    if (formula.resultType === 'percentage') {
      result = Math.round(result * 100) / 100;
    } else if (formula.resultType === 'ratio') {
      result = Math.round(result * 1000) / 1000;
    } else {
      result = Math.round(result * 100) / 100;
    }
  } catch (err) {
    throw new Error(`Formula execution failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }

  // Store result
  await db.analyticsFormula.update({
    where: { id: formulaId },
    data: {
      lastResult: result,
      lastComputedAt: new Date(),
    },
  });

  return {
    formulaId,
    result,
    resultType: formula.resultType ?? 'number',
    variables: variableValues,
    computedAt: new Date(),
  };
}

/**
 * Execute a formula string with given variable values.
 */
export async function executeFormulaString(
  formula: string,
  variables: Record<string, number>,
  _userId: string
): Promise<{ result: number; variables: Record<string, number> }> {
  const result = evaluateFormulaString(formula, variables);

  return {
    result: Math.round(result * 100) / 100,
    variables,
  };
}

/**
 * Get all formulas for a user.
 */
export async function getUserFormulas(userId: string): Promise<Array<{
  id: string;
  name: string;
  description: string | null;
  formula: string;
  variables: string;
  resultType: string;
  category: string;
  lastResult: number | null;
  lastComputedAt: Date | null;
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
}>> {
  const formulas = await db.analyticsFormula.findMany({
    where: {
      OR: [
        { userId },
        { isPublic: true },
      ],
    },
    orderBy: { createdAt: 'desc' },
  });

  return formulas.map(f => ({
    id: f.id,
    name: f.name ?? 'Untitled Formula',
    description: f.description,
    formula: f.formula ?? '',
    variables: f.variables ?? '[]',
    resultType: f.resultType ?? 'number',
    category: f.category ?? 'custom',
    lastResult: f.lastResult,
    lastComputedAt: f.lastComputedAt,
    isPublic: f.isPublic,
    createdAt: f.createdAt,
    updatedAt: f.lastComputedAt ?? f.createdAt,
  }));
}

/**
 * Get a single formula.
 */
export async function getFormula(
  formulaId: string,
  userId: string
): Promise<{
  id: string;
  name: string;
  description: string | null;
  formula: string;
  variables: string;
  resultType: string;
  category: string;
  lastResult: number | null;
  lastComputedAt: Date | null;
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
} | null> {
  const formula = await db.analyticsFormula.findUnique({
    where: { id: formulaId },
  });

  if (!formula) return null;

  // Check access
  if (formula.userId !== userId && !formula.isPublic) {
    return null;
  }

  return {
    id: formula.id,
    name: formula.name ?? 'Untitled Formula',
    description: formula.description,
    formula: formula.formula ?? '',
    variables: formula.variables ?? '[]',
    resultType: formula.resultType ?? 'number',
    category: formula.category ?? 'custom',
    lastResult: formula.lastResult,
    lastComputedAt: formula.lastComputedAt,
    isPublic: formula.isPublic,
    createdAt: formula.createdAt,
    updatedAt: formula.lastComputedAt ?? formula.createdAt,
  };
}

/**
 * Execute all user formulas and update lastResult.
 */
export async function executeAllFormulas(
  userId: string
): Promise<Array<FormulaExecutionResult & { name: string; error?: string }>> {
  const formulas = await db.analyticsFormula.findMany({
    where: { userId },
  });

  const results: Array<FormulaExecutionResult & { name: string; error?: string }> = [];

  for (const formula of formulas) {
    try {
      const result = await executeFormula(formula.id, userId);
      results.push({
        ...result,
        name: formula.name ?? 'Untitled Formula',
      });
    } catch (err) {
      results.push({
        formulaId: formula.id,
        name: formula.name ?? 'Untitled Formula',
        result: 0,
        resultType: formula.resultType ?? 'number',
        variables: {},
        computedAt: new Date(),
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  return results;
}
