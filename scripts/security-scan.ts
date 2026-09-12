// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Security Scan Script
// Phase 14.3: Security Hardening
//
// Dependency vulnerability scanner, environment security checks,
// and security report generation.
// Run with: bun run scripts/security-scan.ts
// ═══════════════════════════════════════════════════════════════════

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

// ===== TYPES =====

interface SecurityFinding {
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  category: string;
  title: string;
  description: string;
  recommendation: string;
}

interface SecurityScanReport {
  timestamp: string;
  environment: string;
  findings: SecurityFinding[];
  summary: {
    total: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  };
  dependencyAudit: {
    scanned: boolean;
    vulnerabilities: number;
    output: string;
  };
  passed: boolean;
}

// ===== SCAN FUNCTIONS =====

function scanEnvironmentVariables(): SecurityFinding[] {
  const findings: SecurityFinding[] = [];

  // Check for required security environment variables
  const requiredVars = [
    { name: 'JWT_SECRET', description: 'JWT signing secret', severity: 'critical' as const },
    { name: 'DATABASE_URL', description: 'Database connection string', severity: 'high' as const },
  ];

  const recommendedVars = [
    { name: 'ALLOWED_ORIGINS', description: 'CORS allowed origins', severity: 'medium' as const },
    { name: 'NEXT_PUBLIC_SENTRY_DSN', description: 'Sentry DSN for error tracking', severity: 'low' as const },
    { name: 'STRIPE_WEBHOOK_SECRET', description: 'Stripe webhook signature secret', severity: 'medium' as const },
    { name: 'RAZORPAY_WEBHOOK_SECRET', description: 'Razorpay webhook signature secret', severity: 'medium' as const },
  ];

  for (const varDef of requiredVars) {
    if (!process.env[varDef.name]) {
      findings.push({
        severity: varDef.severity,
        category: 'environment',
        title: `Missing required environment variable: ${varDef.name}`,
        description: `${varDef.description} is not set. This is required for security.`,
        recommendation: `Set the ${varDef.name} environment variable before deploying to production.`,
      });
    }
  }

  for (const varDef of recommendedVars) {
    if (!process.env[varDef.name]) {
      findings.push({
        severity: varDef.severity,
        category: 'environment',
        title: `Missing recommended environment variable: ${varDef.name}`,
        description: `${varDef.description} is not set. This is recommended for security.`,
        recommendation: `Consider setting the ${varDef.name} environment variable.`,
      });
    }
  }

  // Check for default/weak JWT secret
  const jwtSecret = process.env.JWT_SECRET;
  if (jwtSecret) {
    const weakSecrets = [
      'acquisitionos-dev-secret-change-in-production',
      'secret',
      'password',
      'changeme',
      'jwt-secret',
      'test',
    ];
    if (weakSecrets.includes(jwtSecret) || jwtSecret.length < 32) {
      findings.push({
        severity: 'critical',
        category: 'environment',
        title: 'Weak JWT secret detected',
        description: 'The JWT_SECRET is using a default or weak value that could be easily guessed.',
        recommendation: 'Generate a strong, random JWT_SECRET with at least 32 characters. Use: openssl rand -hex 32',
      });
    }
  }

  return findings;
}

function scanDependencyVulnerabilities(): { scanned: boolean; vulnerabilities: number; output: string } {
  try {
    // Try bun audit
    const output = execSync('bun audit 2>&1 || true', {
      encoding: 'utf-8',
      timeout: 30000,
      cwd: process.cwd(),
    });

    const hasVulnerabilities = output.toLowerCase().includes('vulnerabilit') &&
      !output.toLowerCase().includes('0 vulnerabilities');

    return {
      scanned: true,
      vulnerabilities: hasVulnerabilities ? -1 : 0, // -1 means unknown count
      output: output.trim(),
    };
  } catch (error) {
    return {
      scanned: false,
      vulnerabilities: -1,
      output: `Dependency scan failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

function scanFileSecurity(): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  const projectRoot = process.cwd();

  // Check for sensitive files that shouldn't exist
  const sensitiveFiles = [
    '.env.production',
    '.env.local',
    'id_rsa',
    'id_ed25519',
    '.npmrc',
    '.pypirc',
  ];

  for (const file of sensitiveFiles) {
    const filePath = path.join(projectRoot, file);
    if (fs.existsSync(filePath)) {
      const stat = fs.statSync(filePath);
      if (stat.isFile()) {
        findings.push({
          severity: 'medium',
          category: 'file-security',
          title: `Sensitive file found: ${file}`,
          description: `The file "${file}" exists in the project root. It may contain credentials.`,
          recommendation: `Ensure "${file}" is in .gitignore and not committed to version control.`,
        });
      }
    }
  }

  // Check .gitignore includes sensitive patterns
  const gitignorePath = path.join(projectRoot, '.gitignore');
  if (fs.existsSync(gitignorePath)) {
    const gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8');
    const requiredPatterns = ['.env', '.env.local', '.env.production', 'node_modules'];

    for (const pattern of requiredPatterns) {
      if (!gitignoreContent.includes(pattern)) {
        findings.push({
          severity: 'high',
          category: 'file-security',
          title: `.gitignore missing pattern: ${pattern}`,
          description: `The .gitignore file does not include "${pattern}".`,
          recommendation: `Add "${pattern}" to .gitignore to prevent accidental commits.`,
        });
      }
    }
  } else {
    findings.push({
      severity: 'high',
      category: 'file-security',
      title: 'No .gitignore file found',
      description: 'The project does not have a .gitignore file, which could lead to committing sensitive data.',
      recommendation: 'Create a .gitignore file with standard patterns for Node.js projects.',
    });
  }

  return findings;
}

function scanCodePatterns(): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  const projectRoot = process.cwd();
  const srcDir = path.join(projectRoot, 'src');

  if (!fs.existsSync(srcDir)) {
    findings.push({
      severity: 'info',
      category: 'code-security',
      title: 'No src directory found',
      description: 'Cannot scan code patterns without a src directory.',
      recommendation: 'Ensure the project structure is correct.',
    });
    return findings;
  }

  // Check for hardcoded secrets patterns in source files
  const secretPatterns = [
    { pattern: /password\s*[:=]\s*['"][^'"]{8,}['"]/gi, name: 'Hardcoded password', severity: 'critical' as const },
    { pattern: /api[_-]?key\s*[:=]\s*['"][^'"]{10,}['"]/gi, name: 'Hardcoded API key', severity: 'critical' as const },
    { pattern: /secret\s*[:=]\s*['"][^'"]{10,}['"]/gi, name: 'Hardcoded secret', severity: 'high' as const },
  ];

  function scanDir(dir: string): void {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;

      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        scanDir(fullPath);
      } else if (entry.isFile() && /\.(ts|tsx|js|jsx)$/.test(entry.name)) {
        try {
          const content = fs.readFileSync(fullPath, 'utf-8');

          // Skip test files and security modules
          if (content.includes('test') || content.includes('spec') ||
              fullPath.includes('security/') || fullPath.includes('observability/')) {
            continue;
          }

          for (const { pattern, name, severity } of secretPatterns) {
            // Reset regex lastIndex
            pattern.lastIndex = 0;
            if (pattern.test(content)) {
              findings.push({
                severity,
                category: 'code-security',
                title: `${name} detected in ${path.relative(projectRoot, fullPath)}`,
                description: `A potential ${name.toLowerCase()} was found in the source code.`,
                recommendation: `Move the secret to an environment variable and remove from source code.`,
              });
            }
          }
        } catch {
          // Skip files that can't be read
        }
      }
    }
  }

  scanDir(srcDir);
  return findings;
}

// ===== MAIN SCAN =====

function runSecurityScan(): SecurityScanReport {
  console.log('🔍 AcquisitionOS Security Scan');
  console.log('═'.repeat(50));
  console.log();

  const findings: SecurityFinding[] = [];

  // 1. Environment variables
  console.log('📋 Scanning environment variables...');
  findings.push(...scanEnvironmentVariables());

  // 2. Dependency vulnerabilities
  console.log('📦 Scanning dependencies...');
  const depAudit = scanDependencyVulnerabilities();

  // 3. File security
  console.log('📁 Scanning file security...');
  findings.push(...scanFileSecurity());

  // 4. Code patterns
  console.log('💻 Scanning code patterns...');
  findings.push(...scanCodePatterns());

  // Build summary
  const summary = {
    total: findings.length,
    critical: findings.filter(f => f.severity === 'critical').length,
    high: findings.filter(f => f.severity === 'high').length,
    medium: findings.filter(f => f.severity === 'medium').length,
    low: findings.filter(f => f.severity === 'low').length,
    info: findings.filter(f => f.severity === 'info').length,
  };

  const report: SecurityScanReport = {
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    findings,
    summary,
    dependencyAudit: depAudit,
    passed: summary.critical === 0 && summary.high === 0,
  };

  // Print findings
  console.log();
  console.log('═'.repeat(50));
  console.log('📊 Security Scan Results');
  console.log('═'.repeat(50));
  console.log();

  if (findings.length === 0) {
    console.log('✅ No security findings detected.');
  } else {
    const severityIcons: Record<string, string> = {
      critical: '🔴',
      high: '🟠',
      medium: '🟡',
      low: '🔵',
      info: '⚪',
    };

    for (const finding of findings) {
      const icon = severityIcons[finding.severity] || '⚪';
      console.log(`${icon} [${finding.severity.toUpperCase()}] ${finding.title}`);
      console.log(`   Category: ${finding.category}`);
      console.log(`   ${finding.description}`);
      console.log(`   → ${finding.recommendation}`);
      console.log();
    }
  }

  console.log('─'.repeat(50));
  console.log(`Total: ${summary.total} findings`);
  console.log(`  🔴 Critical: ${summary.critical}`);
  console.log(`  🟠 High: ${summary.high}`);
  console.log(`  🟡 Medium: ${summary.medium}`);
  console.log(`  🔵 Low: ${summary.low}`);
  console.log(`  ⚪ Info: ${summary.info}`);
  console.log();

  if (depAudit.scanned) {
    console.log('📦 Dependency Audit:');
    console.log(depAudit.output.substring(0, 500));
    console.log();
  }

  if (report.passed) {
    console.log('✅ Security scan PASSED — No critical or high severity issues found.');
  } else {
    console.log('❌ Security scan FAILED — Critical or high severity issues detected.');
  }

  // Write report to file
  const reportPath = path.join(process.cwd(), 'security-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n📄 Full report saved to: ${reportPath}`);

  return report;
}

// Run the scan
runSecurityScan();
