// ═══════════════════════════════════════════════════════════════════
// Web Property API E2E Test
//
// Tests the WebProperty CRUD APIs with real route handlers and real
// (isolated) database. Covers:
//   - Create web property (happy path)
//   - Duplicate URL prevention
//   - List web properties
//   - Get single web property
//   - Update web property
//   - Delete web property
//   - Cross-tenant access blocked (Tenant A cannot see/manage B's properties)
//   - Invalid BusinessProfile ID
//   - Invalid URL (SSRF guard)
//
// Uses isolated per-file database (test-schema.db copy) — never touches
// production db/custom.db.
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.hoisted(() => {
  const { copyFileSync, existsSync, mkdirSync } = require('fs');
  const { join } = require('path');
  const isolatedDir = join(process.cwd(), '.test-db-isolated');
  if (!existsSync(isolatedDir)) mkdirSync(isolatedDir, { recursive: true });
  const dbPath = join(isolatedDir, 'web-property.db');
  const schemaSource = join(process.cwd(), 'test-schema.db');
  if (existsSync(schemaSource)) copyFileSync(schemaSource, dbPath);
  process.env.DATABASE_URL = `file:${dbPath}`;
  process.env.NODE_ENV = 'development';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'acquisitionos-dev-secret-change-in-production';
});

import { db } from '@/lib/db';
import { generateAccessToken, hashPassword } from '@/lib/auth';
import { createWebProperty, listWebProperties, getWebProperty, updateWebProperty, deleteWebProperty, validateWebUrl } from '@/lib/web-property-service';

const RUN_ID = `wp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const testUsers: string[] = [];

async function makeTestUser(marker: string): Promise<{ userId: string; token: string }> {
  const email = `${RUN_ID}-${marker}@test.local`;
  const hashedPassword = await hashPassword(`Pwd-${marker}-99!`);
  const user = await db.user.create({
    data: {
      name: `Test ${marker}`, email, passwordHash: hashedPassword,
      role: 'owner', plan: 'pro', credits: 500, creditsMonthly: 750,
      authProvider: 'email', emailVerified: true, isTrial: false, trialEndsAt: null,
      settings: { create: {} },
      subscriptions: { create: { plan: 'pro', status: 'active', isTrial: false, billingCycle: 'monthly', creditsTotal: 750, creditsUsed: 0, creditsRemaining: 750, currentPeriodStart: new Date(), currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) } },
    },
  });
  const token = generateAccessToken({ id: user.id, email: user.email, role: user.role, plan: user.plan, orgId: user.orgId, isTrial: user.isTrial, trialEndsAt: user.trialEndsAt });
  testUsers.push(user.id);
  return { userId: user.id, token };
}

async function createBusinessProfile(userId: string, name: string): Promise<string> {
  const profile = await db.businessProfile.create({
    data: { userId, name, status: 'active', isDefault: true },
  });
  return profile.id;
}

async function cleanupTestUser(uid: string) {
  await db.webProperty.deleteMany({ where: { userId: uid } }).catch(() => {});
  await db.researchSnapshot.deleteMany({ where: { userId: uid } }).catch(() => {});
  await db.businessProfile.deleteMany({ where: { userId: uid } }).catch(() => {});
  await db.auditLog.deleteMany({ where: { userId: uid } }).catch(() => {});
  await db.userSettings.deleteMany({ where: { userId: uid } }).catch(() => {});
  await db.subscription.deleteMany({ where: { userId: uid } }).catch(() => {});
  await db.user.deleteMany({ where: { id: uid } }).catch(() => {});
}

describe('[Web Property E2E] CRUD + tenant isolation', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  afterEach(async () => { for (const uid of testUsers) await cleanupTestUser(uid); testUsers.length = 0; });
  afterAll(async () => { for (const uid of testUsers) await cleanupTestUser(uid); testUsers.length = 0; });

  it('CREATE — happy path: creates web property for owned BusinessProfile', async () => {
    const u = await makeTestUser('create');
    const profileId = await createBusinessProfile(u.userId, 'Test Business');
    const result = await createWebProperty(u.userId, profileId, {
      url: 'https://example.com',
      label: 'Primary Website',
      propertyType: 'website',
    });
    expect(result.success).toBe(true);
    expect(result.webProperty.url).toBe('https://example.com/');
    expect(result.webProperty.label).toBe('Primary Website');
    expect(result.webProperty.propertyType).toBe('website');
    expect(result.webProperty.status).toBe('active');
    expect(result.webProperty.userId).toBe(u.userId);
    expect(result.webProperty.businessProfileId).toBe(profileId);
  });

  it('CREATE — duplicate URL for same profile is rejected', async () => {
    const u = await makeTestUser('dup');
    const profileId = await createBusinessProfile(u.userId, 'Test Business');
    await createWebProperty(u.userId, profileId, { url: 'https://example.com' });
    const result = await createWebProperty(u.userId, profileId, { url: 'https://example.com' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('already');
  });

  it('CREATE — same URL for DIFFERENT profiles is allowed', async () => {
    const u = await makeTestUser('multi');
    const profile1 = await createBusinessProfile(u.userId, 'Business 1');
    const profile2 = await createBusinessProfile(u.userId, 'Business 2');
    const r1 = await createWebProperty(u.userId, profile1, { url: 'https://example.com' });
    const r2 = await createWebProperty(u.userId, profile2, { url: 'https://example.com' });
    expect(r1.success).toBe(true);
    expect(r2.success).toBe(true);
  });

  it('CREATE — invalid URL (SSRF) is rejected', async () => {
    const u = await makeTestUser('ssrf');
    const profileId = await createBusinessProfile(u.userId, 'Test Business');
    const result = await createWebProperty(u.userId, profileId, { url: 'http://localhost:3000' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid URL');
  });

  it('CREATE — nonexistent BusinessProfile returns error', async () => {
    const u = await makeTestUser('nofind');
    const result = await createWebProperty(u.userId, 'cm_fake_nonexistent', { url: 'https://example.com' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('LIST — returns web properties for owned profile', async () => {
    const u = await makeTestUser('list');
    const profileId = await createBusinessProfile(u.userId, 'Test Business');
    await createWebProperty(u.userId, profileId, { url: 'https://example.com', label: 'Site 1' });
    await createWebProperty(u.userId, profileId, { url: 'https://blog.example.com', label: 'Site 2' });
    const properties = await listWebProperties(u.userId, profileId);
    expect(properties.length).toBe(2);
    expect(properties[0].url).toContain('example.com');
  });

  it('GET — returns single web property with snapshots', async () => {
    const u = await makeTestUser('get');
    const profileId = await createBusinessProfile(u.userId, 'Test Business');
    const createResult = await createWebProperty(u.userId, profileId, { url: 'https://example.com' });
    const wp = await getWebProperty(u.userId, createResult.webProperty.id);
    expect(wp).toBeTruthy();
    expect(wp.url).toBe('https://example.com/');
    expect(wp.researchSnapshots).toEqual([]);
  });

  it('UPDATE — updates label and propertyType', async () => {
    const u = await makeTestUser('upd');
    const profileId = await createBusinessProfile(u.userId, 'Test Business');
    const createResult = await createWebProperty(u.userId, profileId, { url: 'https://example.com', label: 'Old' });
    const updateResult = await updateWebProperty(u.userId, createResult.webProperty.id, { label: 'New Label', propertyType: 'portfolio' });
    expect(updateResult.success).toBe(true);
    expect(updateResult.webProperty.label).toBe('New Label');
    expect(updateResult.webProperty.propertyType).toBe('portfolio');
  });

  it('UPDATE — archive (status change)', async () => {
    const u = await makeTestUser('arch');
    const profileId = await createBusinessProfile(u.userId, 'Test Business');
    const createResult = await createWebProperty(u.userId, profileId, { url: 'https://example.com' });
    const updateResult = await updateWebProperty(u.userId, createResult.webProperty.id, { status: 'archived' });
    expect(updateResult.success).toBe(true);
    expect(updateResult.webProperty.status).toBe('archived');
    // Active-only list should not include it
    const active = await listWebProperties(u.userId, profileId);
    expect(active.length).toBe(0);
  });

  it('DELETE — removes web property', async () => {
    const u = await makeTestUser('del');
    const profileId = await createBusinessProfile(u.userId, 'Test Business');
    const createResult = await createWebProperty(u.userId, profileId, { url: 'https://example.com' });
    const deleteResult = await deleteWebProperty(u.userId, createResult.webProperty.id);
    expect(deleteResult.success).toBe(true);
    const wp = await getWebProperty(u.userId, createResult.webProperty.id);
    expect(wp).toBeNull();
  });

  // ═════════════════════════════════════════════════════════════════
  // TENANT ISOLATION
  // ═════════════════════════════════════════════════════════════════
  it('TENANT ISOLATION — Tenant A cannot create property for Tenant B profile', async () => {
    const a = await makeTestUser('iso-a');
    const b = await makeTestUser('iso-b');
    const bProfileId = await createBusinessProfile(b.userId, 'B Business');
    // Tenant A tries to add a property to Tenant B's profile
    const result = await createWebProperty(a.userId, bProfileId, { url: 'https://example.com' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('TENANT ISOLATION — Tenant A cannot get Tenant B web property', async () => {
    const a = await makeTestUser('iso-get-a');
    const b = await makeTestUser('iso-get-b');
    const bProfileId = await createBusinessProfile(b.userId, 'B Business');
    const bCreateResult = await createWebProperty(b.userId, bProfileId, { url: 'https://example.com' });
    // Tenant A tries to read Tenant B's web property
    const wp = await getWebProperty(a.userId, bCreateResult.webProperty.id);
    expect(wp).toBeNull();
  });

  it('TENANT ISOLATION — Tenant A cannot update Tenant B web property', async () => {
    const a = await makeTestUser('iso-upd-a');
    const b = await makeTestUser('iso-upd-b');
    const bProfileId = await createBusinessProfile(b.userId, 'B Business');
    const bCreateResult = await createWebProperty(b.userId, bProfileId, { url: 'https://example.com' });
    const result = await updateWebProperty(a.userId, bCreateResult.webProperty.id, { label: 'Hacked' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('TENANT ISOLATION — Tenant A cannot delete Tenant B web property', async () => {
    const a = await makeTestUser('iso-del-a');
    const b = await makeTestUser('iso-del-b');
    const bProfileId = await createBusinessProfile(b.userId, 'B Business');
    const bCreateResult = await createWebProperty(b.userId, bProfileId, { url: 'https://example.com' });
    const result = await deleteWebProperty(a.userId, bCreateResult.webProperty.id);
    expect(result.success).toBe(false);
    // Verify B's property still exists
    const wp = await getWebProperty(b.userId, bCreateResult.webProperty.id);
    expect(wp).toBeTruthy();
  });

  // ═════════════════════════════════════════════════════════════════
  // URL VALIDATION
  // ═════════════════════════════════════════════════════════════════
  it('URL VALIDATION — rejects SSRF targets', () => {
    expect(validateWebUrl('http://localhost:3000')).toBeNull();
    expect(validateWebUrl('http://127.0.0.1')).toBeNull();
    expect(validateWebUrl('http://10.0.0.1')).toBeNull();
    expect(validateWebUrl('http://192.168.1.1')).toBeNull();
    expect(validateWebUrl('http://172.16.0.1')).toBeNull();
    expect(validateWebUrl('http://my-site.local')).toBeNull();
    expect(validateWebUrl('http://my-site.internal')).toBeNull();
  });

  it('URL VALIDATION — accepts valid public URLs', () => {
    expect(validateWebUrl('https://example.com')).toBe('https://example.com/');
    expect(validateWebUrl('https://www.acquisitionos.com')).toBe('https://www.acquisitionos.com/');
    expect(validateWebUrl('http://example.com/page')).toBe('http://example.com/page');
  });

  it('URL VALIDATION — rejects non-http protocols', () => {
    expect(validateWebUrl('ftp://example.com')).toBeNull();
    expect(validateWebUrl('javascript:alert(1)')).toBeNull();
    expect(validateWebUrl('not-a-url')).toBeNull();
  });
});
