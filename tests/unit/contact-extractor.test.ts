/**
 * Contact extractor tests (Stage D — spec §5)
 *
 * Covers: mailto:/tel: decoding, JSON-LD ContactPoint, keyword-context
 * phone/email scoping, third-party/junk filtering (social networks, image
 * assets, placeholders), business-domain ranking, phone normalization,
 * and the fill-if-empty merge with conflict flagging.
 */
import { describe, it, expect } from 'vitest';
import {
  extractContactsFromHtml, mergeExtractedContacts, normalizePhone, isFreeMail,
} from '@/lib/lead-discovery/contact-extractor';

describe('normalizePhone', () => {
  it('keeps valid numbers and drops noise', () => {
    expect(normalizePhone('+91 98765 43210')).toBe('+919876543210');
    expect(normalizePhone('(022) 4000-1234')).toBe('02240001234');
    expect(normalizePhone('2024 - 4000 - 123 - 56789')).toBe(''); // absurd run
    expect(normalizePhone('no digits')).toBe('');
  });
});

describe('extractContactsFromHtml', () => {
  it('extracts mailto: and tel: links with decoding and query stripping', () => {
    const html = `
      <a href="mailto:info@serenity.example?subject=Hello%20There">Email us</a>
      <a href="tel:+91 98765 43210">Call</a>`;
    const r = extractContactsFromHtml(html);
    expect(r.emails).toContain('info@serenity.example');
    expect(r.phones).toContain('+919876543210');
    expect(r.emailSources['info@serenity.example']).toContain('page:mailto');
  });

  it('extracts JSON-LD ContactPoint email/telephone', () => {
    const html = `
      <script type="application/ld+json">
        {"@type":"LocalBusiness","name":"Serenity","email":"contact@serenity.example","telephone":"+91 22 4000 1234"}
      </script>`;
    const r = extractContactsFromHtml(html);
    expect(r.emails).toContain('contact@serenity.example');
    expect(r.emailSources['contact@serenity.example']).toContain('page:jsonld');
    expect(r.phones).toContain('+912240001234');
  });

  it('ranks the business\u2019s own domain first over free-mail', () => {
    const html = `
      <a href="mailto:owner@gmail.com">personal</a>
      <a href="mailto:info@serenity.example">business</a>`;
    const r = extractContactsFromHtml(html, { businessDomain: 'serenity.example' });
    expect(r.emails[0]).toBe('info@serenity.example');
    expect(isFreeMail(r.emails[1] ?? '')).toBe(true);
  });

  it('filters social-network, asset and placeholder emails', () => {
    const html = `
      <a href="mailto:noreply@sentry.io">x</a>
      <a href="mailto:pages@facebook.com">y</a>
      <a href="mailto:logo@2x.png">img</a>
      <a href="mailto:test@example.com">z</a>
      <a href="mailto:real@serenity.example">ok</a>`;
    const r = extractContactsFromHtml(html, { businessDomain: 'serenity.example' });
    expect(r.emails).toEqual(['real@serenity.example']);
  });

  it('prefers keyword-context phones over random body numbers', () => {
    const html = `
      <p>Established 2014 serving 5000 customers since 2015 with 200 products.</p>
      <div class="contact-info">Phone: +91 98765 43210</div>`;
    const r = extractContactsFromHtml(html);
    expect(r.phones[0]).toBe('+919876543210');
    expect(r.phoneSources['+919876543210']?.some((s) => s.includes('context') || s.includes('keyword'))).toBe(true);
  });

  it('returns empty (not fabricated) values for a contact-less page', () => {
    const html = '<html><body><h1>Welcome to our shop</h1><p>We sell lovely things.</p></body></html>';
    const r = extractContactsFromHtml(html);
    expect(r.emails).toEqual([]);
    expect(r.phones).toEqual([]);
  });
});

describe('mergeExtractedContacts (fill-if-empty + conflict flag)', () => {
  it('fills empty fields and records provenance', () => {
    const r = mergeExtractedContacts(
      { email: null, phone: null },
      {
        emails: ['info@serenity.example'],
        phones: ['+919876543210'],
        emailSources: { 'info@serenity.example': ['page:mailto'] },
        phoneSources: { '+919876543210': ['page:tel'] },
      },
      'serenity.example',
    );
    expect(r.updates).toEqual({ email: 'info@serenity.example', phone: '+919876543210' });
    expect(r.provenance.email?.source).toContain('mailto');
    expect(r.provenance.phone?.source).toContain('tel');
    expect(r.conflict.email).toBeFalsy();
  });

  it('never overwrites existing values — flags conflicts instead (spec §5/§6)', () => {
    const r = mergeExtractedContacts(
      { email: 'existing@serenity.example', phone: '+919999999999' },
      {
        emails: ['different@serenity.example'],
        phones: ['+919876543210'],
        emailSources: { 'different@serenity.example': ['page:mailto'] },
        phoneSources: { '+919876543210': ['page:tel'] },
      },
      'serenity.example',
    );
    expect(r.updates).toEqual({});
    expect(r.conflict.email).toBe(true);
    expect(r.conflict.phone).toBe(true);
  });

  it('treats the same value (normalized) as no-op, not conflict', () => {
    const r = mergeExtractedContacts(
      { email: 'INFO@serenity.example', phone: '+91 98765 43210' },
      {
        emails: ['info@serenity.example'],
        phones: ['+919876543210'],
        emailSources: { 'info@serenity.example': ['page:mailto'] },
        phoneSources: { '+919876543210': ['page:context'] },
      },
      'serenity.example',
    );
    expect(r.updates).toEqual({});
    expect(r.conflict.email).toBeFalsy();
    expect(r.conflict.phone).toBeFalsy();
  });
});
