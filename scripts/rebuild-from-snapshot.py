#!/usr/bin/env python3
"""
Rebuild settings-shell.tsx + feedback-provider.tsx from KNOWN-CLEAN /tmp
snapshots (captured during a clean read window), applying the pending
fixes to the snapshot content, then writing fresh to src/.
/tmp is a separate mount and has shown stable reads throughout.
"""
import shutil
import sys

SS_SNAP = "/tmp/ss-copy.tsx"
FP_SNAP = "/tmp/fp-copy.tsx"
SS_DST = "/home/z/my-project/src/components/dashboard/settings-shell.tsx"
FP_DST = "/home/z/my-project/src/components/feedback/feedback-provider.tsx"


def read(p):
    with open(p, "r", encoding="utf-8") as f:
        return f.read()


def write(p, c):
    with open(p, "w", encoding="utf-8") as f:
        f.write(c)


def main():
    # ── settings-shell ───────────────────────────────────────────
    c = read(SS_SNAP)
    assert "const [meetingSettings, setMeetingSettings] = useState({" in c, "snapshot is corrupted!"

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
    assert old_load in c, "load block not found in snapshot"
    c = c.replace(old_load, new_load)

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
    assert old_save in c, "save block not found in snapshot"
    c = c.replace(old_save, new_save)

    write(SS_DST, c)
    print("settings-shell: rebuilt from clean snapshot + fixes written")

    # ── feedback-provider ────────────────────────────────────────
    fp = read(FP_SNAP)
    assert "const [modalOpen, setModalOpen] = useState(false);" in fp, "fp snapshot is corrupted!"
    write(FP_DST, fp)
    print("feedback-provider: rebuilt from clean snapshot")

    # ── verify from disk ─────────────────────────────────────────
    v1 = read(SS_DST)
    checks = [
        "const [meetingSettings, setMeetingSettings] = useState({" in v1,
        "const [meetingSettingsSaving, setMeetingSettingsSaving] = useState(false);" in v1,
        "}, [meetingSettings]);" in v1,
        "dayToNum" in v1,
        "meetingPlatform: (meetingSettings.preferredPlatform" in v1,
        "meetingPlatform: (data.settings.meetingPlatform" in v1,
    ]
    v2 = read(FP_DST)
    checks.append("const [modalOpen, setModalOpen] = useState(false);" in v2)
    print("VERIFY:", "PASS" if all(checks) else f"FAIL {checks}")
    sys.exit(0 if all(checks) else 1)


if __name__ == "__main__":
    main()
