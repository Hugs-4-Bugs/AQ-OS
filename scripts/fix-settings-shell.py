#!/usr/bin/env python3
"""
One-shot fixer for src/components/dashboard/settings-shell.tsx:
  1. Repair corruption: `const eetingSettings,` / `}, eetingSettings]);`
  2. Fix loadMeetingSettings key mapping (API returns meeting* fields)
  3. Fix handleSaveMeetingSettings payload (send API meeting* fields)
Idempotent: safe to run multiple times. Verifies after write.
"""
import re
import sys

PATH = "/home/z/my-project/src/components/dashboard/settings-shell.tsx"


def read():
    with open(PATH, "r", encoding="utf-8") as f:
        return f.read()


def write(content):
    with open(PATH, "w", encoding="utf-8") as f:
        f.write(content)


def main():
    c = read()
    changed = False

    # ── 1. Corruption repairs ────────────────────────────────────
    fixes = [
        ("const eetingSettings, setMeetingSettings] = useState({",
         "const [meetingSettings, setMeetingSettings] = useState({"),
        ("const eetingSettingsSaving, setMeetingSettingsSaving] = useState(false);",
         "const [meetingSettingsSaving, setMeetingSettingsSaving] = useState(false);"),
        ("}, eetingSettings]);",
         "}, [meetingSettings]);"),
    ]
    for bad, good in fixes:
        if bad in c:
            c = c.replace(bad, good)
            print(f"REPAIRED: {bad[:60]}")
            changed = True

    # ── 2. Load mapping fix ──────────────────────────────────────
    old_load = """        if (data.settings) {
          setMeetingSettings(prev => ({
            ...prev,
            preferredPlatform: data.settings.preferredPlatform || prev.preferredPlatform,
            defaultDuration: data.settings.defaultDuration?.toString() || prev.defaultDuration,
            bufferTime: data.settings.bufferTime?.toString() || prev.bufferTime,
            workingHoursStart: data.settings.workingHoursStart || prev.workingHoursStart,
            workingHoursEnd: data.settings.workingHoursEnd || prev.workingHoursEnd,
            workingDays: data.settings.workingDays || prev.workingDays,
            timezone: data.settings.timezone || prev.timezone,
            autoSchedule: data.settings.autoSchedule ?? prev.autoSchedule,
          }));
        }"""
    new_load = """        if (data.settings) {
          // FIX (2026-09-09): Map the API's meeting* field names onto the
          // UI state keys (previously read non-existent keys, so saved
          // preferences never loaded back into the form).
          let uiDays: string[] | null = null;
          try {
            const rawDays = typeof data.settings.meetingWorkingDays === 'string'
              ? JSON.parse(data.settings.meetingWorkingDays)
              : data.settings.meetingWorkingDays;
            if (Array.isArray(rawDays)) {
              const numToDay: Record<number, string> = { 1: 'mon', 2: 'tue', 3: 'wed', 4: 'thu', 5: 'fri', 6: 'sat', 7: 'sun' };
              uiDays = rawDays.map((n: number) => numToDay[n]).filter(Boolean);
            }
          } catch {
            uiDays = null;
          }
          setMeetingSettings(prev => ({
            ...prev,
            preferredPlatform: (data.settings.meetingPlatform || 'google_meet').replace(/_/g, '-') || prev.preferredPlatform,
            defaultDuration: data.settings.meetingDurationDefault?.toString() || prev.defaultDuration,
            bufferTime: data.settings.meetingBufferMinutes?.toString() || prev.bufferTime,
            workingHoursStart: data.settings.meetingWorkingHoursStart || prev.workingHoursStart,
            workingHoursEnd: data.settings.meetingWorkingHoursEnd || prev.workingHoursEnd,
            workingDays: uiDays && uiDays.length > 0 ? uiDays : prev.workingDays,
            timezone: data.settings.meetingTimezone || prev.timezone,
            autoSchedule: data.settings.meetingAutoSchedule ?? prev.autoSchedule,
          }));
        }"""
    if old_load in c:
        c = c.replace(old_load, new_load)
        print("FIXED: loadMeetingSettings field mapping")
        changed = True
    elif "meetingPlatform: (data.settings.meetingPlatform" in c:
        print("OK: load mapping already fixed")
    else:
        print("WARN: load block not found (view flip?)")

    # ── 3. Save payload fix ──────────────────────────────────────
    old_save = """  const handleSaveMeetingSettings = useCallback(async () => {
    setMeetingSettingsSaving(true);
    try {
      const res = await fetch('/api/meetings/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(meetingSettings),
      });"""
    new_save = """  const handleSaveMeetingSettings = useCallback(async () => {
    setMeetingSettingsSaving(true);
    try {
      // FIX (2026-09-09): Send the API's meeting* field names — the raw UI
      // object was previously sent and the API recognized none of the
      // fields (silently 400-ing), so Meeting Preferences never persisted.
      const dayToNum: Record<string, number> = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 7 };
      const res = await fetch('/api/meetings/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          meetingPlatform: (meetingSettings.preferredPlatform || 'google-meet').replace(/-/g, '_'),
          meetingDurationDefault: parseInt(meetingSettings.defaultDuration, 10) || 30,
          meetingBufferMinutes: parseInt(meetingSettings.bufferTime, 10) || 0,
          meetingWorkingHoursStart: meetingSettings.workingHoursStart || '09:00',
          meetingWorkingHoursEnd: meetingSettings.workingHoursEnd || '18:00',
          meetingWorkingDays: (meetingSettings.workingDays || [])
            .map((d: string) => dayToNum[d])
            .filter((n: number) => !!n),
          meetingTimezone: meetingSettings.timezone || 'UTC',
          meetingAutoSchedule: !!meetingSettings.autoSchedule,
        }),
      });"""
    if old_save in c:
        c = c.replace(old_save, new_save)
        print("FIXED: handleSaveMeetingSettings payload")
        changed = True
    elif "dayToNum: Record<string, number> = { mon: 1" in c:
        print("OK: save payload already fixed")
    else:
        print("WARN: save block not found (view flip?)")

    if changed:
        write(c)
        print("WRITTEN to disk")
    else:
        print("no changes needed this pass")

    # ── Verify ───────────────────────────────────────────────────
    v = read()
    ok = (
        "const [meetingSettings, setMeetingSettings] = useState({" in v
        and "}, [meetingSettings]);" in v
        and "meetingPlatform: (meetingSettings.preferredPlatform" in v
        and "eetingSettings" not in v.replace("setMeetingSettings", "").replace("meetingSettings", "")
    )
    print("VERIFY:", "PASS" if ok else "FAIL — re-run needed")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
