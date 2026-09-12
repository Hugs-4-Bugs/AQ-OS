'use client';

import React, { useState, useCallback, useSyncExternalStore } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Cookie, Shield, BarChart3, Megaphone, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { useLegalStore } from '@/lib/legal-store';

// ===== Cookie Consent Types =====
interface CookiePreferences {
  necessary: boolean;
  analytics: boolean;
  marketing: boolean;
}

const CONSENT_KEY = 'acquisitionos_cookie_consent';
const CONSENT_PREFS_KEY = 'acquisitionos_cookie_preferences';

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
function subscribeToStorage(callback: () => void) {
  window.addEventListener('storage', callback);
  return () => window.removeEventListener('storage', callback);
}

function getConsentSnapshot(): boolean {
  return localStorage.getItem(CONSENT_KEY) !== null;
}

function getServerConsentSnapshot(): boolean {
  return true; // On server, assume consent given (don't show banner)
}

// ===== Manage Preferences Modal =====
function PreferencesModal({
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
    <div className="fixed inset-0 z-[110] flex items-center justify-center">
      <motion.div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.div
        className="relative z-10 w-full max-w-md mx-4 glass-card rounded-2xl overflow-hidden"
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      >
        <div className="p-6 space-y-5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Settings className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="text-lg font-semibold">Cookie Preferences</h3>
              <p className="text-sm text-muted-foreground">Manage your cookie settings</p>
            </div>
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

          <div className="flex items-center justify-end gap-3">
            <Button variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" onClick={() => onSave(preferences)} className="bg-primary hover:bg-primary/90">
              Save Preferences
            </Button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// ===== Main Cookie Consent Component =====
export default function CookieConsent() {
  const consentGiven = useSyncExternalStore(subscribeToStorage, getConsentSnapshot, getServerConsentSnapshot);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [preferences, setPreferences] = useState<CookiePreferences>({
    necessary: true,
    analytics: false,
    marketing: false,
  });

  // Initialize preferences from localStorage on first render that shows the banner
  // (This is safe because useSyncExternalStore ensures this only runs on client)
  const [initialized, setInitialized] = useState(false);
  if (!initialized && !consentGiven) {
    setPreferences(getStoredPreferences());
    setInitialized(true);
  }

  const saveConsent = useCallback(
    (prefs: CookiePreferences) => {
      localStorage.setItem(CONSENT_KEY, new Date().toISOString());
      localStorage.setItem(CONSENT_PREFS_KEY, JSON.stringify(prefs));
      // Dispatch storage event so useSyncExternalStore picks up the change
      window.dispatchEvent(new Event('storage'));
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
            className="fixed bottom-0 left-0 right-0 z-[40] pb-16 sm:pb-4 p-3 sm:p-4"
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 200, damping: 25, delay: 0.5 }}
          >
            <div className="max-w-4xl mx-auto glass-strong rounded-xl p-3 sm:p-4 border border-border/50">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <div className="flex items-start gap-3 flex-1">
                  <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                    <Cookie className="h-5 w-5 text-primary" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium">We value your privacy</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      We use cookies to improve your experience. By continuing, you agree to our{' '}
                      <button
                        type="button"
                        onClick={() => useLegalStore.getState().openLegal('cookies')}
                        className="text-primary hover:text-primary/80 underline transition-colors"
                      >
                        cookie policy
                      </button>
                      .
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
                    Manage Preferences
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

      {/* Preferences Modal */}
      <AnimatePresence>
        {prefsOpen && (
          <PreferencesModal
            open={prefsOpen}
            onClose={() => setPrefsOpen(false)}
            onSave={handleSavePreferences}
            preferences={preferences}
            setPreferences={setPreferences}
          />
        )}
      </AnimatePresence>
    </>
  );
}
