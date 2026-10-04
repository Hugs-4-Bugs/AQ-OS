module.exports = [
"[project]/src/hooks/use-auth.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "useAuth",
    ()=>useAuth
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$auth$2d$store$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/auth-store.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$subscription$2d$store$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/subscription-store.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/navigation.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2d$error$2d$handler$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/api-error-handler.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$cache$2d$invalidation$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/cache-invalidation.ts [app-ssr] (ecmascript)");
// AcquisitionOS — Authentication Hook
'use client';
;
;
;
;
;
;
function useAuth() {
    const router = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRouter"])();
    const { user, isAuthenticated, isLoading, mfaRequired, mfaSessionToken, setUser, setLoading, setMfaRequired, logout, updatePlan, updateEmailVerified, updateMfaEnabled } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$auth$2d$store$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useAuthStore"])();
    // Fetch current user on mount
    // ── P11 (Sep 2026): infrastructure failures are NOT anonymous ──
    // 401 → genuinely unauthenticated → setUser(null).
    // 5xx / network / 503 → backend temporarily unavailable → KEEP the
    // current user (if any). Converting a 503 into setUser(null) silently
    // logged users out during every transient backend failure.
    const fetchUser = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])(async ()=>{
        try {
            const data = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2d$error$2d$handler$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["apiCall"])('/api/auth/me', {
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
    }, [
        setUser
    ]);
    // Sign in with email and password
    //
    // NOTE: We intentionally do NOT toggle the global `setLoading` here (same
    // rationale as signUp below). AuthGate renders a full-screen LoadingScreen
    // while `isLoading` is true, which UNMOUNTS SignInPage and destroys its
    // local state — the inline error alert and filled fields would be lost on
    // remount. SignInPage tracks its own `isSubmitting` for the button spinner.
    const signIn = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])(async (email, password, rememberMe)=>{
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
    }, [
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
    const signUp = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])(async (params)=>{
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
    }, [
        setUser
    ]);
    // Verify MFA TOTP code
    const verifyMfa = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])(async (code, rememberMe)=>{
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
    }, [
        mfaSessionToken,
        setUser
    ]);
    // Verify email with OTP
    const verifyEmail = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])(async (email, otp)=>{
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
    }, [
        updateEmailVerified
    ]);
    // Request password reset
    const forgotPassword = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])(async (email)=>{
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
    }, []);
    // Reset password with OTP
    const resetPassword = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])(async (params)=>{
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
    }, []);
    // Sign out
    const signOut = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])(async ()=>{
        try {
            await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2d$error$2d$handler$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["apiCall"])('/api/auth/signout', {
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
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$cache$2d$invalidation$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["clearAccountScopedClientState"])();
        window.dispatchEvent(new Event('aqos:auth-logout')); // React Query clear (providers.tsx)
        logout();
        __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$subscription$2d$store$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useSubscriptionStore"].getState().reset(); // Reset subscription store
        router.push('/');
    }, [
        logout,
        router
    ]);
    // Refresh auth state
    const refreshAuth = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])(async ()=>{
        setLoading(true);
        await fetchUser();
    }, [
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
}),
"[project]/src/hooks/use-token-refresh.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "useTokenRefresh",
    ()=>useTokenRefresh
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$auth$2d$store$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/auth-store.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$silent$2d$refresh$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/silent-refresh.ts [app-ssr] (ecmascript)");
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
    const { isAuthenticated, setUser, logout } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$auth$2d$store$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useAuthStore"])();
    const timerRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    const isRefreshing = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(false);
    const infraFailures = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(0);
    const doRefresh = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])(async (force)=>{
        // Prevent concurrent refreshes within this tab. Cross-tab concurrency
        // is serialized inside silentRefresh() via the Web Locks API —
        // without that, two tabs racing the same pre-rotation cookie caused
        // a false SESSION_REVOKED and logged the user out (RCA 2026-09-29).
        if (isRefreshing.current) return;
        isRefreshing.current = true;
        try {
            const result = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$silent$2d$refresh$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["silentRefresh"])({
                force
            });
            if (result.ok) {
                infraFailures.current = 0; // recovered
                if (result.user) {
                    setUser(result.user);
                }
                return;
            }
            if ((0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$silent$2d$refresh$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["isAuthoritativeLogout"])(result)) {
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
    }, [
        setUser,
        logout
    ]);
    // Interval refresh MUST be forced: it is the keep-alive that prevents
    // the 15-minute access token from expiring between intervals. The
    // visibility/focus refresh is throttled inside silentRefresh (skipped
    // when a refresh succeeded within the last 10 minutes) to avoid
    // pointless token rotation on every tab switch.
    const refreshTokens = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])(()=>doRefresh(true), [
        doRefresh
    ]);
    const refreshOnFocus = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])(()=>doRefresh(false), [
        doRefresh
    ]);
    // ── Set up interval timer (with bounded infra backoff) ─────────
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (!isAuthenticated) {
            infraFailures.current = 0;
            if (timerRef.current) {
                clearInterval(timerRef.current);
                timerRef.current = null;
            }
            return;
        }
        const scheduleNext = ()=>{
            if (timerRef.current) clearInterval(timerRef.current);
            const step = Math.min(infraFailures.current, INFRA_BACKOFF_STEPS_MS.length - 1);
            const interval = infraFailures.current === 0 ? REFRESH_INTERVAL_MS : INFRA_BACKOFF_STEPS_MS[step];
            timerRef.current = setInterval(()=>{
                refreshTokens().then(scheduleNext);
            }, interval);
        };
        scheduleNext();
        return ()=>{
            if (timerRef.current) {
                clearInterval(timerRef.current);
                timerRef.current = null;
            }
        };
    }, [
        isAuthenticated,
        refreshTokens
    ]);
    // ── Handle visibility change (refresh when tab becomes active) ─
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (!isAuthenticated) return;
        const handleVisibilityChange = ()=>{
            if (document.visibilityState === 'visible') {
                refreshOnFocus();
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return ()=>{
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [
        isAuthenticated,
        refreshOnFocus
    ]);
}
}),
"[project]/src/hooks/use-subscription-sync.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "useSubscriptionSync",
    ()=>useSubscriptionSync
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$subscription$2d$store$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/subscription-store.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2d$error$2d$handler$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/api-error-handler.ts [app-ssr] (ecmascript)");
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
    const syncFromBackend = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$subscription$2d$store$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useSubscriptionStore"])((s)=>s.syncFromBackend);
    const syncEntitlements = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$subscription$2d$store$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useSubscriptionStore"])((s)=>s.syncEntitlements);
    const setLoading = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$subscription$2d$store$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useSubscriptionStore"])((s)=>s.setLoading);
    const markUnavailable = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$subscription$2d$store$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useSubscriptionStore"])((s)=>s.markUnavailable);
    const lastFetchedAt = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$subscription$2d$store$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useSubscriptionStore"])((s)=>s.lastFetchedAt);
    const reset = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$subscription$2d$store$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useSubscriptionStore"])((s)=>s.reset);
    const isFetchingRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(false);
    const doSync = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])(async ()=>{
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
                const subData = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2d$error$2d$handler$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["apiCall"])('/api/subscriptions/current', {
                    credentials: 'include'
                }, {
                    errorMessage: 'Failed to sync subscription status',
                    showToast: false
                });
                syncFromBackend(subData);
            } catch (error) {
                if (error instanceof __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2d$error$2d$handler$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ApiError"] && error.status === 401) {
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
                const entData = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2d$error$2d$handler$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["apiCall"])('/api/subscriptions/entitlements', {
                    credentials: 'include'
                }, {
                    errorMessage: 'Failed to sync entitlements',
                    showToast: false
                });
                syncEntitlements(entData);
            } catch (error) {
                if (error instanceof __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2d$error$2d$handler$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ApiError"] && error.status === 401) {
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
    }, [
        syncFromBackend,
        syncEntitlements,
        setLoading,
        markUnavailable,
        reset
    ]);
    // Initial sync on mount
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        doSync();
    }, [
        doSync
    ]);
    // Periodic sync every 5 minutes
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        const interval = setInterval(()=>{
            doSync();
        }, SYNC_INTERVAL_MS);
        return ()=>clearInterval(interval);
    }, [
        doSync
    ]);
    // Re-sync on window focus (if more than 30 seconds since last fetch)
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        const handleFocus = ()=>{
            const now = Date.now();
            if (!lastFetchedAt || now - lastFetchedAt > 30 * 1000) {
                doSync();
            }
        };
        window.addEventListener('focus', handleFocus);
        return ()=>window.removeEventListener('focus', handleFocus);
    }, [
        doSync,
        lastFetchedAt
    ]);
}
}),
"[project]/src/hooks/use-plan-availability.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
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
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
'use client';
;
function usePlanAvailability() {
    const [availability, setAvailability] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        let cancelled = false;
        fetch('/api/payments/provider-status').then((r)=>r.ok ? r.json() : null).then((data)=>{
            if (!cancelled && data && data.planAvailability) {
                setAvailability(data.planAvailability);
            }
        }).catch(()=>{
        /* availability is advisory — server-side checkout still enforces */ });
        return ()=>{
            cancelled = true;
        };
    }, []);
    return availability;
}
function isPlanCheckoutAvailable(availability, plan, cycle) {
    if (!availability) return null;
    const entry = availability[plan]?.[cycle];
    if (!entry) return null;
    return entry.available;
}
}),
"[project]/src/hooks/use-keyboard-shortcuts.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "useKeyboardShortcuts",
    ()=>useKeyboardShortcuts
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$store$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/store.ts [app-ssr] (ecmascript)");
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
    const { setActiveTab } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$store$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useAppStore"])();
    const handleKeyDown = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])((e)=>{
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
    }, [
        setActiveTab,
        onShowShortcuts,
        onOpenCommandPalette,
        onNewLead
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        document.addEventListener('keydown', handleKeyDown);
        return ()=>document.removeEventListener('keydown', handleKeyDown);
    }, [
        handleKeyDown
    ]);
}
}),
"[project]/src/hooks/use-payment-redirect.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
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
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$sonner$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/sonner/dist/index.mjs [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$subscription$2d$store$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/subscription-store.ts [app-ssr] (ecmascript)");
'use client';
;
;
;
function usePaymentRedirect() {
    const syncFromBackend = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$subscription$2d$store$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useSubscriptionStore"])((s)=>s.syncFromBackend);
    // Guard against double-invocation (React 18 StrictMode runs effects twice
    // in dev — without the ref we'd fire the verify call twice).
    const handledRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(false);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (handledRef.current) return;
        if ("TURBOPACK compile-time truthy", 1) return;
        //TURBOPACK unreachable
        ;
        const params = undefined;
        const payment = undefined;
        const creditsAdded = undefined;
        const sessionId = undefined;
        const cleanUrl = undefined;
        const run = undefined;
    }, [
        syncFromBackend
    ]);
}
}),
"[project]/src/app/page.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>Home
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$dashboard$2f$auth$2d$gate$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/dashboard/auth-gate.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$providers$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/providers.tsx [app-ssr] (ecmascript)");
'use client';
;
;
;
function Home() {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$providers$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Providers"], {
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$dashboard$2f$auth$2d$gate$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {}, void 0, false, {
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
}),
];

//# sourceMappingURL=src_4ec38932._.js.map