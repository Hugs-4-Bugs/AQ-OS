#!/usr/bin/env python3
"""
Round-2 robust fixer with read-flip retry:
  A. ai-chat-bubble.tsx
     - repair `const essages, setMessages]` and `}, essages, ...]);` corruption
     - add activeTab read + hook-safe early return before main render
  B. api-keys-panel.tsx — ESC block on Create dialog
Reads /tmp-stable? No — reads src directly but retries up to 8 times and
verifies each write with a fresh read.
"""
import sys
import time

AB = "/home/z/my-project/src/components/dashboard/ai-chat-bubble.tsx"
AK = "/home/z/my-project/src/components/dashboard/api-keys-panel.tsx"


def read(p):
    with open(p, "r", encoding="utf-8") as f:
        return f.read()


def write(p, c):
    with open(p, "w", encoding="utf-8") as f:
        f.write(c)


def fix_ai_bubble(c):
    applied = 0
    # corruption repairs (idempotent)
    if "const essages, setMessages] = useState<AssistantMessage[]>([]);" in c:
        c = c.replace(
            "const essages, setMessages] = useState<AssistantMessage[]>([]);",
            "const [messages, setMessages] = useState<AssistantMessage[]>([]);",
        )
        applied += 1
    if "}, essages, assistantMutation.isPending]);" in c:
        c = c.replace(
            "}, essages, assistantMutation.isPending]);",
            "}, [messages, assistantMutation.isPending]);",
        )
        applied += 1
    # activeTab read (store already imported)
    if "const activeTab = useAppStore" not in c:
        marker = "  const selectedLeadId = useAppStore((s) => s.selectedLeadId);"
        if marker not in c:
            raise RuntimeError("selectedLeadId marker not found")
        c = c.replace(marker, "  const activeTab = useAppStore((s) => s.activeTab);\n" + marker)
        applied += 1
    # hook-safe early return immediately before the main render return
    if "AI_BUBBLE_ASSISTANT_GUARD" not in c:
        anchor = "\n  return (\n    <>\n      {/* ─── Floating Bubble Button ─── */}"
        if anchor not in c:
            raise RuntimeError("main render anchor not found")
        c = c.replace(
            anchor,
            "\n  // FIX (2026-09-09): Hidden on the Assistant tab — that page is\n"
            "  // already the AI chat surface and this bubble overlaps its\n"
            "  // message input / Send button. (All hooks above have run,\n"
            "  // so this early return is rules-of-hooks safe.)\n"
            "  if (activeTab === 'assistant') return null;\n"
            "  // AI_BUBBLE_ASSISTANT_GUARD" + anchor,
        )
        applied += 1
    ok = (
        "const [messages, setMessages] = useState<AssistantMessage[]>([]);" in c
        and "}, [messages, assistantMutation.isPending]);" in c
        and "AI_BUBBLE_ASSISTANT_GUARD" in c
        and "const activeTab = useAppStore" in c
        and "essages" not in c.replace("messages", "")
    )
    return c, applied, ok


def fix_api_keys(c):
    applied = 0
    old = (
        '        <DialogContent\n'
        '          className="sm:max-w-lg max-h-[calc(100vh-2rem)] overflow-y-auto w-[calc(100%-2rem)] sm:w-auto"\n'
        '          onPointerDownOutside={(e) => e.preventDefault()}\n'
        '          onInteractOutside={(e) => e.preventDefault()}\n'
        '        >'
    )
    new = (
        '        <DialogContent\n'
        '          className="sm:max-w-lg max-h-[calc(100vh-2rem)] overflow-y-auto w-[calc(100%-2rem)] sm:w-auto"\n'
        '          onPointerDownOutside={(e) => e.preventDefault()}\n'
        '          onInteractOutside={(e) => e.preventDefault()}\n'
        '          onEscapeKeyDown={(e) => e.preventDefault()}\n'
        '        >'
    )
    if old in c:
        c = c.replace(old, new)
        applied += 1
    ok = 'onEscapeKeyDown={(e) => e.preventDefault()}' in c
    return c, applied, ok


def run(path, fixer, name, attempts=8):
    for attempt in range(1, attempts + 1):
        try:
            c = read(path)
            new_c, applied, _ = fixer(c)
            if applied > 0:
                write(path, new_c)
            v = read(path)
            _, _, ok = fixer(v)
            if ok:
                print(f"{name}: OK (applied {applied}, attempt {attempt})")
                return True
            print(f"{name}: attempt {attempt} — flip detected, retrying...")
            time.sleep(2)
        except RuntimeError as e:
            print(f"{name}: attempt {attempt} — {e}")
            time.sleep(2)
    print(f"{name}: FAILED after {attempts} attempts")
    return False


def main():
    ok1 = run(AB, fix_ai_bubble, "ai-chat-bubble")
    ok2 = run(AK, fix_api_keys, "api-keys-panel")
    sys.exit(0 if (ok1 and ok2) else 1)


if __name__ == "__main__":
    main()
