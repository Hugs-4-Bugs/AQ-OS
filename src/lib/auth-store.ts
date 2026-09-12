// AcquisitionOS — Client-side Auth Store (Zustand)

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type UserRole = 'super_admin' | 'owner' | 'admin' | 'member' | 'viewer';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  plan: string;
  orgId: string | null;
  emailVerified: boolean;
  mfaEnabled: boolean;
  avatarUrl: string | null;
}

interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  mfaRequired: boolean;
  mfaSessionToken: string | null; // temporary token after password check when MFA is required

  // Actions
  setUser: (user: AuthUser | null) => void;
  setLoading: (loading: boolean) => void;
  setMfaRequired: (required: boolean, sessionToken?: string) => void;
  logout: () => void;
  updatePlan: (plan: string) => void;
  updateEmailVerified: (verified: boolean) => void;
  updateMfaEnabled: (enabled: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      isLoading: true, // Start true to prevent flash
      mfaRequired: false,
      mfaSessionToken: null,

      setUser: (user) =>
        set({
          user,
          isAuthenticated: !!user,
          isLoading: false,
          mfaRequired: false,
          mfaSessionToken: null,
        }),

      setLoading: (isLoading) => set({ isLoading }),

      setMfaRequired: (mfaRequired, sessionToken) =>
        set({
          mfaRequired,
          mfaSessionToken: sessionToken || null,
          isLoading: false,
        }),

      logout: () =>
        set({
          user: null,
          isAuthenticated: false,
          isLoading: false,
          mfaRequired: false,
          mfaSessionToken: null,
        }),

      updatePlan: (plan) =>
        set((state) => ({
          user: state.user ? { ...state.user, plan } : null,
        })),

      updateEmailVerified: (emailVerified) =>
        set((state) => ({
          user: state.user ? { ...state.user, emailVerified } : null,
        })),

      updateMfaEnabled: (mfaEnabled) =>
        set((state) => ({
          user: state.user ? { ...state.user, mfaEnabled } : null,
        })),
    }),
    {
      name: 'acquisitionos-auth',
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
