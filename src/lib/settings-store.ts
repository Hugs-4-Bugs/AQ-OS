'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface AppSettings {
  defaultNiche: string;
  defaultCountry: string;
  notificationsEnabled: boolean;
  reminderCheckInterval: number;
  autoAnalyzeOnDiscover: boolean;
  darkMode: boolean;
  compactView: boolean;
  pipelineAutoRefresh: boolean;
}

const DEFAULT_SETTINGS: AppSettings = {
  defaultNiche: '',
  defaultCountry: '',
  notificationsEnabled: true,
  reminderCheckInterval: 60,
  autoAnalyzeOnDiscover: false,
  // FIX 14: default theme is light — this flag mirrors the next-themes
  // defaultTheme="light" setting (providers.tsx). Users who explicitly
  // choose dark keep their preference (persisted via next-themes storage).
  darkMode: false,
  compactView: false,
  pipelineAutoRefresh: false,
};

interface SettingsState extends AppSettings {
  updateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  resetAll: () => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,

      updateSetting: (key, value) =>
        set({ [key]: value } as Partial<AppSettings>),

      resetAll: () =>
        set(DEFAULT_SETTINGS),
    }),
    {
      name: 'war-room-settings',
    }
  )
);
