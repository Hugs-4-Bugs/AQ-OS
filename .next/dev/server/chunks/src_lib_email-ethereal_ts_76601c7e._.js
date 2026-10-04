module.exports = [
"[project]/src/lib/email-ethereal.ts [instrumentation] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Email & Auth Credential Helpers
 *
 * ALL Ethereal / preview-email code has been REMOVED.
 * The email service now ONLY uses real providers:
 *   1. Resend (if a real API key is configured)
 *   2. Nodemailer SMTP (Gmail SMTP via SMTP_USER / SMTP_PASSWORD)
 *
 * If neither is configured, sendEmail() throws a clear error.
 * There is ZERO fallback to any preview / test inbox.
 *
 * Env vars (read from Secrets panel):
 *   SMTP_HOST       = smtp.gmail.com
 *   SMTP_PORT       = 587
 *   SMTP_USER       = <real Gmail address>
 *   SMTP_PASSWORD   = <16-char Gmail App Password>
 *   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
 */ /**
 * Check whether REAL Resend is configured (non-placeholder API key).
 */ __turbopack_context__.s([
    "getGoogleClientId",
    ()=>getGoogleClientId,
    "getGoogleClientSecret",
    ()=>getGoogleClientSecret,
    "getSmtpFrom",
    ()=>getSmtpFrom,
    "getSmtpHost",
    ()=>getSmtpHost,
    "getSmtpPassword",
    ()=>getSmtpPassword,
    "getSmtpPort",
    ()=>getSmtpPort,
    "getSmtpUser",
    ()=>getSmtpUser,
    "isEmailProviderAvailable",
    ()=>isEmailProviderAvailable,
    "isEtherealMode",
    ()=>isEtherealMode,
    "isRealGoogleConfigured",
    ()=>isRealGoogleConfigured,
    "isRealResendConfigured",
    ()=>isRealResendConfigured,
    "isRealSmtpConfigured",
    ()=>isRealSmtpConfigured,
    "logSmtpEnvAliases",
    ()=>logSmtpEnvAliases
]);
function isRealResendConfigured() {
    const key = process.env.RESEND_API_KEY;
    return !!key && !key.startsWith('re_your-');
}
function getSmtpUser() {
    return process.env.SMTP_USER || process.env.SMTP_USERNAME || process.env.GMAIL_USER || process.env.EMAIL_USER || process.env.EMAIL_USERNAME || process.env.MAIL_USER || process.env.MAIL_USERNAME;
}
function getSmtpPassword() {
    return process.env.SMTP_PASSWORD || process.env.SMTP_PASS || process.env.SMTP_AUTH_PASSWORD || process.env.GMAIL_APP_PASSWORD || process.env.GMAIL_PASSWORD || process.env.EMAIL_PASSWORD || process.env.EMAIL_PASS || process.env.MAIL_PASSWORD || process.env.MAIL_PASS;
}
function logSmtpEnvAliases() {
    const userAliases = [
        'SMTP_USER',
        'SMTP_USERNAME',
        'GMAIL_USER',
        'EMAIL_USER',
        'EMAIL_USERNAME',
        'MAIL_USER',
        'MAIL_USERNAME'
    ];
    const passAliases = [
        'SMTP_PASSWORD',
        'SMTP_PASS',
        'SMTP_AUTH_PASSWORD',
        'GMAIL_APP_PASSWORD',
        'GMAIL_PASSWORD',
        'EMAIL_PASSWORD',
        'EMAIL_PASS',
        'MAIL_PASSWORD',
        'MAIL_PASS'
    ];
    const hostAliases = [
        'SMTP_HOST',
        'MAIL_HOST',
        'EMAIL_HOST'
    ];
    const portAliases = [
        'SMTP_PORT',
        'MAIL_PORT',
        'EMAIL_PORT'
    ];
    const fromAliases = [
        'SMTP_FROM',
        'EMAIL_FROM',
        'MAIL_FROM',
        'MAIL_FROM_ADDRESS'
    ];
    const summarize = (keys)=>keys.map((k)=>`${k}=${process.env[k] ? 'SET' : 'MISSING'}`).join(', ');
    console.log('[SMTP-Env-Diag] user    : ' + summarize(userAliases));
    console.log('[SMTP-Env-Diag] pass    : ' + summarize(passAliases));
    console.log('[SMTP-Env-Diag] host    : ' + summarize(hostAliases));
    console.log('[SMTP-Env-Diag] port    : ' + summarize(portAliases));
    console.log('[SMTP-Env-Diag] from    : ' + summarize(fromAliases));
    console.log('[SMTP-Env-Diag] resend  : RESEND_API_KEY=' + (process.env.RESEND_API_KEY ? 'SET' : 'MISSING'));
    console.log('[SMTP-Env-Diag] resolved: user=' + (getSmtpUser() ? 'SET' : 'MISSING') + ', pass=' + (getSmtpPassword() ? 'SET' : 'MISSING') + ', configured=' + (isRealSmtpConfigured() ? 'YES' : 'NO'));
}
/**
 * Detect placeholder credential values (e.g. "your-email@gmail.com",
 * "your-app-password", "placeholder", empty string).
 *
 * NOTE: We do NOT reject passwords starting with "test-" or "test_" because
 * real Gmail App Passwords are random lowercase letters and could theoretically
 * start with those characters. If the password is wrong, SMTP will return a
 * 535 auth error which is surfaced to the user as a clear delivery failure.
 */ function isPlaceholderValue(value) {
    if (!value) return true;
    if (value.startsWith('your-')) return true;
    if (value === 'placeholder') return true;
    if (value === 'test') return true;
    if (value.includes('example')) return true;
    if (value === 'password') return true;
    return false;
}
function getSmtpHost() {
    return process.env.SMTP_HOST || process.env.MAIL_HOST || process.env.EMAIL_HOST;
}
function getSmtpPort() {
    const raw = process.env.SMTP_PORT || process.env.MAIL_PORT || process.env.EMAIL_PORT;
    return Number(raw) || 587;
}
function getSmtpFrom() {
    return process.env.SMTP_FROM || process.env.EMAIL_FROM || process.env.MAIL_FROM || process.env.MAIL_FROM_ADDRESS || process.env.FROM_EMAIL;
}
function isRealSmtpConfigured() {
    const host = getSmtpHost();
    const port = getSmtpPort();
    const user = getSmtpUser();
    const pass = getSmtpPassword();
    return !!(host && port && user && !isPlaceholderValue(user) && pass && !isPlaceholderValue(pass));
}
function getGoogleClientId() {
    return process.env.GOOGLE_CLIENT_ID;
}
function getGoogleClientSecret() {
    return process.env.GOOGLE_CLIENT_SECRET;
}
function isRealGoogleConfigured() {
    const clientId = getGoogleClientId();
    const clientSecret = getGoogleClientSecret();
    if (!clientId || !clientSecret) return false;
    if (isPlaceholderValue(clientId)) return false;
    if (isPlaceholderValue(clientSecret)) return false;
    if (!clientId.includes('.apps.googleusercontent.com')) return false;
    return true;
}
// Backward-compatible aliases
const hasRealResend = isRealResendConfigured;
const hasRealSmtp = isRealSmtpConfigured;
function isEtherealMode() {
    return false;
}
function isEmailProviderAvailable() {
    return hasRealResend() || hasRealSmtp();
}
}),
];

//# sourceMappingURL=src_lib_email-ethereal_ts_76601c7e._.js.map