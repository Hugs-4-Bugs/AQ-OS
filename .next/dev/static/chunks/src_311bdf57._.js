(globalThis.TURBOPACK || (globalThis.TURBOPACK = [])).push([typeof document === "object" ? document.currentScript : undefined,
"[project]/src/hooks/use-auth.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "useAuth",
    ()=>useAuth
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$auth$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/auth-store.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$subscription$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/subscription-store.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/navigation.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2d$error$2d$handler$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/api-error-handler.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$cache$2d$invalidation$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/cache-invalidation.ts [app-client] (ecmascript)");
var _s = __turbopack_context__.k.signature();
// AcquisitionOS — Authentication Hook
'use client';
;
;
;
;
;
;
function useAuth() {
    _s();
    const router = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRouter"])();
    const { user, isAuthenticated, isLoading, mfaRequired, mfaSessionToken, setUser, setLoading, setMfaRequired, logout, updatePlan, updateEmailVerified, updateMfaEnabled } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$auth$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAuthStore"])();
    // Fetch current user on mount
    // ── P11 (Sep 2026): infrastructure failures are NOT anonymous ──
    // 401 → genuinely unauthenticated → setUser(null).
    // 5xx / network / 503 → backend temporarily unavailable → KEEP the
    // current user (if any). Converting a 503 into setUser(null) silently
    // logged users out during every transient backend failure.
    const fetchUser = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "useAuth.useCallback[fetchUser]": async ()=>{
            try {
                const data = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2d$error$2d$handler$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["apiCall"])('/api/auth/me', {
                    credentials: 'include'
                }, {
                    errorMessage: 'Failed to fetch user',
                    showToast: false
                });
                setUser(data.user);
            } catch (error) {
                const status = error?.status;
                if (status === 401) {
                    setUser(null);
                }
            // Non-401: keep the last-known user state; the next successful
            // fetch/refresh will reconcile. If we have no user yet, stay
            // unauthenticated-but-pending rather than forcing null (same
            // observable result for a fresh browser, but a transient failure
            // can no longer DESTROY an existing session view).
            }
        }
    }["useAuth.useCallback[fetchUser]"], [
        setUser
    ]);
    // Sign in with email and password
    //
    // NOTE: We intentionally do NOT toggle the global `setLoading` here (same
    // rationale as signUp below). AuthGate renders a full-screen LoadingScreen
    // while `isLoading` is true, which UNMOUNTS SignInPage and destroys its
    // local state — the inline error alert and filled fields would be lost on
    // remount. SignInPage tracks its own `isSubmitting` for the button spinner.
    const signIn = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "useAuth.useCallback[signIn]": async (email, password, rememberMe)=>{
            try {
                const res = await fetch('/api/auth/signin', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    credentials: 'include',
                    body: JSON.stringify({
                        email,
                        password,
                        rememberMe: !!rememberMe
                    })
                });
                const data = await res.json();
                if (!res.ok) {
                    // Handle email verification required
                    if (data.requiresVerification) {
                        return {
                            success: false,
                            error: data.error || 'Email verification required',
                            requiresVerification: true,
                            email: data.email
                        };
                    }
                    // Propagate account-state flags so the UI can show actionable alerts
                    // (unified login: a registered email can log in via ANY method).
                    return {
                        success: false,
                        error: data.error || 'Sign in failed',
                        mfaRequired: data.mfaRequired || false,
                        emailNotVerified: data.emailNotVerified || false,
                        verificationResent: data.verificationResent || false,
                        noPasswordSet: data.noPasswordSet || false,
                        email: data.email,
                        // DEV-ONLY (sandbox): the fresh verification code the server just
                        // generated for the unverified account, when it cannot be emailed.
                        devDelivery: data.devDelivery || undefined
                    };
                }
                // If MFA is required, set the state
                if (data.mfaRequired) {
                    setMfaRequired(true, data.mfaSessionToken);
                    return {
                        success: false,
                        error: 'MFA verification required',
                        mfaRequired: true
                    };
                }
                setUser(data.user);
                return {
                    success: true,
                    user: data.user,
                    mfaRequired: false
                };
            } catch (error) {
                return {
                    success: false,
                    error: 'Network error. Please try again.',
                    mfaRequired: false
                };
            }
        }
    }["useAuth.useCallback[signIn]"], [
        setUser,
        setMfaRequired
    ]);
    // Sign up with email and password
    //
    // IMPORTANT: We intentionally do NOT toggle the global `setLoading` here.
    // AuthGate uses `isLoading` to decide whether to show the full-screen
    // LoadingScreen, which would unmount the SignUpPage and discard its
    // `showSuccess` state — preventing the post-signup "Check your email" screen
    // from ever rendering. Instead, the SignUpPage component tracks its own
    // local `isSubmitting` state for the button spinner, and we leave the global
    // loading flag alone so the auth pages stay mounted across the request.
    const signUp = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "useAuth.useCallback[signUp]": async (params)=>{
            try {
                const res = await fetch('/api/auth/signup', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    credentials: 'include',
                    body: JSON.stringify(params)
                });
                const data = await res.json();
                if (!res.ok) {
                    return {
                        success: false,
                        error: data.error || 'Sign up failed',
                        emailRegistered: data.emailRegistered || false,
                        email: data.email
                    };
                }
                // If signup requires email verification, don't set user (they're not authenticated yet)
                if (data.requiresVerification) {
                    return {
                        success: true,
                        requiresVerification: true,
                        email: data.email,
                        emailProvider: data.emailProvider,
                        // DEV-ONLY (sandbox): verification code surfaced in-place when the
                        // server has no email provider configured. Never set in production.
                        devDelivery: data.devDelivery || undefined
                    };
                }
                setUser(data.user);
                return {
                    success: true,
                    user: data.user
                };
            } catch (error) {
                return {
                    success: false,
                    error: 'Network error. Please try again.'
                };
            }
        }
    }["useAuth.useCallback[signUp]"], [
        setUser
    ]);
    // Verify MFA TOTP code
    const verifyMfa = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "useAuth.useCallback[verifyMfa]": async (code, rememberMe)=>{
            if (!mfaSessionToken) {
                return {
                    success: false,
                    error: 'No MFA session found'
                };
            }
            try {
                const res = await fetch('/api/auth/mfa/verify', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    credentials: 'include',
                    body: JSON.stringify({
                        code,
                        mfaSessionToken,
                        rememberMe: !!rememberMe
                    })
                });
                const data = await res.json();
                if (!res.ok) {
                    return {
                        success: false,
                        error: data.error || 'MFA verification failed'
                    };
                }
                setUser(data.user);
                return {
                    success: true,
                    user: data.user
                };
            } catch  {
                return {
                    success: false,
                    error: 'Network error. Please try again.'
                };
            }
        }
    }["useAuth.useCallback[verifyMfa]"], [
        mfaSessionToken,
        setUser
    ]);
    // Verify email with OTP
    const verifyEmail = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "useAuth.useCallback[verifyEmail]": async (email, otp)=>{
            try {
                const res = await fetch('/api/auth/verify-email', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        email,
                        otp
                    })
                });
                const data = await res.json();
                if (!res.ok) {
                    return {
                        success: false,
                        error: data.error || 'Verification failed'
                    };
                }
                updateEmailVerified(true);
                return {
                    success: true
                };
            } catch  {
                return {
                    success: false,
                    error: 'Network error. Please try again.'
                };
            }
        }
    }["useAuth.useCallback[verifyEmail]"], [
        updateEmailVerified
    ]);
    // Request password reset
    const forgotPassword = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "useAuth.useCallback[forgotPassword]": async (email)=>{
            try {
                const res = await fetch('/api/auth/forgot-password', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        email
                    })
                });
                const data = await res.json();
                if (!res.ok) {
                    return {
                        success: false,
                        error: data.error || 'Request failed'
                    };
                }
                return {
                    success: true,
                    message: data.message,
                    emailProvider: data.emailProvider,
                    // DEV-ONLY (sandbox): reset code surfaced in-place when the server
                    // has no email provider configured. Never set in production.
                    devDelivery: data.devDelivery || undefined
                };
            } catch  {
                return {
                    success: false,
                    error: 'Network error. Please try again.'
                };
            }
        }
    }["useAuth.useCallback[forgotPassword]"], []);
    // Reset password with OTP
    const resetPassword = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "useAuth.useCallback[resetPassword]": async (params)=>{
            try {
                const res = await fetch('/api/auth/reset-password', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(params)
                });
                const data = await res.json();
                if (!res.ok) {
                    return {
                        success: false,
                        error: data.error || 'Reset failed'
                    };
                }
                return {
                    success: true
                };
            } catch  {
                return {
                    success: false,
                    error: 'Network error. Please try again.'
                };
            }
        }
    }["useAuth.useCallback[resetPassword]"], []);
    // Sign out
    const signOut = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "useAuth.useCallback[signOut]": async ()=>{
            try {
                await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2d$error$2d$handler$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["apiCall"])('/api/auth/signout', {
                    method: 'POST',
                    credentials: 'include'
                }, {
                    errorMessage: 'Sign out failed',
                    showToast: false
                });
            } catch  {
            // Continue even if API call fails — still clear local state
            }
            // ACCOUNT ISOLATION (cache layer): purge every account-scoped client
            // cache BEFORE the next login so account B can never briefly observe
            // account A's data through React Query snapshots, zustand persists or
            // user-scoped localStorage keys.
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$cache$2d$invalidation$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["clearAccountScopedClientState"])();
            window.dispatchEvent(new Event('aqos:auth-logout')); // React Query clear (providers.tsx)
            logout();
            __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$subscription$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useSubscriptionStore"].getState().reset(); // Reset subscription store
            router.push('/');
        }
    }["useAuth.useCallback[signOut]"], [
        logout,
        router
    ]);
    // Refresh auth state
    const refreshAuth = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "useAuth.useCallback[refreshAuth]": async ()=>{
            setLoading(true);
            await fetchUser();
        }
    }["useAuth.useCallback[refreshAuth]"], [
        setLoading,
        fetchUser
    ]);
    return {
        user,
        isAuthenticated,
        isLoading,
        mfaRequired,
        mfaSessionToken,
        signIn,
        signUp,
        signOut,
        verifyMfa,
        verifyEmail,
        forgotPassword,
        resetPassword,
        refreshAuth,
        updatePlan,
        updateMfaEnabled,
        fetchUser
    };
}
_s(useAuth, "NEnkC2CGRNrDnYy1fJ2qa0RhScg=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRouter"],
        __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$auth$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAuthStore"]
    ];
});
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/hooks/use-token-refresh.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "useTokenRefresh",
    ()=>useTokenRefresh
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$auth$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/auth-store.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$silent$2d$refresh$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/silent-refresh.ts [app-client] (ecmascript)");
var _s = __turbopack_context__.k.signature();
'use client';
;
;
;
const REFRESH_INTERVAL_MS = 14 * 60 * 1000; // 14 minutes (tokens expire in 15 min)
// ── P4 (Sep 2026): bounded backoff for infrastructure failures ──────
// A 5xx/network failure during refresh is "temporarily unavailable", NOT
// "logged out". We retry with bounded exponential backoff (60s → 120s →
// 240s → 480s, capped). After MAX_CONSECUTIVE_INFRA_FAILURES the interval
// stays at the cap until the backend recovers — bounded, no infinite tight
// loop, and the user is never falsely logged out.
const INFRA_BACKOFF_STEPS_MS = [
    60_000,
    120_000,
    240_000,
    480_000
];
const MAX_CONSECUTIVE_INFRA_FAILURES = 12;
function useTokenRefresh() {
    _s();
    const { isAuthenticated, setUser, logout } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$auth$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAuthStore"])();
    const timerRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(null);
    const isRefreshing = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(false);
    const infraFailures = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(0);
    const doRefresh = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "useTokenRefresh.useCallback[doRefresh]": async (force)=>{
            // Prevent concurrent refreshes within this tab. Cross-tab concurrency
            // is serialized inside silentRefresh() via the Web Locks API —
            // without that, two tabs racing the same pre-rotation cookie caused
            // a false SESSION_REVOKED and logged the user out (RCA 2026-09-29).
            if (isRefreshing.current) return;
            isRefreshing.current = true;
            try {
                const result = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$silent$2d$refresh$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["silentRefresh"])({
                    force
                });
                if (result.ok) {
                    infraFailures.current = 0; // recovered
                    if (result.user) {
                        setUser(result.user);
                    }
                    return;
                }
                if ((0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$silent$2d$refresh$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["isAuthoritativeLogout"])(result)) {
                    // Only an AUTHORITATIVE invalid-session response logs the user
                    // out (SESSION_EXPIRED / SESSION_REVOKED / INVALID_TOKEN / ...).
                    logout();
                    return;
                }
                // 401/403 with a non-logout code, 5xx, 429, network errors →
                // infrastructure or transient failure. NEVER logout on these.
                infraFailures.current = Math.min(infraFailures.current + 1, MAX_CONSECUTIVE_INFRA_FAILURES);
            } finally{
                isRefreshing.current = false;
            }
        }
    }["useTokenRefresh.useCallback[doRefresh]"], [
        setUser,
        logout
    ]);
    // Interval refresh MUST be forced: it is the keep-alive that prevents
    // the 15-minute access token from expiring between intervals. The
    // visibility/focus refresh is throttled inside silentRefresh (skipped
    // when a refresh succeeded within the last 10 minutes) to avoid
    // pointless token rotation on every tab switch.
    const refreshTokens = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "useTokenRefresh.useCallback[refreshTokens]": ()=>doRefresh(true)
    }["useTokenRefresh.useCallback[refreshTokens]"], [
        doRefresh
    ]);
    const refreshOnFocus = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "useTokenRefresh.useCallback[refreshOnFocus]": ()=>doRefresh(false)
    }["useTokenRefresh.useCallback[refreshOnFocus]"], [
        doRefresh
    ]);
    // ── Set up interval timer (with bounded infra backoff) ─────────
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "useTokenRefresh.useEffect": ()=>{
            if (!isAuthenticated) {
                infraFailures.current = 0;
                if (timerRef.current) {
                    clearInterval(timerRef.current);
                    timerRef.current = null;
                }
                return;
            }
            const scheduleNext = {
                "useTokenRefresh.useEffect.scheduleNext": ()=>{
                    if (timerRef.current) clearInterval(timerRef.current);
                    const step = Math.min(infraFailures.current, INFRA_BACKOFF_STEPS_MS.length - 1);
                    const interval = infraFailures.current === 0 ? REFRESH_INTERVAL_MS : INFRA_BACKOFF_STEPS_MS[step];
                    timerRef.current = setInterval({
                        "useTokenRefresh.useEffect.scheduleNext": ()=>{
                            refreshTokens().then(scheduleNext);
                        }
                    }["useTokenRefresh.useEffect.scheduleNext"], interval);
                }
            }["useTokenRefresh.useEffect.scheduleNext"];
            scheduleNext();
            return ({
                "useTokenRefresh.useEffect": ()=>{
                    if (timerRef.current) {
                        clearInterval(timerRef.current);
                        timerRef.current = null;
                    }
                }
            })["useTokenRefresh.useEffect"];
        }
    }["useTokenRefresh.useEffect"], [
        isAuthenticated,
        refreshTokens
    ]);
    // ── Handle visibility change (refresh when tab becomes active) ─
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "useTokenRefresh.useEffect": ()=>{
            if (!isAuthenticated) return;
            const handleVisibilityChange = {
                "useTokenRefresh.useEffect.handleVisibilityChange": ()=>{
                    if (document.visibilityState === 'visible') {
                        refreshOnFocus();
                    }
                }
            }["useTokenRefresh.useEffect.handleVisibilityChange"];
            document.addEventListener('visibilitychange', handleVisibilityChange);
            return ({
                "useTokenRefresh.useEffect": ()=>{
                    document.removeEventListener('visibilitychange', handleVisibilityChange);
                }
            })["useTokenRefresh.useEffect"];
        }
    }["useTokenRefresh.useEffect"], [
        isAuthenticated,
        refreshOnFocus
    ]);
}
_s(useTokenRefresh, "9q+o/aqks/T7/09HD1o4jOArg9Y=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$auth$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAuthStore"]
    ];
});
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/hooks/use-subscription-sync.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "useSubscriptionSync",
    ()=>useSubscriptionSync
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$subscription$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/subscription-store.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2d$error$2d$handler$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/api-error-handler.ts [app-client] (ecmascript)");
var _s = __turbopack_context__.k.signature();
// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — useSubscriptionSync Hook
// Phase 4: Subscription System + Credits Engine + Plan Gates + Billing
//
// Syncs subscription data from the backend to the Zustand store.
// Called once when the user enters the dashboard to ensure fresh
// subscription/credits/entitlements data.
// ═══════════════════════════════════════════════════════════════════
'use client';
;
;
;
// Sync interval: 5 minutes
const SYNC_INTERVAL_MS = 5 * 60 * 1000;
function useSubscriptionSync() {
    _s();
    const syncFromBackend = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$subscription$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useSubscriptionStore"])({
        "useSubscriptionSync.useSubscriptionStore[syncFromBackend]": (s)=>s.syncFromBackend
    }["useSubscriptionSync.useSubscriptionStore[syncFromBackend]"]);
    const syncEntitlements = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$subscription$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useSubscriptionStore"])({
        "useSubscriptionSync.useSubscriptionStore[syncEntitlements]": (s)=>s.syncEntitlements
    }["useSubscriptionSync.useSubscriptionStore[syncEntitlements]"]);
    const setLoading = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$subscription$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useSubscriptionStore"])({
        "useSubscriptionSync.useSubscriptionStore[setLoading]": (s)=>s.setLoading
    }["useSubscriptionSync.useSubscriptionStore[setLoading]"]);
    const markUnavailable = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$subscription$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useSubscriptionStore"])({
        "useSubscriptionSync.useSubscriptionStore[markUnavailable]": (s)=>s.markUnavailable
    }["useSubscriptionSync.useSubscriptionStore[markUnavailable]"]);
    const lastFetchedAt = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$subscription$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useSubscriptionStore"])({
        "useSubscriptionSync.useSubscriptionStore[lastFetchedAt]": (s)=>s.lastFetchedAt
    }["useSubscriptionSync.useSubscriptionStore[lastFetchedAt]"]);
    const reset = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$subscription$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useSubscriptionStore"])({
        "useSubscriptionSync.useSubscriptionStore[reset]": (s)=>s.reset
    }["useSubscriptionSync.useSubscriptionStore[reset]"]);
    const isFetchingRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(false);
    const doSync = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "useSubscriptionSync.useCallback[doSync]": async ()=>{
            // Prevent concurrent syncs
            if (isFetchingRef.current) return;
            isFetchingRef.current = true;
            setLoading(true);
            // ── P3 (Sep 2026): failure semantics ─────────────────────────
            // 401               → genuinely unauthenticated → reset store.
            // 403/5xx/network   → infrastructure/unavailable → markUnavailable()
            //                     and KEEP the last-known-good plan. NEVER map a
            //                     backend failure to plan "free" (that falsely
            //                     stripped Pro/Elite users of their features).
            let sawInfraFailure = false;
            try {
                // Fetch subscription current status
                try {
                    const subData = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2d$error$2d$handler$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["apiCall"])('/api/subscriptions/current', {
                        credentials: 'include'
                    }, {
                        errorMessage: 'Failed to sync subscription status',
                        showToast: false
                    });
                    syncFromBackend(subData);
                } catch (error) {
                    if (error instanceof __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2d$error$2d$handler$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["ApiError"] && error.status === 401) {
                        // Not authenticated — reset store (correct: real logout state)
                        reset();
                        return;
                    }
                    sawInfraFailure = true;
                    // Other errors — log but don't block entitlements fetch
                    console.warn('[SubscriptionSync] Failed to fetch subscription status (plan state preserved):', error);
                }
                // Fetch entitlements
                try {
                    const entData = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2d$error$2d$handler$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["apiCall"])('/api/subscriptions/entitlements', {
                        credentials: 'include'
                    }, {
                        errorMessage: 'Failed to sync entitlements',
                        showToast: false
                    });
                    syncEntitlements(entData);
                } catch (error) {
                    if (error instanceof __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2d$error$2d$handler$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["ApiError"] && error.status === 401) {
                        reset();
                        return;
                    }
                    sawInfraFailure = true;
                    console.warn('[SubscriptionSync] Failed to fetch entitlements (entitlements preserved):', error);
                }
                // P3: only after BOTH fetch attempts resolved — if any failed with a
                // non-401 error, mark the store "unavailable". currentPlan keeps its
                // last-known-good value (loading/never-verified is NOT Free).
                if (sawInfraFailure) {
                    markUnavailable();
                }
            } catch (error) {
                console.error('[SubscriptionSync] Unexpected error during sync:', error);
                markUnavailable();
            } finally{
                isFetchingRef.current = false;
                setLoading(false);
            }
        }
    }["useSubscriptionSync.useCallback[doSync]"], [
        syncFromBackend,
        syncEntitlements,
        setLoading,
        markUnavailable,
        reset
    ]);
    // Initial sync on mount
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "useSubscriptionSync.useEffect": ()=>{
            doSync();
        }
    }["useSubscriptionSync.useEffect"], [
        doSync
    ]);
    // Periodic sync every 5 minutes
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "useSubscriptionSync.useEffect": ()=>{
            const interval = setInterval({
                "useSubscriptionSync.useEffect.interval": ()=>{
                    doSync();
                }
            }["useSubscriptionSync.useEffect.interval"], SYNC_INTERVAL_MS);
            return ({
                "useSubscriptionSync.useEffect": ()=>clearInterval(interval)
            })["useSubscriptionSync.useEffect"];
        }
    }["useSubscriptionSync.useEffect"], [
        doSync
    ]);
    // Re-sync on window focus (if more than 30 seconds since last fetch)
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "useSubscriptionSync.useEffect": ()=>{
            const handleFocus = {
                "useSubscriptionSync.useEffect.handleFocus": ()=>{
                    const now = Date.now();
                    if (!lastFetchedAt || now - lastFetchedAt > 30 * 1000) {
                        doSync();
                    }
                }
            }["useSubscriptionSync.useEffect.handleFocus"];
            window.addEventListener('focus', handleFocus);
            return ({
                "useSubscriptionSync.useEffect": ()=>window.removeEventListener('focus', handleFocus)
            })["useSubscriptionSync.useEffect"];
        }
    }["useSubscriptionSync.useEffect"], [
        doSync,
        lastFetchedAt
    ]);
}
_s(useSubscriptionSync, "KWvLetfP/kSN1cJezjVVeDLUGbo=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$subscription$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useSubscriptionStore"],
        __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$subscription$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useSubscriptionStore"],
        __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$subscription$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useSubscriptionStore"],
        __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$subscription$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useSubscriptionStore"],
        __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$subscription$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useSubscriptionStore"],
        __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$subscription$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useSubscriptionStore"]
    ];
});
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/hooks/use-plan-availability.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "isPlanCheckoutAvailable",
    ()=>isPlanCheckoutAvailable,
    "usePlanAvailability",
    ()=>usePlanAvailability
]);
// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — usePlanAvailability
//
// Fetches the public GET /api/payments/provider-status response and
// exposes both halves of the FINAL PAYMENT ACTIVATION ARCHITECTURE:
//
//   • planStatus — every paid plan (Starter/Pro/Elite) is IMPLEMENTED
//     and ACTIVE. The pricing surfaces must NEVER render "Coming Soon"
//     for a paid plan; a missing provider env var is a configuration
//     state, not a product availability decision.
//
//   • planAvailability — per plan/cycle provider configuration
//     booleans. Used ONLY to decide whether the plan card shows the
//     "checkout implemented — payment provider configuration required"
//     notice under an ENABLED CTA. It never disables the CTA.
//
// Server-side checkout routes remain the real enforcement point: an
// enabled CTA clicked without provider configuration reaches the
// server, which reports the missing configuration honestly (no fake
// payment path).
// ═══════════════════════════════════════════════════════════════════
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var _s = __turbopack_context__.k.signature();
'use client';
;
function usePlanAvailability() {
    _s();
    const [availability, setAvailability] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "usePlanAvailability.useEffect": ()=>{
            let cancelled = false;
            fetch('/api/payments/provider-status').then({
                "usePlanAvailability.useEffect": (r)=>r.ok ? r.json() : null
            }["usePlanAvailability.useEffect"]).then({
                "usePlanAvailability.useEffect": (data)=>{
                    if (!cancelled && data && data.planAvailability) {
                        setAvailability(data.planAvailability);
                    }
                }
            }["usePlanAvailability.useEffect"]).catch({
                "usePlanAvailability.useEffect": ()=>{
                /* availability is advisory — server-side checkout still enforces */ }
            }["usePlanAvailability.useEffect"]);
            return ({
                "usePlanAvailability.useEffect": ()=>{
                    cancelled = true;
                }
            })["usePlanAvailability.useEffect"];
        }
    }["usePlanAvailability.useEffect"], []);
    return availability;
}
_s(usePlanAvailability, "0PUW0eFbiQYqkLkSsOMWPQirR70=");
function isPlanCheckoutAvailable(availability, plan, cycle) {
    if (!availability) return null;
    const entry = availability[plan]?.[cycle];
    if (!entry) return null;
    return entry.available;
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/hooks/use-keyboard-shortcuts.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "useKeyboardShortcuts",
    ()=>useKeyboardShortcuts
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/store.ts [app-client] (ecmascript)");
var _s = __turbopack_context__.k.signature();
'use client';
;
;
const TAB_KEYS = {
    '1': 'overview',
    '2': 'leads',
    '3': 'pipeline',
    '4': 'discover',
    '5': 'outreach',
    '6': 'assistant',
    '7': 'insights',
    '8': 'deals',
    '9': 'competitors'
};
function useKeyboardShortcuts({ onShowShortcuts, onOpenCommandPalette, onNewLead }) {
    _s();
    const { setActiveTab } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAppStore"])();
    const handleKeyDown = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "useKeyboardShortcuts.useCallback[handleKeyDown]": (e)=>{
            const target = e.target;
            const tagName = target.tagName.toLowerCase();
            const isInputLike = tagName === 'input' || tagName === 'textarea' || tagName === 'select' || target.isContentEditable;
            // Ctrl+K / Cmd+K: Open Command Palette (works even in inputs)
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                onOpenCommandPalette();
                return;
            }
            // Don't process other shortcuts when in an input-like element
            if (isInputLike) return;
            // 1-8: Switch tabs
            if (TAB_KEYS[e.key]) {
                e.preventDefault();
                setActiveTab(TAB_KEYS[e.key]);
                return;
            }
            // N: Create new lead
            if (e.key === 'n' || e.key === 'N') {
                e.preventDefault();
                onNewLead?.();
                return;
            }
            // ?: Show shortcuts help
            if (e.key === '?' || e.shiftKey && e.key === '/') {
                e.preventDefault();
                onShowShortcuts();
                return;
            }
        }
    }["useKeyboardShortcuts.useCallback[handleKeyDown]"], [
        setActiveTab,
        onShowShortcuts,
        onOpenCommandPalette,
        onNewLead
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "useKeyboardShortcuts.useEffect": ()=>{
            document.addEventListener('keydown', handleKeyDown);
            return ({
                "useKeyboardShortcuts.useEffect": ()=>document.removeEventListener('keydown', handleKeyDown)
            })["useKeyboardShortcuts.useEffect"];
        }
    }["useKeyboardShortcuts.useEffect"], [
        handleKeyDown
    ]);
}
_s(useKeyboardShortcuts, "at8sYY283ebQM8h53Aarq4A5BXc=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAppStore"]
    ];
});
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/hooks/use-payment-redirect.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "usePaymentRedirect",
    ()=>usePaymentRedirect
]);
// ═════════════════════════════════════════════════════════════════════
// usePaymentRedirect — handles the Stripe redirect back to /dashboard.
//
// PART 5 of SUBSCRIPTION-PAYMENT-FIX-20260909:
//   Stripe success_url → /dashboard?payment=success&session_id={CHECKOUT_SESSION_ID}
//   Stripe cancel_url  → /dashboard?payment=cancelled
//   Credit add-on success_url → /dashboard?credits_added=true&session_id=...
//
// On mount this hook:
//   1. Reads payment=success | payment=cancelled | credits_added=true
//      (+ session_id) from the URL.
//   2. For success flows, calls POST /api/payments/verify-session with
//      { sessionId }. The server retrieves the session from Stripe and —
//      when payment_status === 'paid' — atomically activates the plan
//      (confirmPaymentAndActivate) or fulfills the credit add-on
//      (fulfillCreditAddon). This covers the case where the Stripe
//      webhook hasn't arrived yet.
//   3. Re-syncs the local subscription store from /api/subscriptions/current.
//   4. Shows the success toast:
//        - Subscription: "Welcome to [Plan Name]! Your plan is now active."
//        - Credit add-on: "N credits added to your account"
//   5. Cleans the URL (history.replaceState) so refreshes don't re-trigger.
// ═════════════════════════════════════════════════════════════════════
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$sonner$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/sonner/dist/index.mjs [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$subscription$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/subscription-store.ts [app-client] (ecmascript)");
var _s = __turbopack_context__.k.signature();
'use client';
;
;
;
function usePaymentRedirect() {
    _s();
    const syncFromBackend = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$subscription$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useSubscriptionStore"])({
        "usePaymentRedirect.useSubscriptionStore[syncFromBackend]": (s)=>s.syncFromBackend
    }["usePaymentRedirect.useSubscriptionStore[syncFromBackend]"]);
    // Guard against double-invocation (React 18 StrictMode runs effects twice
    // in dev — without the ref we'd fire the verify call twice).
    const handledRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(false);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "usePaymentRedirect.useEffect": ()=>{
            if (handledRef.current) return;
            if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
            ;
            const params = new URLSearchParams(window.location.search);
            const payment = params.get('payment');
            const creditsAdded = params.get('credits_added');
            const sessionId = params.get('session_id');
            if (!payment && creditsAdded !== 'true') return;
            handledRef.current = true;
            const cleanUrl = {
                "usePaymentRedirect.useEffect.cleanUrl": ()=>{
                    window.history.replaceState({}, '', window.location.pathname);
                }
            }["usePaymentRedirect.useEffect.cleanUrl"];
            const run = {
                "usePaymentRedirect.useEffect.run": async ()=>{
                    // ── Cancelled on Stripe ──
                    if (payment === 'cancelled') {
                        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$sonner$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toast"].info('Payment cancelled — you were not charged.');
                        cleanUrl();
                        return;
                    }
                    // ── Success (subscription or credit add-on) ──
                    const isCredits = creditsAdded === 'true';
                    let verified = false;
                    let planName = null;
                    let creditsGranted = 0;
                    if (sessionId) {
                        try {
                            const res = await fetch('/api/payments/verify-session', {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json'
                                },
                                credentials: 'include',
                                body: JSON.stringify({
                                    sessionId
                                })
                            });
                            if (res.ok) {
                                const data = await res.json();
                                verified = data.paid === true;
                                planName = data.plan || null;
                                creditsGranted = typeof data.credits === 'number' ? data.credits : 0;
                            }
                        } catch  {
                        // Network failure — fall through to sync-only + generic message.
                        // The Stripe webhook remains the authoritative activator.
                        }
                    }
                    // Re-sync the subscription store so the UI reflects the new plan /
                    // credit balance immediately.
                    try {
                        const subRes = await fetch('/api/subscriptions/current', {
                            credentials: 'include'
                        });
                        if (subRes.ok) {
                            syncFromBackend(await subRes.json());
                        }
                    } catch  {
                    // Ignore — the 60s credit poll and 5-min subscription sync will
                    // pick up the change.
                    }
                    if (verified) {
                        if (isCredits) {
                            __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$sonner$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toast"].success(creditsGranted > 0 ? `${creditsGranted.toLocaleString()} credits added to your account` : 'Credits added to your account');
                        } else {
                            const display = planName === 'pro' ? 'Pro' : planName === 'elite' ? 'Elite' : planName ? planName.charAt(0).toUpperCase() + planName.slice(1) : 'your new plan';
                            __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$sonner$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toast"].success(`Welcome to ${display}! Your plan is now active.`);
                        }
                    } else {
                        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$sonner$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toast"].info('Payment received. Your plan will update automatically within a minute.');
                    }
                    cleanUrl();
                }
            }["usePaymentRedirect.useEffect.run"];
            void run();
        }
    }["usePaymentRedirect.useEffect"], [
        syncFromBackend
    ]);
}
_s(usePaymentRedirect, "wr8SYsD+VPmn3S9tAPPXs6E75TE=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$subscription$2d$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useSubscriptionStore"]
    ];
});
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/app/page.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>Home
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$dashboard$2f$auth$2d$gate$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/dashboard/auth-gate.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$providers$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/providers.tsx [app-client] (ecmascript)");
'use client';
;
;
;
function Home() {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$providers$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Providers"], {
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$dashboard$2f$auth$2d$gate$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {}, void 0, false, {
            fileName: "[project]/src/app/page.tsx",
            lineNumber: 9,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/src/app/page.tsx",
        lineNumber: 8,
        columnNumber: 5
    }, this);
}
_c = Home;
var _c;
__turbopack_context__.k.register(_c, "Home");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
]);

//# sourceMappingURL=src_311bdf57._.js.map