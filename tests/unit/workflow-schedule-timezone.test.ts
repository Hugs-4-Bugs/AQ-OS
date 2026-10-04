// ═════════════════════════════════════════════════════════════════════
// Unit Tests: Timezone-aware workflow scheduling + missed-job catch-up
// Spec: default daily 08:00 Asia/Kolkata, server-side execution, catch-up
// window after a missed tick, per-local-day idempotency.
// ═════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import {
  getZonedTimeParts,
  shouldFireSchedule,
  evaluateCron,
  scheduleTimezone,
  DEFAULT_SCHEDULE_TIMEZONE,
  SCHEDULE_CATCHUP_MINUTES,
} from '@/lib/workflow-triggers';

describe('workflow schedule timezone support', () => {
  it('defaults to Asia/Kolkata', () => {
    expect(DEFAULT_SCHEDULE_TIMEZONE).toBe('Asia/Kolkata');
    expect(scheduleTimezone({})).toBe('Asia/Kolkata');
    expect(scheduleTimezone({ timezone: '  ' })).toBe('Asia/Kolkata');
    expect(scheduleTimezone({ timezone: 'UTC' })).toBe('UTC');
  });

  it('computes zoned wall-clock parts for Asia/Kolkata (UTC+5:30)', () => {
    // 02:00 UTC == 07:30 IST on the same date
    const utc2am = new Date('2026-10-04T02:00:00Z');
    const ist = getZonedTimeParts(utc2am, 'Asia/Kolkata');
    expect(ist.hour).toBe(7);
    expect(ist.minute).toBe(30);
    expect(ist.minutesOfDay).toBe(7 * 60 + 30);
    // dateKey uses the KOLKATA calendar day
    expect(ist.dateKey).toBe('2026-10-04');
  });

  it('computes zoned parts that cross the date boundary', () => {
    // 20:00 UTC on Oct 4 == 01:30 IST on Oct 5
    const utc8pm = new Date('2026-10-04T20:00:00Z');
    const ist = getZonedTimeParts(utc8pm, 'Asia/Kolkata');
    expect(ist.hour).toBe(1);
    expect(ist.minute).toBe(30);
    expect(ist.dateKey).toBe('2026-10-05');
  });

  it('falls back to server-local parts for an invalid timezone without throwing', () => {
    const d = new Date('2026-10-04T02:00:00Z');
    const parts = getZonedTimeParts(d, 'Not/AZone');
    expect(Number.isFinite(parts.minutesOfDay)).toBe(true);
    expect(parts.dateKey).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('shouldFireSchedule — daily with catch-up window', () => {
  const config = { frequency: 'daily', time: '08:00' }; // default tz: Asia/Kolkata

  it('fires at exactly 08:00 IST', () => {
    const now = new Date('2026-10-04T02:30:00Z'); // 08:00 IST
    expect(shouldFireSchedule(config, now)).toBe(true);
  });

  it('fires within the catch-up window (e.g. cron gateway was 10 minutes late)', () => {
    const now = new Date('2026-10-04T02:40:00Z'); // 08:10 IST
    expect(shouldFireSchedule(config, now)).toBe(true);
  });

  it('does NOT fire past the catch-up window (08:30 IST)', () => {
    const now = new Date('2026-10-04T03:00:00Z'); // 08:30 IST
    expect(shouldFireSchedule(config, now)).toBe(false);
  });

  it('does NOT fire before the scheduled time (07:55 IST)', () => {
    const now = new Date('2026-10-04T02:25:00Z'); // 07:55 IST
    expect(shouldFireSchedule(config, now)).toBe(false);
  });

  it('respects the timezone: 08:00 IST is NOT 08:00 UTC', () => {
    const now = new Date('2026-10-04T08:00:00Z'); // 13:30 IST — far past window
    expect(shouldFireSchedule(config, now)).toBe(false);
  });

  it('honors an explicit UTC timezone instead of the default', () => {
    const utcConfig = { frequency: 'daily', time: '08:00', timezone: 'UTC' };
    const now = new Date('2026-10-04T08:00:00Z'); // 08:00 UTC
    expect(shouldFireSchedule(utcConfig, now)).toBe(true);
    // 02:30 UTC == 08:00 IST, but this workflow runs on UTC — must NOT fire
    const istMorning = new Date('2026-10-04T02:30:00Z');
    expect(shouldFireSchedule(utcConfig, istMorning)).toBe(false);
  });

  it('catch-up window is 15 minutes', () => {
    expect(SCHEDULE_CATCHUP_MINUTES).toBe(15);
  });
});

describe('shouldFireSchedule — weekly and monthly', () => {
  it('weekly fires on the correct weekday within the window', () => {
    // 2026-10-04 is a Sunday
    const config = { frequency: 'weekly', dayOfWeek: 'sunday', time: '08:00' };
    expect(shouldFireSchedule(config, new Date('2026-10-04T02:35:00Z'))).toBe(true); // Sun 08:05 IST
    expect(shouldFireSchedule(config, new Date('2026-10-05T02:30:00Z'))).toBe(false); // Monday
  });

  it('monthly fires on the correct day within the window', () => {
    const config = { frequency: 'monthly', dayOfMonth: 4, time: '08:00' };
    expect(shouldFireSchedule(config, new Date('2026-10-04T02:35:00Z'))).toBe(true);
    expect(shouldFireSchedule(config, new Date('2026-10-05T02:30:00Z'))).toBe(false);
  });
});

describe('shouldFireSchedule — cron with catch-up', () => {
  it('fires within the window after the cron minute (missed-job policy)', () => {
    const config = { frequency: 'cron', cron: '0 8 * * *' }; // 08:00 IST
    // 08:00 IST exactly:
    expect(shouldFireSchedule(config, new Date('2026-10-04T02:30:00Z'))).toBe(true);
    // 08:12 IST (12 minutes late — inside the 15-minute catch-up):
    expect(shouldFireSchedule(config, new Date('2026-10-04T02:42:00Z'))).toBe(true);
    // 08:20 IST (20 minutes late — outside the window):
    expect(shouldFireSchedule(config, new Date('2026-10-04T02:50:00Z'))).toBe(false);
  });
});

describe('evaluateCron (zoned parts)', () => {
  const parts = (o: { minute: number; hour: number; day: number; month: number; dayOfWeek: number }) => ({
    ...o,
    minutesOfDay: o.hour * 60 + o.minute,
    dateKey: '2026-10-04',
  });

  it('matches stars, exact values, intervals and lists', () => {
    expect(evaluateCron('* * * * *', parts({ minute: 7, hour: 8, day: 4, month: 10, dayOfWeek: 0 }))).toBe(true);
    expect(evaluateCron('0 8 * * *', parts({ minute: 0, hour: 8, day: 4, month: 10, dayOfWeek: 0 }))).toBe(true);
    expect(evaluateCron('0 8 * * *', parts({ minute: 1, hour: 8, day: 4, month: 10, dayOfWeek: 0 }))).toBe(false);
    expect(evaluateCron('*/15 9 * * *', parts({ minute: 45, hour: 9, day: 4, month: 10, dayOfWeek: 0 }))).toBe(true);
    expect(evaluateCron('0 8 * * 1-5'.replace('1-5', '0,1,2,3,4,5,6'), parts({ minute: 0, hour: 8, day: 4, month: 10, dayOfWeek: 3 }))).toBe(true);
  });

  it('rejects malformed cron expressions', () => {
    expect(evaluateCron('not a cron', parts({ minute: 0, hour: 0, day: 1, month: 1, dayOfWeek: 0 }))).toBe(false);
    expect(evaluateCron('* * * *', parts({ minute: 0, hour: 0, day: 1, month: 1, dayOfWeek: 0 }))).toBe(false);
  });
});
