'use client';

import React, { useState, useCallback, useSyncExternalStore } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Cookie, Shield, BarChart3, Megaphone, Settings, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

// ===== Cookie Consent Types =====
interface CookiePreferences {
  necessary: boolean;
  analytics: boolean;
  marketing: boolean;
}

const CONSENT_KEY = 'acquisitionos_public_cookie_consent';
const CONSENT_PREFS_KEY = 'acquisitionos_public_cookie_preferences';

function getStoredPreferences(): CookiePreferences {
  if (typeof window === 'undefined') return { necessary: true, analytics: false, marketing: false };
  try {
    const stored = localStorage.getItem(CONSENT_PREFS_KEY);
    if (stored) return JSON.parse(stored);
  } catch {
    // ignore parse errors
  }
  return { necessary: true, analytics: false, marketing: false };
}

// Use useSyncExternalStore to read consent status without setState in effects
const CONSENT_CHANGE_EVENT = 'acquisitionos_public_consent_change';

function subscribeToConsent(callback: () => void) {
  window.addEventListener(CONSENT_CHANGE_EVENT, callback);
  window.addEventListener('storage', callback);
  return () => {
    window.removeEventListener(CONSENT_CHANGE_EVENT, callback);
    window.removeEventListener('storage', callback);
  };
}

function getConsentSnapshot(): boolean {
  try {
    return localStorage.getItem(CONSENT_KEY) !== null;
  } catch {
    return false;
  }
}

function getServerConsentSnapshot(): boolean {
  return true; // On server, assume consent given (don't show banner)
}

// ===== Manage Preferences Panel =====
function PreferencesPanel({
  open,
  onClose,
  onSave,
  preferences,
  setPreferences,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (prefs: CookiePreferences) => void;
  preferences: CookiePreferences;
  setPreferences: React.Dispatch<React.SetStateAction<CookiePreferences>>;
}) {
  if (!open) return null;

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center">
          <motion.div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="relative z-10 w-full max-w-md mx-4 rounded-2xl overflow-hidden border bg-background shadow-xl"
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          >
            <div className="p-6 space-y-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Settings className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold">Cookie Preferences</h3>
                    <p className="text-sm text-muted-foreground">Manage your cookie settings</p>
                  </div>
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="h-px bg-border" />

              {/* Necessary Cookies */}
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="h-8 w-8 rounded-lg bg-emerald-500/10 flex items-center justify-center mt-0.5">
                    <Shield className="h-4 w-4 text-emerald-500" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Necessary</p>
                    <p className="text-xs text-muted-foreground">
                      Required for the website to function properly. Cannot be disabled.
                    </p>
                  </div>
                </div>
                <Switch checked={true} disabled className="shrink-0" />
              </div>

              {/* Analytics Cookies */}
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="h-8 w-8 rounded-lg bg-sky-500/10 flex items-center justify-center mt-0.5">
                    <BarChart3 className="h-4 w-4 text-sky-500" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Analytics</p>
                    <p className="text-xs text-muted-foreground">
                      Help us understand how visitors interact with our website.
                    </p>
                  </div>
                </div>
                <Switch
                  checked={preferences.analytics}
                  onCheckedChange={(checked) =>
                    setPreferences((prev) => ({ ...prev, analytics: checked }))
                  }
                  className="shrink-0"
                />
              </div>

              {/* Marketing Cookies */}
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="h-8 w-8 rounded-lg bg-amber-500/10 flex items-center justify-center mt-0.5">
                    <Megaphone className="h-4 w-4 text-amber-500" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Marketing</p>
                    <p className="text-xs text-muted-foreground">
                      Used to track visitors across websites for advertising purposes.
                    </p>
                  </div>
                </div>
                <Switch
                  checked={preferences.marketing}
                  onCheckedChange={(checked) =>
                    setPreferences((prev) => ({ ...prev, marketing: checked }))
                  }
                  className="shrink-0"
                />
              </div>

              <div className="h-px bg-border" />

              <div className="flex items-center justify-between gap-3">
                <Button variant="outline" size="sm" onClick={onClose}>
                  Cancel
                </Button>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onSave({ necessary: true, analytics: false, marketing: false })}
                  >
                    Essential Only
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => onSave(preferences)}
                    className="bg-primary hover:bg-primary/90"
                  >
                    Save Preferences
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

// ===== Main Cookie Consent Banner =====
export default function CookieConsentBanner() {
  const consentGiven = useSyncExternalStore(subscribeToConsent, getConsentSnapshot, getServerConsentSnapshot);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [preferences, setPreferences] = useState<CookiePreferences>({
    necessary: true,
    analytics: false,
    marketing: false,
  });

  // Initialize preferences from localStorage on first render that shows the banner
  const [initialized, setInitialized] = useState(false);
  if (!initialized && !consentGiven) {
    setPreferences(getStoredPreferences());
    setInitialized(true);
  }

  const saveConsent = useCallback(
    (prefs: CookiePreferences) => {
      localStorage.setItem(CONSENT_KEY, new Date().toISOString());
      localStorage.setItem(CONSENT_PREFS_KEY, JSON.stringify(prefs));
      // Dispatch custom event so useSyncExternalStore picks up the change
      window.dispatchEvent(new Event(CONSENT_CHANGE_EVENT));
      window.dispatchEvent(new StorageEvent('storage', { key: CONSENT_KEY }));
      setPrefsOpen(false);
    },
    []
  );

  const handleAcceptAll = useCallback(() => {
    const allAccepted: CookiePreferences = { necessary: true, analytics: true, marketing: true };
    saveConsent(allAccepted);
  }, [saveConsent]);

  const handleRejectNonEssential = useCallback(() => {
    const onlyNecessary: CookiePreferences = { necessary: true, analytics: false, marketing: false };
    saveConsent(onlyNecessary);
  }, [saveConsent]);

  const handleSavePreferences = useCallback(
    (prefs: CookiePreferences) => {
      saveConsent({ ...prefs, necessary: true });
    },
    [saveConsent]
  );

  return (
    <>
      {/* Cookie Consent Banner */}
      <AnimatePresence>
        {!consentGiven && (
          <motion.div
            className="fixed bottom-0 left-0 right-0 z-[40] p-4 sm:p-6 safe-bottom"
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 200, damping: 25, delay: 0.5 }}
          >
            <div className="max-w-3xl mx-auto rounded-xl border bg-background/95 backdrop-blur-xl shadow-lg p-4 sm:p-5">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                    <Cookie className="h-5 w-5 text-primary" />
                  </div>
                  <div className="space-y-1 min-w-0">
                    <p className="text-sm font-medium">We value your privacy</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      We use cookies to enhance your browsing experience, serve personalized content, and analyze our traffic. By clicking &quot;Accept All&quot;, you consent to our use of cookies.{' '}
                      <a href="/legal/cookies" className="text-primary hover:underline underline-offset-2">Learn more</a>
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleRejectNonEssential}
                    className="text-xs text-muted-foreground hover:text-foreground flex-1 sm:flex-none"
                  >
                    Reject Non-Essential
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPrefsOpen(true)}
                    className="text-xs border-primary/20 hover:border-primary/40 flex-1 sm:flex-none"
                  >
                    Customize
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleAcceptAll}
                    className="text-xs bg-primary hover:bg-primary/90 flex-1 sm:flex-none"
                  >
                    Accept All
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Preferences Panel */}
      <PreferencesPanel
        open={prefsOpen}
        onClose={() => setPrefsOpen(false)}
        onSave={handleSavePreferences}
        preferences={preferences}
        setPreferences={setPreferences}
      />
    </>
  );
}
