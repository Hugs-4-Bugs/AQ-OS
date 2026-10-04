(globalThis.TURBOPACK || (globalThis.TURBOPACK = [])).push([typeof document === "object" ? document.currentScript : undefined,
"[project]/src/components/ui/alert-dialog.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "AlertDialog",
    ()=>AlertDialog,
    "AlertDialogAction",
    ()=>AlertDialogAction,
    "AlertDialogCancel",
    ()=>AlertDialogCancel,
    "AlertDialogContent",
    ()=>AlertDialogContent,
    "AlertDialogDescription",
    ()=>AlertDialogDescription,
    "AlertDialogFooter",
    ()=>AlertDialogFooter,
    "AlertDialogHeader",
    ()=>AlertDialogHeader,
    "AlertDialogOverlay",
    ()=>AlertDialogOverlay,
    "AlertDialogPortal",
    ()=>AlertDialogPortal,
    "AlertDialogTitle",
    ()=>AlertDialogTitle,
    "AlertDialogTrigger",
    ()=>AlertDialogTrigger
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$alert$2d$dialog$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/@radix-ui/react-alert-dialog/dist/index.mjs [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/utils.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$button$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/ui/button.tsx [app-client] (ecmascript)");
"use client";
;
;
;
;
function AlertDialog({ ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$alert$2d$dialog$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Root"], {
        "data-slot": "alert-dialog",
        ...props
    }, void 0, false, {
        fileName: "[project]/src/components/ui/alert-dialog.tsx",
        lineNumber: 12,
        columnNumber: 10
    }, this);
}
_c = AlertDialog;
function AlertDialogTrigger({ ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$alert$2d$dialog$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Trigger"], {
        "data-slot": "alert-dialog-trigger",
        ...props
    }, void 0, false, {
        fileName: "[project]/src/components/ui/alert-dialog.tsx",
        lineNumber: 19,
        columnNumber: 5
    }, this);
}
_c1 = AlertDialogTrigger;
function AlertDialogPortal({ ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$alert$2d$dialog$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Portal"], {
        "data-slot": "alert-dialog-portal",
        ...props
    }, void 0, false, {
        fileName: "[project]/src/components/ui/alert-dialog.tsx",
        lineNumber: 27,
        columnNumber: 5
    }, this);
}
_c2 = AlertDialogPortal;
function AlertDialogOverlay({ className, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$alert$2d$dialog$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Overlay"], {
        "data-slot": "alert-dialog-overlay",
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/src/components/ui/alert-dialog.tsx",
        lineNumber: 36,
        columnNumber: 5
    }, this);
}
_c3 = AlertDialogOverlay;
function AlertDialogContent({ className, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(AlertDialogPortal, {
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(AlertDialogOverlay, {}, void 0, false, {
                fileName: "[project]/src/components/ui/alert-dialog.tsx",
                lineNumber: 53,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$alert$2d$dialog$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Content"], {
                "data-slot": "alert-dialog-content",
                className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg duration-200 sm:max-w-lg", className),
                ...props
            }, void 0, false, {
                fileName: "[project]/src/components/ui/alert-dialog.tsx",
                lineNumber: 54,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/components/ui/alert-dialog.tsx",
        lineNumber: 52,
        columnNumber: 5
    }, this);
}
_c4 = AlertDialogContent;
function AlertDialogHeader({ className, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        "data-slot": "alert-dialog-header",
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("flex flex-col gap-2 text-center sm:text-left", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/src/components/ui/alert-dialog.tsx",
        lineNumber: 71,
        columnNumber: 5
    }, this);
}
_c5 = AlertDialogHeader;
function AlertDialogFooter({ className, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        "data-slot": "alert-dialog-footer",
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/src/components/ui/alert-dialog.tsx",
        lineNumber: 84,
        columnNumber: 5
    }, this);
}
_c6 = AlertDialogFooter;
function AlertDialogTitle({ className, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$alert$2d$dialog$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Title"], {
        "data-slot": "alert-dialog-title",
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("text-lg font-semibold", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/src/components/ui/alert-dialog.tsx",
        lineNumber: 100,
        columnNumber: 5
    }, this);
}
_c7 = AlertDialogTitle;
function AlertDialogDescription({ className, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$alert$2d$dialog$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Description"], {
        "data-slot": "alert-dialog-description",
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])("text-muted-foreground text-sm", className),
        ...props
    }, void 0, false, {
        fileName: "[project]/src/components/ui/alert-dialog.tsx",
        lineNumber: 113,
        columnNumber: 5
    }, this);
}
_c8 = AlertDialogDescription;
function AlertDialogAction({ className, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$alert$2d$dialog$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Action"], {
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])((0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$button$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["buttonVariants"])(), className),
        ...props
    }, void 0, false, {
        fileName: "[project]/src/components/ui/alert-dialog.tsx",
        lineNumber: 126,
        columnNumber: 5
    }, this);
}
_c9 = AlertDialogAction;
function AlertDialogCancel({ className, ...props }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$radix$2d$ui$2f$react$2d$alert$2d$dialog$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Cancel"], {
        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])((0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$button$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["buttonVariants"])({
            variant: "outline"
        }), className),
        ...props
    }, void 0, false, {
        fileName: "[project]/src/components/ui/alert-dialog.tsx",
        lineNumber: 138,
        columnNumber: 5
    }, this);
}
_c10 = AlertDialogCancel;
;
var _c, _c1, _c2, _c3, _c4, _c5, _c6, _c7, _c8, _c9, _c10;
__turbopack_context__.k.register(_c, "AlertDialog");
__turbopack_context__.k.register(_c1, "AlertDialogTrigger");
__turbopack_context__.k.register(_c2, "AlertDialogPortal");
__turbopack_context__.k.register(_c3, "AlertDialogOverlay");
__turbopack_context__.k.register(_c4, "AlertDialogContent");
__turbopack_context__.k.register(_c5, "AlertDialogHeader");
__turbopack_context__.k.register(_c6, "AlertDialogFooter");
__turbopack_context__.k.register(_c7, "AlertDialogTitle");
__turbopack_context__.k.register(_c8, "AlertDialogDescription");
__turbopack_context__.k.register(_c9, "AlertDialogAction");
__turbopack_context__.k.register(_c10, "AlertDialogCancel");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/lib/countries.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Worldwide Country Dataset (ISO 3166-1)
//
// Complete, maintained country dataset for worldwide lead discovery:
//   - ISO 3166-1 alpha-2 code + common English name for every country
//   - Common alias resolution (USA → United States, UK → United Kingdom …)
//   - Canonical normalization so discovery, persistence, and filters all
//     use ONE canonical name (spec §5: "Normalize country names and codes
//     consistently", "Handle alternate spellings and common aliases")
//
// No network calls, no external dependency — a static snapshot of the
// ISO 3166-1 standard (249 officially assigned codes).
// ═══════════════════════════════════════════════════════════════════
__turbopack_context__.s([
    "COUNTRIES",
    ()=>COUNTRIES,
    "aliasesFor",
    ()=>aliasesFor,
    "countryCodeFor",
    ()=>countryCodeFor,
    "extractCountryFromLocation",
    ()=>extractCountryFromLocation,
    "normalizeCountryName",
    ()=>normalizeCountryName,
    "searchCountries",
    ()=>searchCountries
]);
// [alpha-2, canonical name] — ISO 3166-1 officially assigned codes.
const RAW_COUNTRIES = [
    [
        'AD',
        'Andorra'
    ],
    [
        'AE',
        'United Arab Emirates'
    ],
    [
        'AF',
        'Afghanistan'
    ],
    [
        'AG',
        'Antigua and Barbuda'
    ],
    [
        'AI',
        'Anguilla'
    ],
    [
        'AL',
        'Albania'
    ],
    [
        'AM',
        'Armenia'
    ],
    [
        'AO',
        'Angola'
    ],
    [
        'AQ',
        'Antarctica'
    ],
    [
        'AR',
        'Argentina'
    ],
    [
        'AS',
        'American Samoa'
    ],
    [
        'AT',
        'Austria'
    ],
    [
        'AU',
        'Australia'
    ],
    [
        'AW',
        'Aruba'
    ],
    [
        'AX',
        'Åland Islands'
    ],
    [
        'AZ',
        'Azerbaijan'
    ],
    [
        'BA',
        'Bosnia and Herzegovina'
    ],
    [
        'BB',
        'Barbados'
    ],
    [
        'BD',
        'Bangladesh'
    ],
    [
        'BE',
        'Belgium'
    ],
    [
        'BF',
        'Burkina Faso'
    ],
    [
        'BG',
        'Bulgaria'
    ],
    [
        'BH',
        'Bahrain'
    ],
    [
        'BI',
        'Burundi'
    ],
    [
        'BJ',
        'Benin'
    ],
    [
        'BL',
        'Saint Barthélemy'
    ],
    [
        'BM',
        'Bermuda'
    ],
    [
        'BN',
        'Brunei Darussalam'
    ],
    [
        'BO',
        'Bolivia'
    ],
    [
        'BQ',
        'Bonaire, Sint Eustatius and Saba'
    ],
    [
        'BR',
        'Brazil'
    ],
    [
        'BS',
        'Bahamas'
    ],
    [
        'BT',
        'Bhutan'
    ],
    [
        'BV',
        'Bouvet Island'
    ],
    [
        'BW',
        'Botswana'
    ],
    [
        'BY',
        'Belarus'
    ],
    [
        'BZ',
        'Belize'
    ],
    [
        'CA',
        'Canada'
    ],
    [
        'CC',
        'Cocos (Keeling) Islands'
    ],
    [
        'CD',
        'Congo, Democratic Republic of the'
    ],
    [
        'CF',
        'Central African Republic'
    ],
    [
        'CG',
        'Congo'
    ],
    [
        'CH',
        'Switzerland'
    ],
    [
        'CI',
        "Côte d'Ivoire"
    ],
    [
        'CK',
        'Cook Islands'
    ],
    [
        'CL',
        'Chile'
    ],
    [
        'CM',
        'Cameroon'
    ],
    [
        'CN',
        'China'
    ],
    [
        'CO',
        'Colombia'
    ],
    [
        'CR',
        'Costa Rica'
    ],
    [
        'CU',
        'Cuba'
    ],
    [
        'CV',
        'Cabo Verde'
    ],
    [
        'CW',
        'Curaçao'
    ],
    [
        'CX',
        'Christmas Island'
    ],
    [
        'CY',
        'Cyprus'
    ],
    [
        'CZ',
        'Czechia'
    ],
    [
        'DE',
        'Germany'
    ],
    [
        'DJ',
        'Djibouti'
    ],
    [
        'DK',
        'Denmark'
    ],
    [
        'DM',
        'Dominica'
    ],
    [
        'DO',
        'Dominican Republic'
    ],
    [
        'DZ',
        'Algeria'
    ],
    [
        'EC',
        'Ecuador'
    ],
    [
        'EE',
        'Estonia'
    ],
    [
        'EG',
        'Egypt'
    ],
    [
        'EH',
        'Western Sahara'
    ],
    [
        'ER',
        'Eritrea'
    ],
    [
        'ES',
        'Spain'
    ],
    [
        'ET',
        'Ethiopia'
    ],
    [
        'FI',
        'Finland'
    ],
    [
        'FJ',
        'Fiji'
    ],
    [
        'FK',
        'Falkland Islands (Malvinas)'
    ],
    [
        'FM',
        'Micronesia'
    ],
    [
        'FO',
        'Faroe Islands'
    ],
    [
        'FR',
        'France'
    ],
    [
        'GA',
        'Gabon'
    ],
    [
        'GB',
        'United Kingdom'
    ],
    [
        'GD',
        'Grenada'
    ],
    [
        'GE',
        'Georgia'
    ],
    [
        'GF',
        'French Guiana'
    ],
    [
        'GG',
        'Guernsey'
    ],
    [
        'GH',
        'Ghana'
    ],
    [
        'GI',
        'Gibraltar'
    ],
    [
        'GL',
        'Greenland'
    ],
    [
        'GM',
        'Gambia'
    ],
    [
        'GN',
        'Guinea'
    ],
    [
        'GP',
        'Guadeloupe'
    ],
    [
        'GQ',
        'Equatorial Guinea'
    ],
    [
        'GR',
        'Greece'
    ],
    [
        'GS',
        'South Georgia and the South Sandwich Islands'
    ],
    [
        'GT',
        'Guatemala'
    ],
    [
        'GU',
        'Guam'
    ],
    [
        'GW',
        'Guinea-Bissau'
    ],
    [
        'GY',
        'Guyana'
    ],
    [
        'HK',
        'Hong Kong'
    ],
    [
        'HM',
        'Heard Island and McDonald Islands'
    ],
    [
        'HN',
        'Honduras'
    ],
    [
        'HR',
        'Croatia'
    ],
    [
        'HT',
        'Haiti'
    ],
    [
        'HU',
        'Hungary'
    ],
    [
        'ID',
        'Indonesia'
    ],
    [
        'IE',
        'Ireland'
    ],
    [
        'IL',
        'Israel'
    ],
    [
        'IM',
        'Isle of Man'
    ],
    [
        'IN',
        'India'
    ],
    [
        'IO',
        'British Indian Ocean Territory'
    ],
    [
        'IQ',
        'Iraq'
    ],
    [
        'IR',
        'Iran'
    ],
    [
        'IS',
        'Iceland'
    ],
    [
        'IT',
        'Italy'
    ],
    [
        'JE',
        'Jersey'
    ],
    [
        'JM',
        'Jamaica'
    ],
    [
        'JO',
        'Jordan'
    ],
    [
        'JP',
        'Japan'
    ],
    [
        'KE',
        'Kenya'
    ],
    [
        'KG',
        'Kyrgyzstan'
    ],
    [
        'KH',
        'Cambodia'
    ],
    [
        'KI',
        'Kiribati'
    ],
    [
        'KM',
        'Comoros'
    ],
    [
        'KN',
        'Saint Kitts and Nevis'
    ],
    [
        'KP',
        "Korea, Democratic People's Republic of"
    ],
    [
        'KR',
        'Korea, Republic of'
    ],
    [
        'KW',
        'Kuwait'
    ],
    [
        'KY',
        'Cayman Islands'
    ],
    [
        'KZ',
        'Kazakhstan'
    ],
    [
        'LA',
        "Lao People's Democratic Republic"
    ],
    [
        'LB',
        'Lebanon'
    ],
    [
        'LC',
        'Saint Lucia'
    ],
    [
        'LI',
        'Liechtenstein'
    ],
    [
        'LK',
        'Sri Lanka'
    ],
    [
        'LR',
        'Liberia'
    ],
    [
        'LS',
        'Lesotho'
    ],
    [
        'LT',
        'Lithuania'
    ],
    [
        'LU',
        'Luxembourg'
    ],
    [
        'LV',
        'Latvia'
    ],
    [
        'LY',
        'Libya'
    ],
    [
        'MA',
        'Morocco'
    ],
    [
        'MC',
        'Monaco'
    ],
    [
        'MD',
        'Moldova'
    ],
    [
        'ME',
        'Montenegro'
    ],
    [
        'MF',
        'Saint Martin (French part)'
    ],
    [
        'MG',
        'Madagascar'
    ],
    [
        'MH',
        'Marshall Islands'
    ],
    [
        'MK',
        'North Macedonia'
    ],
    [
        'ML',
        'Mali'
    ],
    [
        'MM',
        'Myanmar'
    ],
    [
        'MN',
        'Mongolia'
    ],
    [
        'MO',
        'Macao'
    ],
    [
        'MP',
        'Northern Mariana Islands'
    ],
    [
        'MQ',
        'Martinique'
    ],
    [
        'MR',
        'Mauritania'
    ],
    [
        'MS',
        'Montserrat'
    ],
    [
        'MT',
        'Malta'
    ],
    [
        'MU',
        'Mauritius'
    ],
    [
        'MV',
        'Maldives'
    ],
    [
        'MW',
        'Malawi'
    ],
    [
        'MX',
        'Mexico'
    ],
    [
        'MY',
        'Malaysia'
    ],
    [
        'MZ',
        'Mozambique'
    ],
    [
        'NA',
        'Namibia'
    ],
    [
        'NC',
        'New Caledonia'
    ],
    [
        'NE',
        'Niger'
    ],
    [
        'NF',
        'Norfolk Island'
    ],
    [
        'NG',
        'Nigeria'
    ],
    [
        'NI',
        'Nicaragua'
    ],
    [
        'NL',
        'Netherlands'
    ],
    [
        'NO',
        'Norway'
    ],
    [
        'NP',
        'Nepal'
    ],
    [
        'NR',
        'Nauru'
    ],
    [
        'NU',
        'Niue'
    ],
    [
        'NZ',
        'New Zealand'
    ],
    [
        'OM',
        'Oman'
    ],
    [
        'PA',
        'Panama'
    ],
    [
        'PE',
        'Peru'
    ],
    [
        'PF',
        'French Polynesia'
    ],
    [
        'PG',
        'Papua New Guinea'
    ],
    [
        'PH',
        'Philippines'
    ],
    [
        'PK',
        'Pakistan'
    ],
    [
        'PL',
        'Poland'
    ],
    [
        'PM',
        'Saint Pierre and Miquelon'
    ],
    [
        'PN',
        'Pitcairn'
    ],
    [
        'PR',
        'Puerto Rico'
    ],
    [
        'PS',
        'Palestine, State of'
    ],
    [
        'PT',
        'Portugal'
    ],
    [
        'PW',
        'Palau'
    ],
    [
        'PY',
        'Paraguay'
    ],
    [
        'QA',
        'Qatar'
    ],
    [
        'RE',
        'Réunion'
    ],
    [
        'RO',
        'Romania'
    ],
    [
        'RS',
        'Serbia'
    ],
    [
        'RU',
        'Russian Federation'
    ],
    [
        'RW',
        'Rwanda'
    ],
    [
        'SA',
        'Saudi Arabia'
    ],
    [
        'SB',
        'Solomon Islands'
    ],
    [
        'SC',
        'Seychelles'
    ],
    [
        'SD',
        'Sudan'
    ],
    [
        'SE',
        'Sweden'
    ],
    [
        'SG',
        'Singapore'
    ],
    [
        'SH',
        'Saint Helena, Ascension and Tristan da Cunha'
    ],
    [
        'SI',
        'Slovenia'
    ],
    [
        'SJ',
        'Svalbard and Jan Mayen'
    ],
    [
        'SK',
        'Slovakia'
    ],
    [
        'SL',
        'Sierra Leone'
    ],
    [
        'SM',
        'San Marino'
    ],
    [
        'SN',
        'Senegal'
    ],
    [
        'SO',
        'Somalia'
    ],
    [
        'SR',
        'Suriname'
    ],
    [
        'SS',
        'South Sudan'
    ],
    [
        'ST',
        'Sao Tome and Principe'
    ],
    [
        'SV',
        'El Salvador'
    ],
    [
        'SX',
        'Sint Maarten (Dutch part)'
    ],
    [
        'SY',
        'Syrian Arab Republic'
    ],
    [
        'SZ',
        'Eswatini'
    ],
    [
        'TC',
        'Turks and Caicos Islands'
    ],
    [
        'TD',
        'Chad'
    ],
    [
        'TF',
        'French Southern Territories'
    ],
    [
        'TG',
        'Togo'
    ],
    [
        'TH',
        'Thailand'
    ],
    [
        'TJ',
        'Tajikistan'
    ],
    [
        'TK',
        'Tokelau'
    ],
    [
        'TL',
        'Timor-Leste'
    ],
    [
        'TM',
        'Turkmenistan'
    ],
    [
        'TN',
        'Tunisia'
    ],
    [
        'TO',
        'Tonga'
    ],
    [
        'TR',
        'Türkiye'
    ],
    [
        'TT',
        'Trinidad and Tobago'
    ],
    [
        'TV',
        'Tuvalu'
    ],
    [
        'TW',
        'Taiwan'
    ],
    [
        'TZ',
        'Tanzania, United Republic of'
    ],
    [
        'UA',
        'Ukraine'
    ],
    [
        'UG',
        'Uganda'
    ],
    [
        'UM',
        'United States Minor Outlying Islands'
    ],
    [
        'US',
        'United States'
    ],
    [
        'UY',
        'Uruguay'
    ],
    [
        'UZ',
        'Uzbekistan'
    ],
    [
        'VA',
        'Holy See (Vatican City State)'
    ],
    [
        'VC',
        'Saint Vincent and the Grenadines'
    ],
    [
        'VE',
        'Venezuela'
    ],
    [
        'VG',
        'Virgin Islands, British'
    ],
    [
        'VI',
        'Virgin Islands, U.S.'
    ],
    [
        'VN',
        'Viet Nam'
    ],
    [
        'VU',
        'Vanuatu'
    ],
    [
        'WF',
        'Wallis and Futuna'
    ],
    [
        'WS',
        'Samoa'
    ],
    [
        'YE',
        'Yemen'
    ],
    [
        'YT',
        'Mayotte'
    ],
    [
        'ZA',
        'South Africa'
    ],
    [
        'ZM',
        'Zambia'
    ],
    [
        'ZW',
        'Zimbabwe'
    ]
];
const COUNTRIES = RAW_COUNTRIES.map(_c = ([code, name])=>({
        code,
        name
    }));
_c1 = COUNTRIES;
/** Canonical name lookup set (lower-cased). */ const NAME_SET = new Set(COUNTRIES.map((c)=>c.name.toLowerCase()));
/**
 * Common aliases → canonical ISO name. Handles legacy values already
 * present in saved leads (e.g. "USA", "UK", "UAE") and frequent
 * alternate spellings, without duplicating leads (spec §5).
 */ const ALIASES = {
    usa: 'United States',
    'u s a': 'United States',
    'u s': 'United States',
    us: 'United States',
    america: 'United States',
    'united states of america': 'United States',
    'united states': 'United States',
    uk: 'United Kingdom',
    'u k': 'United Kingdom',
    britain: 'United Kingdom',
    'great britain': 'United Kingdom',
    england: 'United Kingdom',
    scotland: 'United Kingdom',
    wales: 'United Kingdom',
    'northern ireland': 'United Kingdom',
    uae: 'United Arab Emirates',
    'u a e': 'United Arab Emirates',
    emirates: 'United Arab Emirates',
    dubai: 'United Arab Emirates',
    'south korea': 'Korea, Republic of',
    korea: 'Korea, Republic of',
    'republic of korea': 'Korea, Republic of',
    'north korea': "Korea, Democratic People's Republic of",
    holland: 'Netherlands',
    'the netherlands': 'Netherlands',
    vietnam: 'Viet Nam',
    turkey: 'Türkiye',
    turkiye: 'Türkiye',
    czech: 'Czechia',
    'czech republic': 'Czechia',
    russia: 'Russian Federation',
    'russian federation': 'Russian Federation',
    iran: 'Iran',
    'islamic republic of iran': 'Iran',
    syria: 'Syrian Arab Republic',
    'syrian arab republic': 'Syrian Arab Republic',
    laos: "Lao People's Democratic Republic",
    bolivia: 'Bolivia',
    'plurinational state of bolivia': 'Bolivia',
    venezuela: 'Venezuela',
    'bolivarian republic of venezuela': 'Venezuela',
    tanzania: 'Tanzania, United Republic of',
    moldova: 'Moldova',
    'republic of moldova': 'Moldova',
    palestine: 'Palestine, State of',
    taiwan: 'Taiwan',
    'taiwan, province of china': 'Taiwan',
    macau: 'Macao',
    'cape verde': 'Cabo Verde',
    swaziland: 'Eswatini',
    macedonia: 'North Macedonia',
    burma: 'Myanmar',
    'ivory coast': "Côte d'Ivoire",
    'cape town': 'South Africa',
    'saudi': 'Saudi Arabia',
    'ksa': 'Saudi Arabia'
};
function normalizeCountryName(input) {
    if (!input || typeof input !== 'string') return null;
    const raw = input.trim();
    if (!raw) return null;
    // Punctuation/spaces collapse to single spaces so dotted forms
    // ("U.S.A.", "U.K.") resolve through the same alias table.
    const key = raw.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    // Exact canonical name (case-insensitive)
    if (NAME_SET.has(key)) {
        return COUNTRIES.find((c)=>c.name.toLowerCase() === key).name;
    }
    // Known alias
    if (ALIASES[key]) return ALIASES[key];
    return null;
}
function countryCodeFor(input) {
    const canonical = normalizeCountryName(input);
    if (!canonical) return null;
    return COUNTRIES.find((c)=>c.name === canonical)?.code ?? null;
}
function extractCountryFromLocation(location) {
    if (!location) return null;
    const segments = location.split(',').map((s)=>s.trim()).filter(Boolean);
    // Try from the most specific (last segment) backwards
    for(let i = segments.length - 1; i >= 0; i--){
        const normalized = normalizeCountryName(segments[i]);
        if (normalized) return normalized;
    }
    return normalizeCountryName(location);
}
function aliasesFor(input) {
    const canonical = normalizeCountryName(input);
    if (!canonical) return input.trim() ? [
        input.trim()
    ] : [];
    const variants = new Set([
        canonical
    ]);
    for (const [alias, target] of Object.entries(ALIASES)){
        if (target === canonical) variants.add(alias);
    }
    // Capitalized alias forms (USA stays uppercase; "usa" → "Usa" is not used)
    return Array.from(variants);
}
function searchCountries(query, limit = 12) {
    const q = query.trim().toLowerCase();
    if (!q) return COUNTRIES.slice(0, limit);
    const starts = [];
    const contains = [];
    for (const c of COUNTRIES){
        const name = c.name.toLowerCase();
        const code = c.code.toLowerCase();
        if (name.startsWith(q) || code === q) starts.push(c);
        else if (name.includes(q)) contains.push(c);
        if (starts.length >= limit) break;
    }
    return [
        ...starts,
        ...contains
    ].slice(0, limit);
}
var _c, _c1;
__turbopack_context__.k.register(_c, "COUNTRIES$RAW_COUNTRIES.map");
__turbopack_context__.k.register(_c1, "COUNTRIES");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/components/dashboard/lead-import-dialog.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>ImportLeadsDialog
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$QueryClientProvider$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/@tanstack/react-query/build/modern/QueryClientProvider.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$upload$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Upload$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/upload.js [app-client] (ecmascript) <export default as Upload>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$file$2d$spreadsheet$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__FileSpreadsheet$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/file-spreadsheet.js [app-client] (ecmascript) <export default as FileSpreadsheet>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$circle$2d$alert$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__AlertCircle$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/circle-alert.js [app-client] (ecmascript) <export default as AlertCircle>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$circle$2d$check$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__CheckCircle2$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/circle-check.js [app-client] (ecmascript) <export default as CheckCircle2>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$circle$2d$x$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__XCircle$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/circle-x.js [app-client] (ecmascript) <export default as XCircle>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$loader$2d$circle$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Loader2$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/loader-circle.js [app-client] (ecmascript) <export default as Loader2>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$file$2d$up$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__FileUp$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/file-up.js [app-client] (ecmascript) <export default as FileUp>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$download$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Download$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/download.js [app-client] (ecmascript) <export default as Download>");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$dialog$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/ui/dialog.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$button$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/ui/button.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$badge$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/ui/badge.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$progress$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/ui/progress.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$scroll$2d$area$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/ui/scroll-area.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/utils.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$sonner$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/sonner/dist/index.mjs [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
'use client';
;
;
;
;
;
;
;
;
;
;
function ImportLeadsDialog({ open, onOpenChange }) {
    _s();
    const queryClient = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$QueryClientProvider$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useQueryClient"])();
    const fileInputRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(null);
    const [step, setStep] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])('upload');
    const [fileName, setFileName] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])('');
    const [csvData, setCsvData] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])('');
    const [parseErrors, setParseErrors] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])([]);
    const [previewData, setPreviewData] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])([]);
    const [importProgress, setImportProgress] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(0);
    const [importResults, setImportResults] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [isDragOver, setIsDragOver] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const reset = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "ImportLeadsDialog.useCallback[reset]": ()=>{
            setStep('upload');
            setFileName('');
            setCsvData('');
            setParseErrors([]);
            setPreviewData([]);
            setImportProgress(0);
            setImportResults(null);
            setIsDragOver(false);
        }
    }["ImportLeadsDialog.useCallback[reset]"], []);
    const handleFileSelect = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "ImportLeadsDialog.useCallback[handleFileSelect]": async (file)=>{
            if (!file.name.endsWith('.csv')) {
                __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$sonner$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toast"].error('Please select a CSV file');
                return;
            }
            try {
                const text = await file.text();
                setFileName(file.name);
                setCsvData(text);
                // Parse preview (first 5 lines)
                const lines = text.trim().split('\n');
                if (lines.length < 2) {
                    setParseErrors([
                        'CSV file appears empty or has no data rows'
                    ]);
                    return;
                }
                const headers = lines[0].split(',').map({
                    "ImportLeadsDialog.useCallback[handleFileSelect].headers": (h)=>h.trim().replace(/"/g, '')
                }["ImportLeadsDialog.useCallback[handleFileSelect].headers"]);
                const previewRows = [];
                for(let i = 1; i < Math.min(lines.length, 6); i++){
                    const values = lines[i].split(',').map({
                        "ImportLeadsDialog.useCallback[handleFileSelect].values": (v)=>v.trim().replace(/"/g, '')
                    }["ImportLeadsDialog.useCallback[handleFileSelect].values"]);
                    const row = {};
                    headers.forEach({
                        "ImportLeadsDialog.useCallback[handleFileSelect]": (h, idx)=>{
                            row[h] = values[idx] || '';
                        }
                    }["ImportLeadsDialog.useCallback[handleFileSelect]"]);
                    previewRows.push({
                        businessName: row['Business Name'] || row['businessName'] || row['name'] || '',
                        ownerName: row['Owner'] || row['ownerName'] || '',
                        niche: row['Niche'] || row['niche'] || '',
                        country: row['Country'] || row['country'] || '',
                        city: row['City'] || row['city'] || '',
                        email: row['Email'] || row['email'] || '',
                        phone: row['Phone'] || row['phone'] || ''
                    });
                }
                setPreviewData(previewRows);
                setStep('preview');
            } catch  {
                __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$sonner$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toast"].error('Failed to read the CSV file');
            }
        }
    }["ImportLeadsDialog.useCallback[handleFileSelect]"], []);
    const handleDrop = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "ImportLeadsDialog.useCallback[handleDrop]": (e)=>{
            e.preventDefault();
            setIsDragOver(false);
            const file = e.dataTransfer.files[0];
            if (file) handleFileSelect(file);
        }
    }["ImportLeadsDialog.useCallback[handleDrop]"], [
        handleFileSelect
    ]);
    const handleDragOver = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "ImportLeadsDialog.useCallback[handleDragOver]": (e)=>{
            e.preventDefault();
            setIsDragOver(true);
        }
    }["ImportLeadsDialog.useCallback[handleDragOver]"], []);
    const handleDragLeave = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "ImportLeadsDialog.useCallback[handleDragLeave]": (e)=>{
            e.preventDefault();
            setIsDragOver(false);
        }
    }["ImportLeadsDialog.useCallback[handleDragLeave]"], []);
    const handleInputChange = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "ImportLeadsDialog.useCallback[handleInputChange]": (e)=>{
            const file = e.target.files?.[0];
            if (file) handleFileSelect(file);
            e.target.value = '';
        }
    }["ImportLeadsDialog.useCallback[handleInputChange]"], [
        handleFileSelect
    ]);
    const handleImport = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "ImportLeadsDialog.useCallback[handleImport]": async ()=>{
            if (!csvData) return;
            setStep('importing');
            setImportProgress(10);
            try {
                const formData = new FormData();
                const blob = new Blob([
                    csvData
                ], {
                    type: 'text/csv'
                });
                formData.append('file', blob, fileName);
                setImportProgress(30);
                const res = await fetch('/api/leads/import', {
                    method: 'POST',
                    body: formData
                });
                setImportProgress(80);
                if (!res.ok) {
                    const data = await res.json().catch({
                        "ImportLeadsDialog.useCallback[handleImport]": ()=>({})
                    }["ImportLeadsDialog.useCallback[handleImport]"]);
                    throw new Error(data.error || 'Import failed');
                }
                const result = await res.json();
                setImportProgress(100);
                setImportResults({
                    success: result.success ?? true,
                    total: result.total ?? 0,
                    imported: result.imported ?? result.total ?? 0,
                    duplicates: result.duplicates ?? 0,
                    failed: result.failed ?? result.errors?.length ?? 0,
                    errors: result.errors ?? []
                });
                setStep('complete');
                queryClient.invalidateQueries({
                    queryKey: [
                        'leads'
                    ]
                });
            } catch (error) {
                setImportResults({
                    success: false,
                    total: 0,
                    imported: 0,
                    duplicates: 0,
                    failed: 0,
                    errors: [
                        {
                            row: 0,
                            message: error instanceof Error ? error.message : 'Import failed'
                        }
                    ]
                });
                setStep('complete');
            }
        }
    }["ImportLeadsDialog.useCallback[handleImport]"], [
        csvData,
        fileName,
        queryClient
    ]);
    const handleDownloadTemplate = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "ImportLeadsDialog.useCallback[handleDownloadTemplate]": ()=>{
            const headers = 'Business Name,Owner Name,Niche,Country,City,Email,Phone,WhatsApp,Website,LinkedIn,Instagram,Facebook,Notes,Tags\n';
            const example = 'Acme Dental Clinic,Dr. John Smith,Dental,USA,New York,john@acme.com,+1 555 123 4567,+1 555 123 4567,acme-dental.com,linkedin.com/company/acme,@acmedental,facebook.com/acmedental,High value lead interested in digital marketing,Hot Lead;VIP\n';
            const blob = new Blob([
                headers + example
            ], {
                type: 'text/csv'
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'lead-import-template.csv';
            a.click();
            URL.revokeObjectURL(url);
        }
    }["ImportLeadsDialog.useCallback[handleDownloadTemplate]"], []);
    const handleClose = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "ImportLeadsDialog.useCallback[handleClose]": ()=>{
            onOpenChange(false);
            setTimeout(reset, 200);
        }
    }["ImportLeadsDialog.useCallback[handleClose]"], [
        onOpenChange,
        reset
    ]);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$dialog$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Dialog"], {
        open: open,
        onOpenChange: (v)=>{
            if (!v) handleClose();
            else onOpenChange(v);
        },
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$dialog$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["DialogContent"], {
            className: "sm:max-w-lg",
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$dialog$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["DialogHeader"], {
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$dialog$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["DialogTitle"], {
                            className: "flex items-center gap-2",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$file$2d$up$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__FileUp$3e$__["FileUp"], {
                                    className: "h-5 w-5 text-primary"
                                }, void 0, false, {
                                    fileName: "[project]/src/components/dashboard/lead-import-dialog.tsx",
                                    lineNumber: 212,
                                    columnNumber: 13
                                }, this),
                                "Import Leads from CSV"
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/components/dashboard/lead-import-dialog.tsx",
                            lineNumber: 211,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$dialog$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["DialogDescription"], {
                            children: "Upload a CSV file with your lead data. We'll handle deduplication automatically."
                        }, void 0, false, {
                            fileName: "[project]/src/components/dashboard/lead-import-dialog.tsx",
                            lineNumber: 215,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/src/components/dashboard/lead-import-dialog.tsx",
                    lineNumber: 210,
                    columnNumber: 9
                }, this),
                step === 'upload' && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "space-y-4",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            onDrop: handleDrop,
                            onDragOver: handleDragOver,
                            onDragLeave: handleDragLeave,
                            onClick: ()=>fileInputRef.current?.click(),
                            className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])('border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all duration-200', 'hover:border-primary/50 hover:bg-primary/5', isDragOver ? 'border-primary bg-primary/10' : 'border-muted-foreground/25'),
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                    ref: fileInputRef,
                                    type: "file",
                                    accept: ".csv",
                                    onChange: handleInputChange,
                                    className: "hidden"
                                }, void 0, false, {
                                    fileName: "[project]/src/components/dashboard/lead-import-dialog.tsx",
                                    lineNumber: 234,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "flex flex-col items-center gap-3",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])('flex items-center justify-center h-12 w-12 rounded-xl transition-colors', isDragOver ? 'bg-primary/20' : 'bg-muted'),
                                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$upload$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Upload$3e$__["Upload"], {
                                                className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])('h-6 w-6', isDragOver ? 'text-primary' : 'text-muted-foreground')
                                            }, void 0, false, {
                                                fileName: "[project]/src/components/dashboard/lead-import-dialog.tsx",
                                                lineNumber: 246,
                                                columnNumber: 19
                                            }, this)
                                        }, void 0, false, {
                                            fileName: "[project]/src/components/dashboard/lead-import-dialog.tsx",
                                            lineNumber: 242,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                    className: "text-sm font-medium",
                                                    children: isDragOver ? 'Drop your CSV file here' : 'Drag & drop a CSV file here'
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/dashboard/lead-import-dialog.tsx",
                                                    lineNumber: 249,
                                                    columnNumber: 19
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                    className: "text-xs text-muted-foreground mt-1",
                                                    children: "or click to browse · .csv files only"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/dashboard/lead-import-dialog.tsx",
                                                    lineNumber: 252,
                                                    columnNumber: 19
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/components/dashboard/lead-import-dialog.tsx",
                                            lineNumber: 248,
                                            columnNumber: 17
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/components/dashboard/lead-import-dialog.tsx",
                                    lineNumber: 241,
                                    columnNumber: 15
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/components/dashboard/lead-import-dialog.tsx",
                            lineNumber: 223,
                            columnNumber: 13
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$button$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Button"], {
                            variant: "ghost",
                            size: "sm",
                            className: "text-xs gap-1.5 w-full",
                            onClick: handleDownloadTemplate,
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$download$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Download$3e$__["Download"], {
                                    className: "h-3.5 w-3.5"
                                }, void 0, false, {
                                    fileName: "[project]/src/components/dashboard/lead-import-dialog.tsx",
                                    lineNumber: 265,
                                    columnNumber: 15
                                }, this),
                                "Download CSV Template"
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/components/dashboard/lead-import-dialog.tsx",
                            lineNumber: 259,
                            columnNumber: 13
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/src/components/dashboard/lead-import-dialog.tsx",
                    lineNumber: 222,
                    columnNumber: 11
                }, this),
                step === 'preview' && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "space-y-4",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "flex items-center gap-2 p-3 rounded-lg bg-muted/50",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$file$2d$spreadsheet$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__FileSpreadsheet$3e$__["FileSpreadsheet"], {
                                    className: "h-5 w-5 text-emerald-500"
                                }, void 0, false, {
                                    fileName: "[project]/src/components/dashboard/lead-import-dialog.tsx",
                                    lineNumber: 275,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "flex-1 min-w-0",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                            className: "text-sm font-medium truncate",
                                            children: fileName
                                        }, void 0, false, {
                                            fileName: "[project]/src/components/dashboard/lead-import-dialog.tsx",
                                            lineNumber: 277,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                            className: "text-xs text-muted-foreground",
                                            children: [
                                                previewData.length,
                                                "+ rows found"
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/components/dashboard/lead-import-dialog.tsx",
                                            lineNumber: 278,
                                            columnNumber: 17
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/components/dashboard/lead-import-dialog.tsx",
                                    lineNumber: 276,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$button$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Button"], {
                                    variant: "ghost",
                                    size: "sm",
                                    onClick: reset,
                                    className: "text-xs",
                                    children: "Change file"
                                }, void 0, false, {
                                    fileName: "[project]/src/components/dashboard/lead-import-dialog.tsx",
                                    lineNumber: 280,
                                    columnNumber: 15
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/components/dashboard/lead-import-dialog.tsx",
                            lineNumber: 274,
                            columnNumber: 13
                        }, this),
                        previewData.length > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "space-y-2",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                    className: "text-xs font-medium text-muted-foreground",
                                    children: [
                                        "Preview (first ",
                                        previewData.length,
                                        " rows)"
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/components/dashboard/lead-import-dialog.tsx",
                                    lineNumber: 285,
                                    columnNumber: 17
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$scroll$2d$area$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["ScrollArea"], {
                                    className: "max-h-48",
                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "border rounded-md overflow-hidden",
                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("table", {
                                            className: "w-full text-xs",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("thead", {
                                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("tr", {
                                                        className: "bg-muted/50 border-b",
                                                        children: [
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("th", {
                                                                className: "text-left p-2 font-medium",
                                                                children: "Business Name"
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/components/dashboard/lead-import-dialog.tsx",
                                                                lineNumber: 291,
                                                                columnNumber: 27
                                                            }, this),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("th", {
                                                                className: "text-left p-2 font-medium",
                                                                children: "Niche"
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/components/dashboard/lead-import-dialog.tsx",
                                                                lineNumber: 292,
                                                                columnNumber: 27
                                                            }, this),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("th", {
                                                                className: "text-left p-2 font-medium",
                                                                children: "Country"
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/components/dashboard/lead-import-dialog.tsx",
                                                                lineNumber: 293,
                                                                columnNumber: 27
                                                            }, this),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("th", {
                                                                className: "text-left p-2 font-medium",
                                                                children: "Email"
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/components/dashboard/lead-import-dialog.tsx",
                                                                lineNumber: 294,
                                                                columnNumber: 27
                                                            }, this)
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/src/components/dashboard/lead-import-dialog.tsx",
                                                        lineNumber: 290,
                                                        columnNumber: 25
                                                    }, this)
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/dashboard/lead-import-dialog.tsx",
                                                    lineNumber: 289,
                                                    columnNumber: 23
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("tbody", {
                                                    children: previewData.map((lead, i)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("tr", {
                                                            className: "border-b last:border-0",
                                                            children: [
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("td", {
                                                                    className: "p-2 font-medium truncate max-w-[140px]",
                                                                    children: lead.businessName || '—'
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/components/dashboard/lead-import-dialog.tsx",
                                                                    lineNumber: 300,
                                                                    columnNumber: 29
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("td", {
                                                                    className: "p-2 text-muted-foreground",
                                                                    children: lead.niche || '—'
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/components/dashboard/lead-import-dialog.tsx",
                                                                    lineNumber: 301,
                                                                    columnNumber: 29
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("td", {
                                                                    className: "p-2 text-muted-foreground",
                                                                    children: lead.country || '—'
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/components/dashboard/lead-import-dialog.tsx",
                                                                    lineNumber: 302,
                                                                    columnNumber: 29
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("td", {
                                                                    className: "p-2 text-muted-foreground truncate max-w-[120px]",
                                                                    children: lead.email || '—'
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/components/dashboard/lead-import-dialog.tsx",
                                                                    lineNumber: 303,
                                                                    columnNumber: 29
                                                                }, this)
                                                            ]
                                                        }, i, true, {
                                                            fileName: "[project]/src/components/dashboard/lead-import-dialog.tsx",
                                                            lineNumber: 299,
                                                            columnNumber: 27
                                                        }, this))
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/dashboard/lead-import-dialog.tsx",
                                                    lineNumber: 297,
                                                    columnNumber: 23
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/components/dashboard/lead-import-dialog.tsx",
                                            lineNumber: 288,
                                            columnNumber: 21
                                        }, this)
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/dashboard/lead-import-dialog.tsx",
                                        lineNumber: 287,
                                        columnNumber: 19
                                    }, this)
                                }, void 0, false, {
                                    fileName: "[project]/src/components/dashboard/lead-import-dialog.tsx",
                                    lineNumber: 286,
                                    columnNumber: 17
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/components/dashboard/lead-import-dialog.tsx",
                            lineNumber: 284,
                            columnNumber: 15
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "flex items-center justify-between pt-2",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$button$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Button"], {
                                    variant: "outline",
                                    onClick: handleClose,
                                    children: "Cancel"
                                }, void 0, false, {
                                    fileName: "[project]/src/components/dashboard/lead-import-dialog.tsx",
                                    lineNumber: 314,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$button$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Button"], {
                                    onClick: handleImport,
                                    className: "bg-primary hover:bg-primary/90 gap-2",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$upload$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Upload$3e$__["Upload"], {
                                            className: "h-4 w-4"
                                        }, void 0, false, {
                                            fileName: "[project]/src/components/dashboard/lead-import-dialog.tsx",
                                            lineNumber: 316,
                                            columnNumber: 17
                                        }, this),
                                        "Import Leads"
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/components/dashboard/lead-import-dialog.tsx",
                                    lineNumber: 315,
                                    columnNumber: 15
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/components/dashboard/lead-import-dialog.tsx",
                            lineNumber: 313,
                            columnNumber: 13
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/src/components/dashboard/lead-import-dialog.tsx",
                    lineNumber: 273,
                    columnNumber: 11
                }, this),
                step === 'importing' && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "space-y-4 py-4",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "flex items-center justify-center gap-3",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$loader$2d$circle$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Loader2$3e$__["Loader2"], {
                                    className: "h-5 w-5 animate-spin text-primary"
                                }, void 0, false, {
                                    fileName: "[project]/src/components/dashboard/lead-import-dialog.tsx",
                                    lineNumber: 327,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    className: "text-sm font-medium",
                                    children: "Importing leads..."
                                }, void 0, false, {
                                    fileName: "[project]/src/components/dashboard/lead-import-dialog.tsx",
                                    lineNumber: 328,
                                    columnNumber: 15
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/components/dashboard/lead-import-dialog.tsx",
                            lineNumber: 326,
                            columnNumber: 13
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$progress$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Progress"], {
                            value: importProgress
                        }, void 0, false, {
                            fileName: "[project]/src/components/dashboard/lead-import-dialog.tsx",
                            lineNumber: 330,
                            columnNumber: 13
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                            className: "text-xs text-center text-muted-foreground",
                            children: "Please wait while leads are being imported and deduplicated"
                        }, void 0, false, {
                            fileName: "[project]/src/components/dashboard/lead-import-dialog.tsx",
                            lineNumber: 331,
                            columnNumber: 13
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/src/components/dashboard/lead-import-dialog.tsx",
                    lineNumber: 325,
                    columnNumber: 11
                }, this),
                step === 'complete' && importResults && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "space-y-4",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "flex items-start gap-3 p-4 rounded-lg bg-muted/50",
                            children: [
                                importResults.failed === 0 && importResults.success ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$circle$2d$check$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__CheckCircle2$3e$__["CheckCircle2"], {
                                    className: "h-6 w-6 text-emerald-500 shrink-0 mt-0.5"
                                }, void 0, false, {
                                    fileName: "[project]/src/components/dashboard/lead-import-dialog.tsx",
                                    lineNumber: 342,
                                    columnNumber: 17
                                }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$circle$2d$alert$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__AlertCircle$3e$__["AlertCircle"], {
                                    className: "h-6 w-6 text-amber-500 shrink-0 mt-0.5"
                                }, void 0, false, {
                                    fileName: "[project]/src/components/dashboard/lead-import-dialog.tsx",
                                    lineNumber: 344,
                                    columnNumber: 17
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                            className: "text-sm font-medium",
                                            children: [
                                                "Import ",
                                                importResults.success ? 'Complete' : 'Failed'
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/components/dashboard/lead-import-dialog.tsx",
                                            lineNumber: 347,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "flex items-center gap-3 mt-1",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "text-xs flex items-center gap-1",
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$circle$2d$check$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__CheckCircle2$3e$__["CheckCircle2"], {
                                                            className: "h-3 w-3 text-emerald-500"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/components/dashboard/lead-import-dialog.tsx",
                                                            lineNumber: 352,
                                                            columnNumber: 21
                                                        }, this),
                                                        importResults.imported,
                                                        " imported"
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/src/components/dashboard/lead-import-dialog.tsx",
                                                    lineNumber: 351,
                                                    columnNumber: 19
                                                }, this),
                                                importResults.duplicates > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "text-xs flex items-center gap-1",
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$badge$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Badge"], {
                                                            variant: "outline",
                                                            className: "h-4 text-[9px] px-1",
                                                            children: "Duplicates"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/components/dashboard/lead-import-dialog.tsx",
                                                            lineNumber: 357,
                                                            columnNumber: 23
                                                        }, this),
                                                        importResults.duplicates,
                                                        " skipped"
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/src/components/dashboard/lead-import-dialog.tsx",
                                                    lineNumber: 356,
                                                    columnNumber: 21
                                                }, this),
                                                importResults.failed > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "text-xs flex items-center gap-1",
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$circle$2d$x$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__XCircle$3e$__["XCircle"], {
                                                            className: "h-3 w-3 text-destructive"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/components/dashboard/lead-import-dialog.tsx",
                                                            lineNumber: 363,
                                                            columnNumber: 23
                                                        }, this),
                                                        importResults.failed,
                                                        " failed"
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/src/components/dashboard/lead-import-dialog.tsx",
                                                    lineNumber: 362,
                                                    columnNumber: 21
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/components/dashboard/lead-import-dialog.tsx",
                                            lineNumber: 350,
                                            columnNumber: 17
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/components/dashboard/lead-import-dialog.tsx",
                                    lineNumber: 346,
                                    columnNumber: 15
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/components/dashboard/lead-import-dialog.tsx",
                            lineNumber: 340,
                            columnNumber: 13
                        }, this),
                        importResults.errors.length > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$scroll$2d$area$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["ScrollArea"], {
                            className: "max-h-28",
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "space-y-0.5",
                                children: importResults.errors.map((err, i)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                        className: "text-xs text-destructive",
                                        children: [
                                            "Row ",
                                            err.row,
                                            ": ",
                                            err.message
                                        ]
                                    }, i, true, {
                                        fileName: "[project]/src/components/dashboard/lead-import-dialog.tsx",
                                        lineNumber: 375,
                                        columnNumber: 21
                                    }, this))
                            }, void 0, false, {
                                fileName: "[project]/src/components/dashboard/lead-import-dialog.tsx",
                                lineNumber: 373,
                                columnNumber: 17
                            }, this)
                        }, void 0, false, {
                            fileName: "[project]/src/components/dashboard/lead-import-dialog.tsx",
                            lineNumber: 372,
                            columnNumber: 15
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "flex justify-end pt-2",
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$button$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Button"], {
                                onClick: handleClose,
                                className: "bg-primary hover:bg-primary/90",
                                children: "Done"
                            }, void 0, false, {
                                fileName: "[project]/src/components/dashboard/lead-import-dialog.tsx",
                                lineNumber: 384,
                                columnNumber: 15
                            }, this)
                        }, void 0, false, {
                            fileName: "[project]/src/components/dashboard/lead-import-dialog.tsx",
                            lineNumber: 383,
                            columnNumber: 13
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/src/components/dashboard/lead-import-dialog.tsx",
                    lineNumber: 339,
                    columnNumber: 11
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/src/components/dashboard/lead-import-dialog.tsx",
            lineNumber: 209,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/src/components/dashboard/lead-import-dialog.tsx",
        lineNumber: 208,
        columnNumber: 5
    }, this);
}
_s(ImportLeadsDialog, "P4MkjgrboAIEIUlDLqCr/oaUD/c=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$QueryClientProvider$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useQueryClient"]
    ];
});
_c = ImportLeadsDialog;
var _c;
__turbopack_context__.k.register(_c, "ImportLeadsDialog");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/lib/business-profile.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "archiveBusinessProfile",
    ()=>archiveBusinessProfile,
    "buildBusinessContextBlock",
    ()=>buildBusinessContextBlock,
    "createBusinessProfile",
    ()=>createBusinessProfile,
    "fetchBusinessProfiles",
    ()=>fetchBusinessProfiles,
    "updateBusinessProfile",
    ()=>updateBusinessProfile
]);
// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Business Profiles (client API + server-side context
// resolution)
//
// Two halves:
//  1. Client helpers (fetch/create/update/archive) used by the settings UI
//     and profile selectors.
//  2. The server-side resolver (`resolveBusinessContext`) lives in
//     ./business-profile-server (SERVER-ONLY — imports Prisma). It applies
//     the spec resolution order: profile defaults first, campaign overrides
//     win where provided, nothing cross-user or fabricated.
// ═══════════════════════════════════════════════════════════════════
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2d$error$2d$handler$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/api-error-handler.ts [app-client] (ecmascript)");
;
async function fetchBusinessProfiles() {
    const data = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2d$error$2d$handler$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["apiCall"])('/api/business-profiles', undefined, {
        errorMessage: 'Failed to load business profiles'
    });
    return data.profiles;
}
async function createBusinessProfile(input) {
    const data = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2d$error$2d$handler$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["apiCall"])('/api/business-profiles', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(input)
    }, {
        errorMessage: 'Failed to create business profile'
    });
    return data.profile;
}
async function updateBusinessProfile(id, input) {
    const data = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2d$error$2d$handler$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["apiCall"])(`/api/business-profiles/${id}`, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(input)
    }, {
        errorMessage: 'Failed to update business profile'
    });
    return data.profile;
}
async function archiveBusinessProfile(id) {
    await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2d$error$2d$handler$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["apiCall"])(`/api/business-profiles/${id}`, {
        method: 'DELETE'
    }, {
        errorMessage: 'Failed to archive business profile'
    });
}
function joinList(items) {
    return items.map((s)=>s.description ? `${s.name} — ${s.description}` : s.name).join('; ');
}
function buildBusinessContextBlock(ctx) {
    if (!ctx || !ctx.companyName && !ctx.description && ctx.productsServices.length === 0) {
        return '';
    }
    const lines = [];
    lines.push('=== SENDER BUSINESS CONTEXT (who is reaching out) ===');
    if (ctx.companyName) lines.push(`Business name: ${ctx.companyName}`);
    if (ctx.industry) lines.push(`Industry: ${ctx.industry}`);
    if (ctx.website) lines.push(`Website: ${ctx.website}`);
    if (ctx.description) lines.push(`What they do: ${ctx.description}`);
    if (ctx.valueProposition) lines.push(`Value proposition: ${ctx.valueProposition}`);
    if (ctx.productsServices.length > 0) {
        lines.push(`Products/services offered: ${joinList(ctx.productsServices)}`);
    }
    if (ctx.targetAudience) lines.push(`Target customers: ${ctx.targetAudience}`);
    if (ctx.serviceAreas) lines.push(`Service areas: ${ctx.serviceAreas}`);
    if (ctx.goals) lines.push(`Campaign goal: ${ctx.goals}`);
    if (ctx.preferredCta) lines.push(`Preferred call to action: ${ctx.preferredCta}`);
    if (ctx.differentiators.length > 0) lines.push(`Differentiators/proof: ${ctx.differentiators.join('; ')}`);
    if (ctx.additionalContext) lines.push(`Additional sender instructions: ${ctx.additionalContext}`);
    if (ctx.overriddenFields.length > 0) {
        lines.push(`Campaign-specific overrides applied: ${ctx.overriddenFields.join(', ')}`);
    }
    lines.push('Use ONLY this context to describe the sender. If a detail is not listed here, treat it as unknown — never invent products, results, statistics, or client relationships for the sender.');
    return lines.join('\n');
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/components/dashboard/business-profile-selector.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>BusinessProfileSelector
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Business Profile Selector (compact)
// Shown wherever discovery / research / outreach needs business context:
// pick which of YOUR business profiles the AI should act as, with the
// campaign override fields (objective, audience, offer, outcome, CTA,
// tone) in an optional expander. Selection + overrides are passed up to
// the caller and persisted with the campaign/job — resolution happens
// server-side in resolveBusinessContext (ownership enforced there).
// ═══════════════════════════════════════════════════════════════════
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$building$2d$2$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Building2$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/building-2.js [app-client] (ecmascript) <export default as Building2>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chevron$2d$down$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__ChevronDown$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/chevron-down.js [app-client] (ecmascript) <export default as ChevronDown>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$loader$2d$circle$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Loader2$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/loader-circle.js [app-client] (ecmascript) <export default as Loader2>");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$select$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/ui/select.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$input$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/ui/input.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$textarea$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/ui/textarea.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$business$2d$profile$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/business-profile.ts [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
'use client';
;
;
;
;
;
;
function BusinessProfileSelector({ value, onChange, compact = false }) {
    _s();
    const [profiles, setProfiles] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])([]);
    const [loading, setLoading] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(true);
    const [showOverrides, setShowOverrides] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const [loadError, setLoadError] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "BusinessProfileSelector.useEffect": ()=>{
            let cancelled = false;
            void ({
                "BusinessProfileSelector.useEffect": async ()=>{
                    try {
                        const list = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$business$2d$profile$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fetchBusinessProfiles"])();
                        if (cancelled) return;
                        setProfiles(list);
                        setLoadError(null);
                        // Auto-select the default profile only while nothing explicit has
                        // been chosen (an explicit None is never overridden).
                        if (value.mode === 'default' && !value.businessProfileId && list.length > 0) {
                            const def = list.find({
                                "BusinessProfileSelector.useEffect": (p)=>p.isDefault
                            }["BusinessProfileSelector.useEffect"]) ?? list[0];
                            onChange({
                                ...value,
                                mode: 'profile',
                                businessProfileId: def.id
                            });
                        }
                    } catch (err) {
                        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Failed to load profiles');
                    } finally{
                        if (!cancelled) setLoading(false);
                    }
                }
            })["BusinessProfileSelector.useEffect"]();
            return ({
                "BusinessProfileSelector.useEffect": ()=>{
                    cancelled = true;
                }
            })["BusinessProfileSelector.useEffect"];
        }
    }["BusinessProfileSelector.useEffect"], []);
    const selected = profiles.find((p)=>p.id === value.businessProfileId) ?? null;
    const setOverride = (k)=>(e)=>onChange({
                ...value,
                overrides: {
                    ...value.overrides,
                    [k]: e.target.value
                }
            });
    const activeOverrideCount = Object.values(value.overrides).filter((v)=>(v ?? '').trim()).length;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "space-y-3",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex items-center gap-2",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$building$2d$2$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Building2$3e$__["Building2"], {
                        className: "h-4 w-4 text-primary shrink-0"
                    }, void 0, false, {
                        fileName: "[project]/src/components/dashboard/business-profile-selector.tsx",
                        lineNumber: 90,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$select$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Select"], {
                        value: value.mode === 'none' ? '__none' : value.businessProfileId ?? undefined,
                        onValueChange: (v)=>{
                            if (v === '__none') {
                                // EXPLICIT None — clears the override entirely; the server is
                                // told (useBusinessContext: false) not to fall back to the
                                // default profile.
                                onChange({
                                    ...value,
                                    mode: 'none',
                                    businessProfileId: null
                                });
                            } else {
                                onChange({
                                    ...value,
                                    mode: 'profile',
                                    businessProfileId: v
                                });
                            }
                        },
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$select$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["SelectTrigger"], {
                                className: "flex-1 h-9 text-sm",
                                "aria-label": "Business profile",
                                children: loading ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    className: "flex items-center gap-2 text-muted-foreground text-sm",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$loader$2d$circle$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Loader2$3e$__["Loader2"], {
                                            className: "h-3.5 w-3.5 animate-spin"
                                        }, void 0, false, {
                                            fileName: "[project]/src/components/dashboard/business-profile-selector.tsx",
                                            lineNumber: 107,
                                            columnNumber: 17
                                        }, this),
                                        " Loading profiles…"
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/components/dashboard/business-profile-selector.tsx",
                                    lineNumber: 106,
                                    columnNumber: 15
                                }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$select$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["SelectValue"], {
                                    placeholder: loadError ? 'Profiles unavailable' : 'Select business profile'
                                }, void 0, false, {
                                    fileName: "[project]/src/components/dashboard/business-profile-selector.tsx",
                                    lineNumber: 110,
                                    columnNumber: 15
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/src/components/dashboard/business-profile-selector.tsx",
                                lineNumber: 104,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$select$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["SelectContent"], {
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$select$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["SelectItem"], {
                                        value: "__none",
                                        children: "None — no business context"
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/dashboard/business-profile-selector.tsx",
                                        lineNumber: 114,
                                        columnNumber: 13
                                    }, this),
                                    profiles.map((p)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$select$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["SelectItem"], {
                                            value: p.id,
                                            children: [
                                                p.label,
                                                p.industry ? ` · ${p.industry}` : '',
                                                p.isDefault ? ' (default)' : ''
                                            ]
                                        }, p.id, true, {
                                            fileName: "[project]/src/components/dashboard/business-profile-selector.tsx",
                                            lineNumber: 116,
                                            columnNumber: 15
                                        }, this)),
                                    profiles.length === 0 && !loading && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$select$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["SelectItem"], {
                                        value: "__empty",
                                        disabled: true,
                                        children: "No profiles — create one in Settings → Business Profiles"
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/dashboard/business-profile-selector.tsx",
                                        lineNumber: 121,
                                        columnNumber: 15
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/components/dashboard/business-profile-selector.tsx",
                                lineNumber: 113,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/components/dashboard/business-profile-selector.tsx",
                        lineNumber: 91,
                        columnNumber: 9
                    }, this),
                    !compact && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        type: "button",
                        onClick: ()=>setShowOverrides((s)=>!s),
                        className: "text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 shrink-0",
                        "aria-expanded": showOverrides,
                        children: [
                            activeOverrideCount > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-primary/15 text-primary text-[10px]",
                                children: activeOverrideCount
                            }, void 0, false, {
                                fileName: "[project]/src/components/dashboard/business-profile-selector.tsx",
                                lineNumber: 133,
                                columnNumber: 15
                            }, this),
                            "Campaign overrides",
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chevron$2d$down$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__ChevronDown$3e$__["ChevronDown"], {
                                className: `h-3 w-3 transition-transform ${showOverrides ? 'rotate-180' : ''}`
                            }, void 0, false, {
                                fileName: "[project]/src/components/dashboard/business-profile-selector.tsx",
                                lineNumber: 138,
                                columnNumber: 13
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/components/dashboard/business-profile-selector.tsx",
                        lineNumber: 126,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/components/dashboard/business-profile-selector.tsx",
                lineNumber: 89,
                columnNumber: 7
            }, this),
            value.mode === 'none' && !compact && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                className: "text-[11px] text-muted-foreground -mt-1",
                children: [
                    "Discovery, research, and outreach will run ",
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "text-foreground font-medium",
                        children: "without any business profile"
                    }, void 0, false, {
                        fileName: "[project]/src/components/dashboard/business-profile-selector.tsx",
                        lineNumber: 145,
                        columnNumber: 54
                    }, this),
                    " — no company context is applied and no default is substituted."
                ]
            }, void 0, true, {
                fileName: "[project]/src/components/dashboard/business-profile-selector.tsx",
                lineNumber: 144,
                columnNumber: 9
            }, this),
            selected && !compact && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                className: "text-[11px] text-muted-foreground -mt-1",
                children: [
                    "Outreach will be written as ",
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "text-foreground font-medium",
                        children: selected.companyName || selected.label
                    }, void 0, false, {
                        fileName: "[project]/src/components/dashboard/business-profile-selector.tsx",
                        lineNumber: 151,
                        columnNumber: 39
                    }, this),
                    selected.industry ? ` (${selected.industry})` : '',
                    " — from your profile defaults, plus any overrides below."
                ]
            }, void 0, true, {
                fileName: "[project]/src/components/dashboard/business-profile-selector.tsx",
                lineNumber: 150,
                columnNumber: 9
            }, this),
            showOverrides && !compact && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "grid sm:grid-cols-2 gap-2 p-3 rounded-lg bg-muted/30 border border-border/50",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$input$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Input"], {
                        value: value.overrides.objective ?? '',
                        onChange: setOverride('objective'),
                        placeholder: "Campaign objective (optional)",
                        className: "h-8 text-xs"
                    }, void 0, false, {
                        fileName: "[project]/src/components/dashboard/business-profile-selector.tsx",
                        lineNumber: 158,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$input$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Input"], {
                        value: value.overrides.audience ?? '',
                        onChange: setOverride('audience'),
                        placeholder: "Target audience for this campaign (optional)",
                        className: "h-8 text-xs"
                    }, void 0, false, {
                        fileName: "[project]/src/components/dashboard/business-profile-selector.tsx",
                        lineNumber: 159,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$input$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Input"], {
                        value: value.overrides.offer ?? '',
                        onChange: setOverride('offer'),
                        placeholder: "Specific offer to promote (optional)",
                        className: "h-8 text-xs"
                    }, void 0, false, {
                        fileName: "[project]/src/components/dashboard/business-profile-selector.tsx",
                        lineNumber: 160,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$input$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Input"], {
                        value: value.overrides.outcome ?? '',
                        onChange: setOverride('outcome'),
                        placeholder: "Desired outcome (optional)",
                        className: "h-8 text-xs"
                    }, void 0, false, {
                        fileName: "[project]/src/components/dashboard/business-profile-selector.tsx",
                        lineNumber: 161,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$input$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Input"], {
                        value: value.overrides.cta ?? '',
                        onChange: setOverride('cta'),
                        placeholder: "Call to action (optional)",
                        className: "h-8 text-xs"
                    }, void 0, false, {
                        fileName: "[project]/src/components/dashboard/business-profile-selector.tsx",
                        lineNumber: 162,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$input$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Input"], {
                        value: value.overrides.tone ?? '',
                        onChange: setOverride('tone'),
                        placeholder: "Tone override (optional)",
                        className: "h-8 text-xs"
                    }, void 0, false, {
                        fileName: "[project]/src/components/dashboard/business-profile-selector.tsx",
                        lineNumber: 163,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$textarea$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Textarea"], {
                        value: value.overrides.instructions ?? '',
                        onChange: setOverride('instructions'),
                        rows: 2,
                        placeholder: "Extra instructions for this campaign only (optional)",
                        className: "text-xs sm:col-span-2"
                    }, void 0, false, {
                        fileName: "[project]/src/components/dashboard/business-profile-selector.tsx",
                        lineNumber: 164,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: "text-[10px] text-muted-foreground sm:col-span-2",
                        children: [
                            "Overrides apply to this campaign only. Everything left blank inherits from",
                            selected ? ` "${selected.label}"` : ' your profile',
                            "."
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/components/dashboard/business-profile-selector.tsx",
                        lineNumber: 168,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/components/dashboard/business-profile-selector.tsx",
                lineNumber: 157,
                columnNumber: 9
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/components/dashboard/business-profile-selector.tsx",
        lineNumber: 88,
        columnNumber: 5
    }, this);
}
_s(BusinessProfileSelector, "hn/0oqy71H148XhhUdkME200udE=");
_c = BusinessProfileSelector;
var _c;
__turbopack_context__.k.register(_c, "BusinessProfileSelector");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/components/dashboard/discover-tab.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>DiscoverTab
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$useQuery$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/@tanstack/react-query/build/modern/useQuery.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$useMutation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/@tanstack/react-query/build/modern/useMutation.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$QueryClientProvider$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/@tanstack/react-query/build/modern/QueryClientProvider.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$framer$2d$motion$2f$dist$2f$es$2f$render$2f$components$2f$motion$2f$proxy$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/framer-motion/dist/es/render/components/motion/proxy.mjs [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$framer$2d$motion$2f$dist$2f$es$2f$components$2f$AnimatePresence$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/framer-motion/dist/es/components/AnimatePresence/index.mjs [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$search$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Search$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/search.js [app-client] (ecmascript) <export default as Search>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$sparkles$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Sparkles$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/sparkles.js [app-client] (ecmascript) <export default as Sparkles>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$plus$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Plus$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/plus.js [app-client] (ecmascript) <export default as Plus>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$loader$2d$circle$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Loader2$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/loader-circle.js [app-client] (ecmascript) <export default as Loader2>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$map$2d$pin$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__MapPin$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/map-pin.js [app-client] (ecmascript) <export default as MapPin>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$tag$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Tag$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/tag.js [app-client] (ecmascript) <export default as Tag>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$building$2d$2$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Building2$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/building-2.js [app-client] (ecmascript) <export default as Building2>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$zap$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Zap$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/zap.js [app-client] (ecmascript) <export default as Zap>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$file$2d$up$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__FileUp$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/file-up.js [app-client] (ecmascript) <export default as FileUp>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$clock$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Clock$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/clock.js [app-client] (ecmascript) <export default as Clock>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$eye$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Eye$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/eye.js [app-client] (ecmascript) <export default as Eye>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$trash$2d$2$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Trash2$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/trash-2.js [app-client] (ecmascript) <export default as Trash2>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$trending$2d$up$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__TrendingUp$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/trending-up.js [app-client] (ecmascript) <export default as TrendingUp>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$globe$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Globe$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/globe.js [app-client] (ecmascript) <export default as Globe>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$circle$2d$check$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__CheckCircle2$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/circle-check.js [app-client] (ecmascript) <export default as CheckCircle2>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$circle$2d$x$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__XCircle$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/circle-x.js [app-client] (ecmascript) <export default as XCircle>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$circle$2d$alert$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__AlertCircle$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/circle-alert.js [app-client] (ecmascript) <export default as AlertCircle>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chevron$2d$down$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__ChevronDown$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/chevron-down.js [app-client] (ecmascript) <export default as ChevronDown>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$layers$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Layers$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/layers.js [app-client] (ecmascript) <export default as Layers>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$pencil$2d$line$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__PencilLine$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/pencil-line.js [app-client] (ecmascript) <export default as PencilLine>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$sliders$2d$horizontal$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__SlidersHorizontal$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/sliders-horizontal.js [app-client] (ecmascript) <export default as SlidersHorizontal>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$users$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Users$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/users.js [app-client] (ecmascript) <export default as Users>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$shield$2d$check$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__ShieldCheck$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/shield-check.js [app-client] (ecmascript) <export default as ShieldCheck>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$mail$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Mail$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/mail.js [app-client] (ecmascript) <export default as Mail>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$phone$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Phone$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/phone.js [app-client] (ecmascript) <export default as Phone>");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/ui/card.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$input$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/ui/input.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$button$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/ui/button.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$badge$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/ui/badge.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$skeleton$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/ui/skeleton.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$separator$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/ui/separator.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$progress$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/ui/progress.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$alert$2d$dialog$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/ui/alert-dialog.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$select$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/ui/select.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$popover$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/ui/popover.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$command$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/ui/command.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$countries$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/countries.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/api.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/store.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/utils.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$dashboard$2f$lead$2d$import$2d$dialog$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/dashboard/lead-import-dialog.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$dashboard$2f$business$2d$profile$2d$selector$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/dashboard/business-profile-selector.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$sonner$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/sonner/dist/index.mjs [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature(), _s1 = __turbopack_context__.k.signature(), _s2 = __turbopack_context__.k.signature();
'use client';
;
;
;
;
;
;
;
;
;
;
;
;
;
;
;
;
;
;
;
;
;
;
// ─── Discovery Source Config ─────────────────────────────
const DISCOVERY_SOURCES = [
    {
        value: 'all',
        label: 'All Sources',
        icon: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$layers$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Layers$3e$__["Layers"],
        color: 'text-primary'
    },
    {
        value: 'ai_search',
        label: 'AI Search',
        icon: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$sparkles$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Sparkles$3e$__["Sparkles"],
        color: 'text-violet-500'
    },
    {
        value: 'google_maps',
        label: 'Google Maps',
        icon: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$map$2d$pin$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__MapPin$3e$__["MapPin"],
        color: 'text-red-500'
    },
    {
        value: 'google_business',
        label: 'Google Business',
        icon: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$globe$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Globe$3e$__["Globe"],
        color: 'text-blue-500'
    },
    {
        value: 'justdial',
        label: 'JustDial',
        icon: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$search$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Search$3e$__["Search"],
        color: 'text-yellow-500'
    },
    {
        value: 'indiamart',
        label: 'IndiaMart',
        icon: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$building$2d$2$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Building2$3e$__["Building2"],
        color: 'text-orange-500'
    },
    {
        value: 'yelp',
        label: 'Yelp',
        icon: Star,
        color: 'text-red-400'
    },
    {
        value: 'yellow_pages',
        label: 'Yellow Pages',
        icon: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$search$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Search$3e$__["Search"],
        color: 'text-yellow-600'
    },
    {
        value: 'sulekha',
        label: 'Sulekha',
        icon: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$globe$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Globe$3e$__["Globe"],
        color: 'text-teal-500'
    },
    {
        value: 'linkedin',
        label: 'LinkedIn',
        icon: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$building$2d$2$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Building2$3e$__["Building2"],
        color: 'text-blue-600'
    },
    {
        value: 'instagram',
        label: 'Instagram',
        icon: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$globe$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Globe$3e$__["Globe"],
        color: 'text-pink-500'
    },
    {
        value: 'facebook',
        label: 'Facebook',
        icon: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$globe$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Globe$3e$__["Globe"],
        color: 'text-blue-500'
    }
];
// Sources fanned out when "All Sources" is selected (must match server-side ALL_DISCOVERY_SOURCES)
const ALL_SOURCES_COUNT = 7;
function Star(props) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("svg", {
        xmlns: "http://www.w3.org/2000/svg",
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: "2",
        strokeLinecap: "round",
        strokeLinejoin: "round",
        ...props,
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("polygon", {
            points: "12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"
        }, void 0, false, {
            fileName: "[project]/src/components/dashboard/discover-tab.tsx",
            lineNumber: 100,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/src/components/dashboard/discover-tab.tsx",
        lineNumber: 99,
        columnNumber: 5
    }, this);
}
_c = Star;
/** The status API returns imported/duplicates/failed — normalize once so
 *  the UI never renders "undefined leads found" after completion. */ function normalizeJobFromApi(raw) {
    return {
        ...raw,
        leadsAdded: raw.leadsAdded ?? raw.imported ?? 0,
        duplicatesSkipped: raw.duplicatesSkipped ?? raw.duplicates ?? 0,
        errors: raw.errors ?? raw.failed ?? 0,
        filteredOut: raw.filteredOut ?? 0
    };
}
/** One logical discovery start = one request id (sent to the server so a
 *  replayed POST returns the SAME job instead of creating + charging a
 *  second one). crypto.randomUUID is unavailable on non-secure origins. */ function newRequestId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `req-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
/** Human label for the parsed hard criteria (badges + honest notices). */ function describeCriteria(criteria) {
    if (!criteria) return '';
    const parts = [];
    if (criteria.exactEmployeeCount != null) parts.push(`exactly ${criteria.exactEmployeeCount} employees`);
    else if (criteria.employeeMin != null && criteria.employeeMax != null) parts.push(`${criteria.employeeMin}–${criteria.employeeMax} employees`);
    else if (criteria.employeeMin != null) parts.push(`≥ ${criteria.employeeMin} employees`);
    else if (criteria.employeeMax != null) parts.push(`≤ ${criteria.employeeMax} employees`);
    if (criteria.website === 'required') parts.push('website required');
    if (criteria.website === 'absent') parts.push('no website');
    if (criteria.excludeTypes?.length) parts.push(`excludes: ${criteria.excludeTypes.join(', ')}`);
    return parts.join(' · ');
}
// ─── Helper Functions ────────────────────────────────────
function getScoreBorderColor(score) {
    if (score >= 70) return 'border-t-emerald-500';
    if (score >= 40) return 'border-t-amber-500';
    return 'border-t-red-500';
}
function getScoreBarClass(score) {
    if (score >= 70) return 'bg-emerald-500';
    if (score >= 40) return 'bg-amber-500';
    return 'bg-red-500';
}
function formatRelativeTime(dateStr) {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
    });
}
const STATUS_STYLES = {
    pending: 'bg-yellow-500/15 text-yellow-500 border-yellow-500/25',
    running: 'bg-blue-500/15 text-blue-500 border-blue-500/25',
    completed: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/25',
    failed: 'bg-red-500/15 text-red-500 border-red-500/25'
};
const STATUS_ICONS = {
    pending: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$clock$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Clock$3e$__["Clock"],
    running: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$loader$2d$circle$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Loader2$3e$__["Loader2"],
    completed: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$circle$2d$check$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__CheckCircle2$3e$__["CheckCircle2"],
    failed: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$circle$2d$x$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__XCircle$3e$__["XCircle"]
};
// ─── Recent Discovery Jobs List ──────────────────────────
function DiscoveryJobsList({ onJobClick }) {
    _s();
    const [jobs, setJobs] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])({
        "DiscoveryJobsList.useState": ()=>{
            if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
            ;
            try {
                const stored = localStorage.getItem('acquisitionos_discovery_jobs');
                return stored ? JSON.parse(stored) : [];
            } catch  {
                return [];
            }
        }
    }["DiscoveryJobsList.useState"]);
    const loading = false;
    if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
    ;
    if (jobs.length === 0) return null;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "space-y-2",
        children: jobs.slice(0, 5).map((job)=>{
            const StatusIcon = STATUS_ICONS[job.status] || __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$clock$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Clock$3e$__["Clock"];
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$framer$2d$motion$2f$dist$2f$es$2f$render$2f$components$2f$motion$2f$proxy$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["motion"].button, {
                initial: {
                    opacity: 0,
                    x: -10
                },
                animate: {
                    opacity: 1,
                    x: 0
                },
                onClick: ()=>onJobClick(job),
                className: "w-full flex items-center gap-3 p-3 rounded-lg border border-border/50 bg-muted/30 hover:bg-muted/60 hover:border-primary/20 transition-colors text-left",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex items-center justify-center h-9 w-9 rounded-lg bg-primary/10 shrink-0",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(StatusIcon, {
                            className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])('h-4 w-4', job.status === 'running' && 'animate-spin', STATUS_STYLES[job.status]?.split(' ')[1])
                        }, void 0, false, {
                            fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                            lineNumber: 305,
                            columnNumber: 15
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                        lineNumber: 304,
                        columnNumber: 13
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex-1 min-w-0",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                className: "text-xs font-medium truncate",
                                children: [
                                    job.niche,
                                    " · ",
                                    job.country,
                                    job.city ? ` · ${job.city}` : ''
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                lineNumber: 308,
                                columnNumber: 15
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "flex items-center gap-2 mt-0.5",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$badge$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Badge"], {
                                        variant: "outline",
                                        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])('text-[9px] border', STATUS_STYLES[job.status]),
                                        children: job.status
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                        lineNumber: 312,
                                        columnNumber: 17
                                    }, this),
                                    job.status === 'completed' && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "text-[10px] text-muted-foreground",
                                        children: [
                                            job.leadsAdded,
                                            " leads found"
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                        lineNumber: 316,
                                        columnNumber: 19
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                lineNumber: 311,
                                columnNumber: 15
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                        lineNumber: 307,
                        columnNumber: 13
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "shrink-0 text-right",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                            className: "text-[10px] text-muted-foreground",
                            children: formatRelativeTime(job.createdAt)
                        }, void 0, false, {
                            fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                            lineNumber: 323,
                            columnNumber: 15
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                        lineNumber: 322,
                        columnNumber: 13
                    }, this)
                ]
            }, job.id, true, {
                fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                lineNumber: 297,
                columnNumber: 11
            }, this);
        })
    }, void 0, false, {
        fileName: "[project]/src/components/dashboard/discover-tab.tsx",
        lineNumber: 293,
        columnNumber: 5
    }, this);
}
_s(DiscoveryJobsList, "3jj7FE8ZdVn48VXG0i8Z8YBs0Dg=");
_c1 = DiscoveryJobsList;
// ─── Discovery Job Progress Card ─────────────────────────
function DiscoveryJobProgress({ job, onComplete }) {
    _s1();
    const [currentJob, setCurrentJob] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(job);
    const intervalRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(null);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "DiscoveryJobProgress.useEffect": ()=>{
            if (currentJob.status !== 'running' && currentJob.status !== 'pending') return;
            intervalRef.current = setInterval({
                "DiscoveryJobProgress.useEffect": async ()=>{
                    try {
                        const res = await fetch(`/api/leads/discover/status/${currentJob.id}`);
                        if (res.ok) {
                            const data = await res.json();
                            const updatedJob = normalizeJobFromApi(data.job);
                            setCurrentJob(updatedJob);
                            if (updatedJob.status === 'completed' || updatedJob.status === 'failed') {
                                if (intervalRef.current) clearInterval(intervalRef.current);
                                onComplete(updatedJob);
                                // Update localStorage
                                try {
                                    const stored = localStorage.getItem('acquisitionos_discovery_jobs');
                                    const jobs = stored ? JSON.parse(stored) : [];
                                    const idx = jobs.findIndex({
                                        "DiscoveryJobProgress.useEffect.idx": (j)=>j.id === updatedJob.id
                                    }["DiscoveryJobProgress.useEffect.idx"]);
                                    if (idx >= 0) jobs[idx] = updatedJob;
                                    else jobs.unshift(updatedJob);
                                    localStorage.setItem('acquisitionos_discovery_jobs', JSON.stringify(jobs.slice(0, 20)));
                                } catch  {}
                            }
                        }
                    } catch  {}
                }
            }["DiscoveryJobProgress.useEffect"], 3000);
            return ({
                "DiscoveryJobProgress.useEffect": ()=>{
                    if (intervalRef.current) clearInterval(intervalRef.current);
                }
            })["DiscoveryJobProgress.useEffect"];
        }
    }["DiscoveryJobProgress.useEffect"], [
        currentJob.id,
        currentJob.status,
        onComplete
    ]);
    const progress = currentJob.status === 'completed' ? 100 : currentJob.status === 'running' ? 60 : currentJob.status === 'pending' ? 10 : 0;
    const progressSteps = [
        {
            label: 'Connecting',
            done: progress >= 10
        },
        {
            label: 'Searching',
            done: progress >= 40
        },
        {
            label: 'Analyzing',
            done: progress >= 60
        },
        {
            label: 'Complete',
            done: progress >= 100
        }
    ];
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Card"], {
        className: "border-primary/20 overflow-hidden",
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["CardContent"], {
            className: "p-4 space-y-3",
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "flex items-center justify-between",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "flex items-center gap-2",
                            children: [
                                currentJob.status === 'running' || currentJob.status === 'pending' ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "relative",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$loader$2d$circle$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Loader2$3e$__["Loader2"], {
                                            className: "h-4 w-4 animate-spin text-primary"
                                        }, void 0, false, {
                                            fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                            lineNumber: 397,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "absolute inset-0 rounded-full animate-ping bg-primary/20"
                                        }, void 0, false, {
                                            fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                            lineNumber: 398,
                                            columnNumber: 17
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                    lineNumber: 396,
                                    columnNumber: 15
                                }, this) : currentJob.status === 'completed' ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$circle$2d$check$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__CheckCircle2$3e$__["CheckCircle2"], {
                                    className: "h-4 w-4 text-emerald-500"
                                }, void 0, false, {
                                    fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                    lineNumber: 401,
                                    columnNumber: 15
                                }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$circle$2d$x$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__XCircle$3e$__["XCircle"], {
                                    className: "h-4 w-4 text-red-500"
                                }, void 0, false, {
                                    fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                    lineNumber: 403,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    className: "text-sm font-medium",
                                    children: currentJob.status === 'pending' ? 'Queuing discovery...' : currentJob.status === 'running' ? 'Discovering leads...' : currentJob.status === 'completed' ? 'Discovery complete!' : 'Discovery failed'
                                }, void 0, false, {
                                    fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                    lineNumber: 405,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                            lineNumber: 394,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$badge$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Badge"], {
                            variant: "outline",
                            className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])('text-[10px] border', STATUS_STYLES[currentJob.status]),
                            children: currentJob.status
                        }, void 0, false, {
                            fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                            lineNumber: 412,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                    lineNumber: 393,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$progress$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Progress"], {
                    value: progress,
                    className: "h-2"
                }, void 0, false, {
                    fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                    lineNumber: 416,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "flex items-center gap-1",
                    children: progressSteps.map((step, i)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "flex items-center gap-1 flex-1",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])('h-1.5 w-1.5 rounded-full shrink-0 transition-colors', step.done ? 'bg-primary' : 'bg-muted-foreground/20')
                                }, void 0, false, {
                                    fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                    lineNumber: 421,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])('text-[9px] truncate transition-colors', step.done ? 'text-primary font-medium' : 'text-muted-foreground/50'),
                                    children: step.label
                                }, void 0, false, {
                                    fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                    lineNumber: 425,
                                    columnNumber: 15
                                }, this),
                                i < progressSteps.length - 1 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])('flex-1 h-px', step.done ? 'bg-primary/40' : 'bg-muted-foreground/10')
                                }, void 0, false, {
                                    fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                    lineNumber: 430,
                                    columnNumber: 17
                                }, this)
                            ]
                        }, step.label, true, {
                            fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                            lineNumber: 420,
                            columnNumber: 13
                        }, this))
                }, void 0, false, {
                    fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                    lineNumber: 418,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "flex items-center justify-between text-xs text-muted-foreground",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            children: [
                                currentJob.niche,
                                " · ",
                                currentJob.country,
                                currentJob.city ? ` · ${currentJob.city}` : ''
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                            lineNumber: 436,
                            columnNumber: 11
                        }, this),
                        currentJob.status === 'completed' && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "text-emerald-500 font-medium",
                            children: [
                                currentJob.leadsAdded,
                                " verified lead",
                                currentJob.leadsAdded === 1 ? '' : 's',
                                " found",
                                currentJob.filteredOut ? ` · ${currentJob.filteredOut} rejected by hard filters` : ''
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                            lineNumber: 438,
                            columnNumber: 13
                        }, this),
                        currentJob.status === 'failed' && (currentJob.errorMessage || currentJob.message) && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "text-red-500 truncate max-w-[280px]",
                            title: currentJob.errorMessage || currentJob.message,
                            children: currentJob.errorMessage || currentJob.message
                        }, void 0, false, {
                            fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                            lineNumber: 444,
                            columnNumber: 13
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                    lineNumber: 435,
                    columnNumber: 9
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/src/components/dashboard/discover-tab.tsx",
            lineNumber: 392,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/src/components/dashboard/discover-tab.tsx",
        lineNumber: 391,
        columnNumber: 5
    }, this);
}
_s1(DiscoveryJobProgress, "67bqAU5wRbSj+dZdqRXt+dH3/6E=");
_c2 = DiscoveryJobProgress;
// ─── Discovered Lead Card ────────────────────────────────
function DiscoveredLeadCard({ lead, onAddToPipeline, onViewDetails, isAdding, isAdded }) {
    const scoreBorder = getScoreBorderColor(lead.conversionScore);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$framer$2d$motion$2f$dist$2f$es$2f$render$2f$components$2f$motion$2f$proxy$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["motion"].div, {
        initial: {
            opacity: 0,
            y: 20,
            scale: 0.95
        },
        animate: {
            opacity: 1,
            y: 0,
            scale: 1
        },
        transition: {
            type: 'spring',
            stiffness: 300,
            damping: 25
        },
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Card"], {
            className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])('card-glow card-shine border-t-4 hover-lift transition-all cursor-pointer group', scoreBorder),
            onClick: ()=>onViewDetails(lead.id),
            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["CardContent"], {
                className: "p-4 space-y-3",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex items-start gap-2",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "flex items-center justify-center h-10 w-10 rounded-xl bg-primary/10 text-primary font-bold text-sm shrink-0 group-hover:bg-primary/20 transition-colors",
                                children: lead.businessName.charAt(0).toUpperCase()
                            }, void 0, false, {
                                fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                lineNumber: 481,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "flex-1 min-w-0",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h4", {
                                        className: "font-semibold text-sm truncate group-hover:text-primary transition-colors",
                                        children: lead.businessName
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                        lineNumber: 485,
                                        columnNumber: 15
                                    }, this),
                                    lead.ownerName && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                        className: "text-xs text-muted-foreground mt-0.5",
                                        children: lead.ownerName
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                        lineNumber: 487,
                                        columnNumber: 17
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                lineNumber: 484,
                                columnNumber: 13
                            }, this),
                            lead.source && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$badge$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Badge"], {
                                variant: "outline",
                                className: "text-[10px] shrink-0",
                                children: lead.source
                            }, void 0, false, {
                                fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                lineNumber: 491,
                                columnNumber: 15
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                        lineNumber: 480,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex items-center gap-2 text-xs text-muted-foreground",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$map$2d$pin$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__MapPin$3e$__["MapPin"], {
                                className: "h-3 w-3 shrink-0"
                            }, void 0, false, {
                                fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                lineNumber: 498,
                                columnNumber: 13
                            }, this),
                            [
                                lead.city,
                                lead.country
                            ].filter(Boolean).join(', ') || 'Unknown location'
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                        lineNumber: 497,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex flex-wrap items-center gap-1.5",
                        children: [
                            lead.email ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$badge$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Badge"], {
                                variant: "outline",
                                className: "text-[10px] gap-1 bg-emerald-500/10 border-emerald-500/25 text-emerald-600 dark:text-emerald-400",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$mail$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Mail$3e$__["Mail"], {
                                        className: "h-3 w-3"
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                        lineNumber: 512,
                                        columnNumber: 17
                                    }, this),
                                    " Email"
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                lineNumber: 511,
                                columnNumber: 15
                            }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$badge$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Badge"], {
                                variant: "outline",
                                className: "text-[10px] gap-1 text-muted-foreground",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$circle$2d$x$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__XCircle$3e$__["XCircle"], {
                                        className: "h-3 w-3"
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                        lineNumber: 516,
                                        columnNumber: 17
                                    }, this),
                                    " No email"
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                lineNumber: 515,
                                columnNumber: 15
                            }, this),
                            lead.phone && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$badge$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Badge"], {
                                variant: "outline",
                                className: "text-[10px] gap-1 bg-sky-500/10 border-sky-500/25 text-sky-600 dark:text-sky-400",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$phone$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Phone$3e$__["Phone"], {
                                        className: "h-3 w-3"
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                        lineNumber: 521,
                                        columnNumber: 17
                                    }, this),
                                    " Phone"
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                lineNumber: 520,
                                columnNumber: 15
                            }, this),
                            lead.website && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$badge$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Badge"], {
                                variant: "outline",
                                className: "text-[10px] gap-1 bg-violet-500/10 border-violet-500/25 text-violet-600 dark:text-violet-400",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$globe$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Globe$3e$__["Globe"], {
                                        className: "h-3 w-3"
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                        lineNumber: 526,
                                        columnNumber: 17
                                    }, this),
                                    " Website"
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                lineNumber: 525,
                                columnNumber: 15
                            }, this),
                            !lead.email && !lead.phone && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "text-[10px] text-muted-foreground",
                                children: "Manual / research follow-up required"
                            }, void 0, false, {
                                fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                lineNumber: 530,
                                columnNumber: 15
                            }, this),
                            lead.verificationStatus === 'unverified' && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$badge$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Badge"], {
                                variant: "outline",
                                className: "text-[10px] gap-1 text-muted-foreground",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$circle$2d$alert$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__AlertCircle$3e$__["AlertCircle"], {
                                        className: "h-3 w-3"
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                        lineNumber: 536,
                                        columnNumber: 17
                                    }, this),
                                    " Unverified"
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                lineNumber: 535,
                                columnNumber: 15
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                        lineNumber: 509,
                        columnNumber: 11
                    }, this),
                    (typeof lead.employeeCount === 'number' || lead.employeeRange) && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex items-center gap-2 text-xs",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$users$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Users$3e$__["Users"], {
                                className: "h-3 w-3 shrink-0 text-muted-foreground"
                            }, void 0, false, {
                                fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                lineNumber: 545,
                                columnNumber: 15
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "font-medium text-foreground",
                                children: [
                                    "Employees: ",
                                    typeof lead.employeeCount === 'number' ? lead.employeeCount.toLocaleString() : `${lead.employeeRange} (provider range)`
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                lineNumber: 546,
                                columnNumber: 15
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                        lineNumber: 544,
                        columnNumber: 13
                    }, this),
                    lead.rating && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex items-center gap-1",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Star, {
                                className: "h-3 w-3 text-amber-500 fill-amber-500"
                            }, void 0, false, {
                                fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                lineNumber: 556,
                                columnNumber: 15
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "text-xs font-medium",
                                children: lead.rating.toFixed(1)
                            }, void 0, false, {
                                fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                lineNumber: 557,
                                columnNumber: 15
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                        lineNumber: 555,
                        columnNumber: 13
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "space-y-2",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "space-y-1",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "flex justify-between text-xs",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "text-muted-foreground",
                                            children: "Conversion"
                                        }, void 0, false, {
                                            fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                            lineNumber: 564,
                                            columnNumber: 17
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "font-mono font-medium text-emerald-500",
                                            children: [
                                                lead.conversionScore,
                                                "%"
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                            lineNumber: 565,
                                            columnNumber: 17
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                    lineNumber: 563,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "w-full bg-muted rounded-full h-1.5",
                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])('rounded-full h-1.5 transition-all', getScoreBarClass(lead.conversionScore)),
                                        style: {
                                            width: `${lead.conversionScore}%`
                                        }
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                        lineNumber: 568,
                                        columnNumber: 17
                                    }, this)
                                }, void 0, false, {
                                    fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                    lineNumber: 567,
                                    columnNumber: 15
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                            lineNumber: 562,
                            columnNumber: 13
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                        lineNumber: 561,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$separator$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Separator"], {}, void 0, false, {
                        fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                        lineNumber: 576,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex gap-2",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$button$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Button"], {
                                size: "sm",
                                variant: "secondary",
                                className: "flex-1 gap-1 active:scale-95 transition-all min-h-[36px]",
                                disabled: isAdded || isAdding,
                                onClick: (e)=>{
                                    e.stopPropagation();
                                    onAddToPipeline(lead.id);
                                },
                                children: [
                                    isAdding ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$loader$2d$circle$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Loader2$3e$__["Loader2"], {
                                        className: "h-3.5 w-3.5 animate-spin"
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                        lineNumber: 590,
                                        columnNumber: 17
                                    }, this) : isAdded ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$circle$2d$check$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__CheckCircle2$3e$__["CheckCircle2"], {
                                        className: "h-3.5 w-3.5 text-emerald-500"
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                        lineNumber: 592,
                                        columnNumber: 17
                                    }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$plus$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Plus$3e$__["Plus"], {
                                        className: "h-3.5 w-3.5"
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                        lineNumber: 594,
                                        columnNumber: 17
                                    }, this),
                                    isAdded ? 'In Pipeline' : 'Add to Pipeline'
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                lineNumber: 579,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$button$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Button"], {
                                size: "sm",
                                variant: "outline",
                                onClick: (e)=>{
                                    e.stopPropagation();
                                    onViewDetails(lead.id);
                                },
                                className: "gap-1 border-primary/20 hover:bg-primary/10 active:scale-95 transition-all min-h-[36px]",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$eye$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Eye$3e$__["Eye"], {
                                        className: "h-3.5 w-3.5"
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                        lineNumber: 607,
                                        columnNumber: 15
                                    }, this),
                                    "View"
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                lineNumber: 598,
                                columnNumber: 13
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                        lineNumber: 578,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                lineNumber: 479,
                columnNumber: 9
            }, this)
        }, void 0, false, {
            fileName: "[project]/src/components/dashboard/discover-tab.tsx",
            lineNumber: 476,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/src/components/dashboard/discover-tab.tsx",
        lineNumber: 471,
        columnNumber: 5
    }, this);
}
_c3 = DiscoveredLeadCard;
function DiscoverTab() {
    _s2();
    const queryClient = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$QueryClientProvider$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useQueryClient"])();
    const { setSelectedLeadId, setActiveTab } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAppStore"])();
    // Fetch real-time source configuration status (drives dropdown hints + config banner)
    const { data: sourceStatusData } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$useQuery$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useQuery"])({
        queryKey: [
            'discovery-source-status'
        ],
        queryFn: {
            "DiscoverTab.useQuery": async ()=>{
                const res = await fetch('/api/discovery/sources');
                if (!res.ok) throw new Error('Failed to load source status');
                const data = await res.json();
                return data.sources;
            }
        }["DiscoverTab.useQuery"],
        staleTime: 60_000
    });
    const sourceStatuses = sourceStatusData ?? [];
    const sourceStatusById = new Map(sourceStatuses.map((s)=>[
            s.id,
            s
        ]));
    // Form state
    const [source, setSource] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])('ai_search');
    const [niche, setNiche] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])('');
    const [country, setCountry] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])('');
    const [countryOpen, setCountryOpen] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const [city, setCity] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])('');
    // Search mode: classic filters or AI chat
    const [searchMode, setSearchMode] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])('filters');
    // BUSINESS CONTEXT (spec §3/§7): selected business profile + campaign
    // overrides, sent with every discovery job and persisted with it.
    // mode 'none' = the user explicitly chose NO business context.
    const [profileSelection, setProfileSelection] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])({
        mode: 'default',
        businessProfileId: null,
        overrides: {}
    });
    const [aiQuery, setAiQuery] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])('');
    const [aiParsing, setAiParsing] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const [parsedIntent, setParsedIntent] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    // "All Sources" credit-cost confirmation
    const [allSourcesConfirmOpen, setAllSourcesConfirmOpen] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const [pendingStart, setPendingStart] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(undefined);
    // The exact config message for the currently selected source (empty when usable).
    // Unconfigured sources are shown in the dropdown but can NEVER run — no fake data.
    const selectedSourceStatus = source !== 'all' ? sourceStatusById.get(source) : undefined;
    const selectedSourceBlocked = !!selectedSourceStatus && selectedSourceStatus.status !== 'connected';
    const selectedSourceConfigMessage = selectedSourceBlocked ? selectedSourceStatus.configMessage || `${selectedSourceStatus.label} requires API configuration. Go to Settings → Integrations to connect this source.` : '';
    // Jobs state
    const [activeJob, setActiveJob] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [discoveredLeads, setDiscoveredLeads] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])([]);
    // Honest verified-matches notice — shown when hard filters returned fewer
    // verified companies than requested. Never padded with unverified leads.
    const [honestMatchNotice, setHonestMatchNotice] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [addedIds, setAddedIds] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(new Set());
    const [pipelineAddingIds, setPipelineAddingIds] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(new Set());
    const [importOpen, setImportOpen] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    // Discovery history
    const [discoveryHistory, setDiscoveryHistory] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])([]);
    // Load history
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "DiscoverTab.useEffect": ()=>{
            try {
                const stored = localStorage.getItem('acquisitionos_discovery_history');
                if (stored) setDiscoveryHistory(JSON.parse(stored));
            } catch  {}
        }
    }["DiscoverTab.useEffect"], []);
    // RESUME, NEVER RESTART: on mount, reconcile with SERVER-side job state.
    // Tab switches unmount this component while a chargeable job keeps
    // running server-side; returning must re-attach to the SAME job (same
    // id, same polling, same completion path) — never start a new one and
    // never charge again. Server truth (DB) is the source; localStorage is
    // display history only.
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "DiscoverTab.useEffect": ()=>{
            let cancelled = false;
            ({
                "DiscoverTab.useEffect": async ()=>{
                    try {
                        const res = await fetch('/api/discovery/status');
                        if (!res.ok) return;
                        const data = await res.json();
                        if (cancelled || !data?.jobId || !data?.running) return;
                        setActiveJob(normalizeJobFromApi({
                            id: data.jobId,
                            status: data.status,
                            source: data.source ?? 'ai_search',
                            niche: data.niche ?? '',
                            country: data.country ?? '',
                            city: data.city ?? undefined,
                            totalFound: data.totalFound ?? 0,
                            createdAt: data.createdAt ?? new Date().toISOString()
                        }));
                    } catch  {}
                }
            })["DiscoverTab.useEffect"]();
            return ({
                "DiscoverTab.useEffect": ()=>{
                    cancelled = true;
                }
            })["DiscoverTab.useEffect"];
        }
    }["DiscoverTab.useEffect"], []);
    // Fetch recently discovered leads
    const { data: allLeadsResult } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$useQuery$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useQuery"])({
        queryKey: [
            'leads',
            {
                source: 'discovery'
            }
        ],
        queryFn: {
            "DiscoverTab.useQuery": ()=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fetchLeads"])({
                    limit: 20
                })
        }["DiscoverTab.useQuery"]
    });
    const recentlyDiscovered = allLeadsResult?.leads?.filter((l)=>l.source === 'discovery')?.sort((a, b)=>new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())?.slice(0, 5) ?? [];
    // Popular niches from lead data
    const popularNiches = (()=>{
        if (!allLeadsResult?.leads) return [];
        const nicheCounts = {};
        allLeadsResult.leads.forEach((l)=>{
            if (l.niche) nicheCounts[l.niche] = (nicheCounts[l.niche] || 0) + 1;
        });
        return Object.entries(nicheCounts).map(([name, count])=>({
                name,
                count
            })).sort((a, b)=>b.count - a.count).slice(0, 8);
    })();
    // Start discovery mutation — accepts explicit variables (AI Chat Mode) or falls back to filter state
    const discoverMutation = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$useMutation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMutation"])({
        mutationFn: {
            "DiscoverTab.useMutation[discoverMutation]": async (vars)=>{
                const payload = {
                    niche: (vars?.niche ?? niche).trim(),
                    country: (vars?.country ?? country).trim() || undefined,
                    city: (vars?.city ?? city).trim() || undefined,
                    source: vars?.source ?? source,
                    maxResults: vars?.maxResults || undefined,
                    requirements: vars?.requirements || undefined,
                    // Structured HARD criteria from the AI parser — enforced server-side
                    criteria: vars?.criteria || undefined,
                    // BUSINESS CONTEXT (spec §3): selected profile + campaign overrides,
                    // persisted with the job and resolved (ownership-checked) server-side.
                    // EXPLICIT None: mode 'none' sends useBusinessContext:false so the
                    // server never substitutes the default profile.
                    businessProfileId: profileSelection.mode === 'none' ? null : profileSelection.businessProfileId,
                    useBusinessContext: profileSelection.mode === 'none' ? false : undefined,
                    campaign: Object.fromEntries(Object.entries(profileSelection.overrides).filter({
                        "DiscoverTab.useMutation[discoverMutation]": ([, v])=>(v ?? '').trim()
                    }["DiscoverTab.useMutation[discoverMutation]"])),
                    // Operation identity: retries of THIS start reuse the same key, so
                    // the server returns the same job instead of charging again.
                    requestId: vars?.requestId
                };
                const res = await fetch('/api/leads/discover', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(payload)
                });
                if (!res.ok) {
                    const data = await res.json().catch({
                        "DiscoverTab.useMutation[discoverMutation]": ()=>({})
                    }["DiscoverTab.useMutation[discoverMutation]"]);
                    throw new Error(data.error || 'Failed to start discovery');
                }
                const data = await res.json();
                return {
                    data,
                    payload
                };
            }
        }["DiscoverTab.useMutation[discoverMutation]"],
        onSuccess: {
            "DiscoverTab.useMutation[discoverMutation]": ({ data, payload })=>{
                const job = {
                    id: data.jobId,
                    status: data.status || 'pending',
                    source: payload.source,
                    niche: payload.niche,
                    country: payload.country || '',
                    city: payload.city,
                    totalFound: 0,
                    leadsAdded: 0,
                    duplicatesSkipped: 0,
                    errors: 0,
                    createdAt: new Date().toISOString(),
                    message: data.message
                };
                setActiveJob(job);
                // Save to localStorage
                try {
                    const stored = localStorage.getItem('acquisitionos_discovery_jobs');
                    const jobs = stored ? JSON.parse(stored) : [];
                    if (!jobs.some({
                        "DiscoverTab.useMutation[discoverMutation]": (j)=>j.id === job.id
                    }["DiscoverTab.useMutation[discoverMutation]"])) {
                        jobs.unshift(job);
                        localStorage.setItem('acquisitionos_discovery_jobs', JSON.stringify(jobs.slice(0, 20)));
                    }
                } catch  {}
                if (data.deduped) {
                    // The server recognized this operation (retry/replay/identical
                    // active search) and returned the SAME job — no new start, no new
                    // charge. Say so instead of pretending a new job began.
                    __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$sonner$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toast"].info('Discovery already running', {
                        description: data.message || 'Showing the progress of the existing discovery job.'
                    });
                } else {
                    __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$sonner$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toast"].success('Discovery job started!', {
                        description: `Searching ${payload.niche} in ${payload.country}...`
                    });
                }
            }
        }["DiscoverTab.useMutation[discoverMutation]"],
        onError: {
            "DiscoverTab.useMutation[discoverMutation]": (error)=>{
                __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$sonner$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toast"].error('Failed to start discovery', {
                    description: error.message
                });
            }
        }["DiscoverTab.useMutation[discoverMutation]"]
    });
    // Central start handler — "All Sources" requires a credit-cost confirmation first.
    // Every logical start gets ONE request id; retries and the confirm dialog
    // reuse it so the server can never create a second chargeable job.
    const handleStartDiscovery = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "DiscoverTab.useCallback[handleStartDiscovery]": (vars)=>{
            const withId = {
                niche: vars?.niche ?? niche,
                country: vars?.country ?? country,
                city: vars?.city,
                source: vars?.source ?? source,
                maxResults: vars?.maxResults,
                requirements: vars?.requirements,
                criteria: vars?.criteria,
                requestId: vars?.requestId ?? newRequestId()
            };
            if ((vars?.source ?? source) === 'all') {
                setPendingStart(withId);
                setAllSourcesConfirmOpen(true);
                return;
            }
            discoverMutation.mutate(withId);
        }
    }["DiscoverTab.useCallback[handleStartDiscovery]"], [
        source,
        niche,
        country,
        discoverMutation
    ]);
    // ── AI Chat Mode handlers ────────────────────────────────
    const handleAiParse = async ()=>{
        const query = aiQuery.trim();
        if (!query || aiParsing) return;
        setAiParsing(true);
        setParsedIntent(null);
        try {
            const res = await fetch('/api/discovery/parse-intent', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    query
                })
            });
            const data = await res.json().catch(()=>({}));
            if (!res.ok) throw new Error(data.error || 'Failed to read your request');
            setParsedIntent(data.parsed);
        } catch (err) {
            __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$sonner$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toast"].error('Could not read your request', {
                description: err instanceof Error ? err.message : 'Please try rephrasing your description.'
            });
        } finally{
            setAiParsing(false);
        }
    };
    const handleEditFilters = ()=>{
        // Fill the existing filter fields with the parsed values and switch to Filter Mode
        if (parsedIntent) {
            setNiche(parsedIntent.niche);
            setCountry(parsedIntent.country);
            setCity(parsedIntent.city || '');
        }
        setSearchMode('filters');
    };
    // Credit-cost estimate shown in the "All Sources" confirmation
    const allSourcesCreditsEstimate = (()=>{
        const explicitCount = searchMode === 'ai' && parsedIntent ? parsedIntent.count ?? 0 : 0;
        const perSource = explicitCount > 0 ? Math.max(5, Math.ceil(explicitCount / ALL_SOURCES_COUNT)) : 10;
        return ALL_SOURCES_COUNT * perSource;
    })();
    // Handle job completion
    const handleJobComplete = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "DiscoverTab.useCallback[handleJobComplete]": (completedJob)=>{
            setActiveJob(completedJob);
            if (completedJob.status === 'completed') {
                __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$sonner$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toast"].success('Discovery complete!', {
                    description: `Found ${completedJob.leadsAdded} verified leads${completedJob.filteredOut ? ` (${completedJob.filteredOut} rejected by hard filters)` : ''}`
                });
                queryClient.invalidateQueries({
                    queryKey: [
                        'leads'
                    ]
                });
                // Honest verified-matches notice: when the user asked for N companies
                // and hard-filter enforcement returned fewer, say so explicitly —
                // the remaining slots are NEVER filled with loosely-related companies.
                const requested = searchMode === 'ai' ? parsedIntent?.count ?? undefined : undefined;
                if (requested && completedJob.leadsAdded < requested) {
                    setHonestMatchNotice(`${completedJob.leadsAdded} verified match${completedJob.leadsAdded === 1 ? '' : 'es'} found. We couldn't verify additional companies that meet all your criteria.`);
                } else {
                    setHonestMatchNotice(null);
                }
                // Refresh discovered leads
                (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fetchLeads"])({
                    limit: 50
                }).then({
                    "DiscoverTab.useCallback[handleJobComplete]": (result)=>{
                        const newDiscovered = result.leads.filter({
                            "DiscoverTab.useCallback[handleJobComplete].newDiscovered": (l)=>l.source === 'discovery' || l.stage === 'discovered'
                        }["DiscoverTab.useCallback[handleJobComplete].newDiscovered"]).sort({
                            "DiscoverTab.useCallback[handleJobComplete].newDiscovered": (a, b)=>new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                        }["DiscoverTab.useCallback[handleJobComplete].newDiscovered"]).slice(0, 20);
                        setDiscoveredLeads(newDiscovered);
                    }
                }["DiscoverTab.useCallback[handleJobComplete]"]);
                // Add to history
                try {
                    const history = [
                        ...discoveryHistory
                    ];
                    history.unshift({
                        niche: completedJob.niche,
                        country: completedJob.country,
                        city: completedJob.city || '',
                        resultCount: completedJob.leadsAdded,
                        timestamp: Date.now()
                    });
                    const trimmed = history.slice(0, 10);
                    setDiscoveryHistory(trimmed);
                    localStorage.setItem('acquisitionos_discovery_history', JSON.stringify(trimmed));
                } catch  {}
            } else if (completedJob.status === 'failed') {
                __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$sonner$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toast"].error('Discovery failed', {
                    description: completedJob.message || 'Unknown error'
                });
            }
        }
    }["DiscoverTab.useCallback[handleJobComplete]"], [
        queryClient,
        discoveryHistory,
        searchMode,
        parsedIntent
    ]);
    // Add lead to pipeline
    const handleAddToPipeline = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "DiscoverTab.useCallback[handleAddToPipeline]": async (leadId)=>{
            setPipelineAddingIds({
                "DiscoverTab.useCallback[handleAddToPipeline]": (prev)=>new Set(prev).add(leadId)
            }["DiscoverTab.useCallback[handleAddToPipeline]"]);
            try {
                await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["updateLead"])(leadId, {
                    stage: 'analyzed'
                });
                setAddedIds({
                    "DiscoverTab.useCallback[handleAddToPipeline]": (prev)=>new Set(prev).add(leadId)
                }["DiscoverTab.useCallback[handleAddToPipeline]"]);
                queryClient.invalidateQueries({
                    queryKey: [
                        'leads'
                    ]
                });
                __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$sonner$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toast"].success('Lead added to pipeline');
            } catch  {
                __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$sonner$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toast"].error('Failed to add lead to pipeline');
            } finally{
                setPipelineAddingIds({
                    "DiscoverTab.useCallback[handleAddToPipeline]": (prev)=>{
                        const next = new Set(prev);
                        next.delete(leadId);
                        return next;
                    }
                }["DiscoverTab.useCallback[handleAddToPipeline]"]);
            }
        }
    }["DiscoverTab.useCallback[handleAddToPipeline]"], [
        queryClient
    ]);
    const handleViewDetails = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "DiscoverTab.useCallback[handleViewDetails]": (leadId)=>{
            setSelectedLeadId(leadId);
            setActiveTab('leads');
        }
    }["DiscoverTab.useCallback[handleViewDetails]"], [
        setSelectedLeadId,
        setActiveTab
    ]);
    const canDiscover = niche.trim() && source && // Country is optional — empty selection = Worldwide (spec §5).
    // An unconfigured source is NEVER run — it cannot return real data
    !selectedSourceBlocked;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "p-4 lg:p-6 space-y-6 pb-20 lg:pb-6",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Card"], {
                className: "card-glow overflow-hidden",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "gradient-bg-animated px-4 sm:px-6 py-3 sm:py-4 flex items-center gap-3",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "flex items-center justify-center h-9 w-9 sm:h-10 sm:w-10 rounded-xl bg-primary/20",
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$search$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Search$3e$__["Search"], {
                                    className: "h-4 w-4 sm:h-5 sm:w-5 text-primary"
                                }, void 0, false, {
                                    fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                    lineNumber: 982,
                                    columnNumber: 13
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                lineNumber: 981,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["CardTitle"], {
                                        className: "text-base sm:text-lg text-foreground",
                                        children: "Lead Discovery Engine"
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                        lineNumber: 985,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                        className: "text-[11px] sm:text-xs text-muted-foreground mt-0.5",
                                        children: "Find and analyze potential acquisition targets"
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                        lineNumber: 986,
                                        columnNumber: 13
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                lineNumber: 984,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                        lineNumber: 980,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["CardContent"], {
                        className: "pt-5 space-y-4",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "flex items-center justify-between gap-3 flex-wrap",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "inline-flex items-center gap-1 p-1 rounded-lg bg-muted/60 border border-border/50",
                                        role: "tablist",
                                        "aria-label": "Search mode",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                type: "button",
                                                role: "tab",
                                                "aria-selected": searchMode === 'filters',
                                                onClick: ()=>setSearchMode('filters'),
                                                className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])('inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors active:scale-95', searchMode === 'filters' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'),
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$sliders$2d$horizontal$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__SlidersHorizontal$3e$__["SlidersHorizontal"], {
                                                        className: "h-3.5 w-3.5"
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                                        lineNumber: 1008,
                                                        columnNumber: 17
                                                    }, this),
                                                    "Filter Mode"
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                                lineNumber: 996,
                                                columnNumber: 15
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                type: "button",
                                                role: "tab",
                                                "aria-selected": searchMode === 'ai',
                                                onClick: ()=>setSearchMode('ai'),
                                                className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])('inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors active:scale-95', searchMode === 'ai' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'),
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$sparkles$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Sparkles$3e$__["Sparkles"], {
                                                        className: "h-3.5 w-3.5 text-primary"
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                                        lineNumber: 1023,
                                                        columnNumber: 17
                                                    }, this),
                                                    "AI Chat Mode"
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                                lineNumber: 1011,
                                                columnNumber: 15
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                        lineNumber: 995,
                                        columnNumber: 13
                                    }, this),
                                    searchMode === 'ai' && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "text-[11px] text-muted-foreground flex items-center gap-1",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$sparkles$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Sparkles$3e$__["Sparkles"], {
                                                className: "h-3 w-3 text-primary"
                                            }, void 0, false, {
                                                fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                                lineNumber: 1029,
                                                columnNumber: 17
                                            }, this),
                                            "Available on all plans"
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                        lineNumber: 1028,
                                        columnNumber: 15
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                lineNumber: 994,
                                columnNumber: 11
                            }, this),
                            searchMode === 'filters' ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Fragment"], {
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "rounded-lg border border-border/50 bg-muted/10 p-3",
                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$dashboard$2f$business$2d$profile$2d$selector$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                                            value: profileSelection,
                                            onChange: setProfileSelection
                                        }, void 0, false, {
                                            fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                            lineNumber: 1039,
                                            columnNumber: 13
                                        }, this)
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                        lineNumber: 1038,
                                        columnNumber: 11
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "space-y-2",
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                                        className: "text-sm font-medium flex items-center gap-1.5",
                                                        children: [
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$globe$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Globe$3e$__["Globe"], {
                                                                className: "h-3.5 w-3.5 text-primary"
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                                                lineNumber: 1045,
                                                                columnNumber: 17
                                                            }, this),
                                                            "Source"
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                                        lineNumber: 1044,
                                                        columnNumber: 15
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$select$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Select"], {
                                                        value: source,
                                                        onValueChange: setSource,
                                                        children: [
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$select$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["SelectTrigger"], {
                                                                className: "border-primary/20 focus:ring-primary/30",
                                                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$select$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["SelectValue"], {
                                                                    placeholder: "Select source..."
                                                                }, void 0, false, {
                                                                    fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                                                    lineNumber: 1050,
                                                                    columnNumber: 19
                                                                }, this)
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                                                lineNumber: 1049,
                                                                columnNumber: 17
                                                            }, this),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$select$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["SelectContent"], {
                                                                children: DISCOVERY_SOURCES.map((s)=>{
                                                                    const Icon = s.icon;
                                                                    const st = s.value === 'all' ? undefined : sourceStatusById.get(s.value);
                                                                    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$select$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["SelectItem"], {
                                                                        value: s.value,
                                                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                            className: "flex items-center gap-2",
                                                                            children: [
                                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Icon, {
                                                                                    className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])('h-3.5 w-3.5', s.color)
                                                                                }, void 0, false, {
                                                                                    fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                                                                    lineNumber: 1059,
                                                                                    columnNumber: 27
                                                                                }, this),
                                                                                s.label,
                                                                                st && st.status !== 'connected' && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                                    className: "h-1.5 w-1.5 rounded-full bg-yellow-500 shrink-0",
                                                                                    title: `${st.label} requires API configuration`
                                                                                }, void 0, false, {
                                                                                    fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                                                                    lineNumber: 1062,
                                                                                    columnNumber: 29
                                                                                }, this),
                                                                                st && st.noSetupRequired && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                                    className: "h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0",
                                                                                    title: "No setup required"
                                                                                }, void 0, false, {
                                                                                    fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                                                                    lineNumber: 1068,
                                                                                    columnNumber: 29
                                                                                }, this)
                                                                            ]
                                                                        }, void 0, true, {
                                                                            fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                                                            lineNumber: 1058,
                                                                            columnNumber: 25
                                                                        }, this)
                                                                    }, s.value, false, {
                                                                        fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                                                        lineNumber: 1057,
                                                                        columnNumber: 23
                                                                    }, this);
                                                                })
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                                                lineNumber: 1052,
                                                                columnNumber: 17
                                                            }, this)
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                                        lineNumber: 1048,
                                                        columnNumber: 15
                                                    }, this),
                                                    selectedSourceBlocked && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: "flex items-start gap-2 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-3 py-2.5",
                                                        children: [
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$circle$2d$alert$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__AlertCircle$3e$__["AlertCircle"], {
                                                                className: "h-4 w-4 text-yellow-600 dark:text-yellow-500 mt-0.5 shrink-0"
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                                                lineNumber: 1085,
                                                                columnNumber: 19
                                                            }, this),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                className: "space-y-0.5",
                                                                children: [
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                                        className: "text-xs font-medium text-yellow-700 dark:text-yellow-400",
                                                                        children: selectedSourceConfigMessage
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                                                        lineNumber: 1087,
                                                                        columnNumber: 21
                                                                    }, this),
                                                                    selectedSourceStatus.requiredEnvVars.length > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                                        className: "text-[11px] text-yellow-600/80 dark:text-yellow-500/70",
                                                                        children: [
                                                                            "Required: ",
                                                                            selectedSourceStatus.requiredEnvVars.map((v)=>v.name).join(', ')
                                                                        ]
                                                                    }, void 0, true, {
                                                                        fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                                                        lineNumber: 1091,
                                                                        columnNumber: 23
                                                                    }, this)
                                                                ]
                                                            }, void 0, true, {
                                                                fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                                                lineNumber: 1086,
                                                                columnNumber: 19
                                                            }, this)
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                                        lineNumber: 1084,
                                                        columnNumber: 17
                                                    }, this)
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                                lineNumber: 1043,
                                                columnNumber: 13
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "space-y-2",
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                                        className: "text-sm font-medium flex items-center gap-1.5",
                                                        children: [
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$tag$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Tag$3e$__["Tag"], {
                                                                className: "h-3.5 w-3.5 text-primary"
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                                                lineNumber: 1103,
                                                                columnNumber: 17
                                                            }, this),
                                                            "Niche"
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                                        lineNumber: 1102,
                                                        columnNumber: 15
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$input$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Input"], {
                                                        placeholder: "e.g. Restaurant, Dental, Gym...",
                                                        value: niche,
                                                        onChange: (e)=>setNiche(e.target.value),
                                                        className: "border-primary/20 focus:ring-primary/30"
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                                        lineNumber: 1106,
                                                        columnNumber: 15
                                                    }, this)
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                                lineNumber: 1101,
                                                columnNumber: 13
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "space-y-2",
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                                        className: "text-sm font-medium flex items-center gap-1.5",
                                                        children: [
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$map$2d$pin$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__MapPin$3e$__["MapPin"], {
                                                                className: "h-3.5 w-3.5 text-primary"
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                                                lineNumber: 1118,
                                                                columnNumber: 17
                                                            }, this),
                                                            "Country ",
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                className: "text-muted-foreground font-normal",
                                                                children: "(or Worldwide)"
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                                                lineNumber: 1119,
                                                                columnNumber: 25
                                                            }, this)
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                                        lineNumber: 1117,
                                                        columnNumber: 15
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$popover$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Popover"], {
                                                        open: countryOpen,
                                                        onOpenChange: setCountryOpen,
                                                        children: [
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$popover$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["PopoverTrigger"], {
                                                                asChild: true,
                                                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$button$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Button"], {
                                                                    variant: "outline",
                                                                    role: "combobox",
                                                                    "aria-expanded": countryOpen,
                                                                    className: "w-full justify-between border-primary/20 focus:ring-primary/30 font-normal",
                                                                    children: [
                                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                            className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])('truncate', !country && 'text-muted-foreground'),
                                                                            children: country || '🌍 Worldwide (all countries)'
                                                                        }, void 0, false, {
                                                                            fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                                                            lineNumber: 1129,
                                                                            columnNumber: 21
                                                                        }, this),
                                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chevron$2d$down$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__ChevronDown$3e$__["ChevronDown"], {
                                                                            className: "ml-2 h-4 w-4 shrink-0 opacity-50"
                                                                        }, void 0, false, {
                                                                            fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                                                            lineNumber: 1132,
                                                                            columnNumber: 21
                                                                        }, this)
                                                                    ]
                                                                }, void 0, true, {
                                                                    fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                                                    lineNumber: 1123,
                                                                    columnNumber: 19
                                                                }, this)
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                                                lineNumber: 1122,
                                                                columnNumber: 17
                                                            }, this),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$popover$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["PopoverContent"], {
                                                                className: "w-[320px] p-0",
                                                                align: "start",
                                                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$command$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Command"], {
                                                                    children: [
                                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$command$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["CommandInput"], {
                                                                            placeholder: "Search countries..."
                                                                        }, void 0, false, {
                                                                            fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                                                            lineNumber: 1137,
                                                                            columnNumber: 21
                                                                        }, this),
                                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$command$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["CommandList"], {
                                                                            className: "max-h-64 overflow-y-auto",
                                                                            children: [
                                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$command$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["CommandEmpty"], {
                                                                                    children: "No country found."
                                                                                }, void 0, false, {
                                                                                    fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                                                                    lineNumber: 1139,
                                                                                    columnNumber: 23
                                                                                }, this),
                                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$command$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["CommandGroup"], {
                                                                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$command$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["CommandItem"], {
                                                                                        value: "Worldwide all countries",
                                                                                        onSelect: ()=>{
                                                                                            setCountry('');
                                                                                            setCountryOpen(false);
                                                                                        },
                                                                                        children: [
                                                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$globe$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Globe$3e$__["Globe"], {
                                                                                                className: "mr-2 h-4 w-4"
                                                                                            }, void 0, false, {
                                                                                                fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                                                                                lineNumber: 1148,
                                                                                                columnNumber: 27
                                                                                            }, this),
                                                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                                                className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])('flex-1', !country && 'font-medium'),
                                                                                                children: "Worldwide (all countries)"
                                                                                            }, void 0, false, {
                                                                                                fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                                                                                lineNumber: 1149,
                                                                                                columnNumber: 27
                                                                                            }, this),
                                                                                            !country && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$circle$2d$check$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__CheckCircle2$3e$__["CheckCircle2"], {
                                                                                                className: "h-4 w-4 text-primary"
                                                                                            }, void 0, false, {
                                                                                                fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                                                                                lineNumber: 1150,
                                                                                                columnNumber: 40
                                                                                            }, this)
                                                                                        ]
                                                                                    }, void 0, true, {
                                                                                        fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                                                                        lineNumber: 1141,
                                                                                        columnNumber: 25
                                                                                    }, this)
                                                                                }, void 0, false, {
                                                                                    fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                                                                    lineNumber: 1140,
                                                                                    columnNumber: 23
                                                                                }, this),
                                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$command$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["CommandGroup"], {
                                                                                    heading: "Countries",
                                                                                    children: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$countries$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["COUNTRIES"].map((c)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$command$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["CommandItem"], {
                                                                                            value: `${c.name} ${c.code}`,
                                                                                            onSelect: ()=>{
                                                                                                setCountry(c.name);
                                                                                                setCountryOpen(false);
                                                                                            },
                                                                                            children: [
                                                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                                                    className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])('flex-1', country === c.name && 'font-medium'),
                                                                                                    children: c.name
                                                                                                }, void 0, false, {
                                                                                                    fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                                                                                    lineNumber: 1163,
                                                                                                    columnNumber: 29
                                                                                                }, this),
                                                                                                country === c.name ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$circle$2d$check$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__CheckCircle2$3e$__["CheckCircle2"], {
                                                                                                    className: "h-4 w-4 text-primary"
                                                                                                }, void 0, false, {
                                                                                                    fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                                                                                    lineNumber: 1165,
                                                                                                    columnNumber: 31
                                                                                                }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                                                    className: "text-xs text-muted-foreground",
                                                                                                    children: c.code
                                                                                                }, void 0, false, {
                                                                                                    fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                                                                                    lineNumber: 1167,
                                                                                                    columnNumber: 31
                                                                                                }, this)
                                                                                            ]
                                                                                        }, c.code, true, {
                                                                                            fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                                                                            lineNumber: 1155,
                                                                                            columnNumber: 27
                                                                                        }, this))
                                                                                }, void 0, false, {
                                                                                    fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                                                                    lineNumber: 1153,
                                                                                    columnNumber: 23
                                                                                }, this)
                                                                            ]
                                                                        }, void 0, true, {
                                                                            fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                                                            lineNumber: 1138,
                                                                            columnNumber: 21
                                                                        }, this)
                                                                    ]
                                                                }, void 0, true, {
                                                                    fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                                                    lineNumber: 1136,
                                                                    columnNumber: 19
                                                                }, this)
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                                                lineNumber: 1135,
                                                                columnNumber: 17
                                                            }, this)
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                                        lineNumber: 1121,
                                                        columnNumber: 15
                                                    }, this)
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                                lineNumber: 1116,
                                                columnNumber: 13
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "space-y-2",
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                                        className: "text-sm font-medium flex items-center gap-1.5",
                                                        children: [
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$map$2d$pin$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__MapPin$3e$__["MapPin"], {
                                                                className: "h-3.5 w-3.5 text-muted-foreground"
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                                                lineNumber: 1181,
                                                                columnNumber: 17
                                                            }, this),
                                                            "City ",
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                className: "text-muted-foreground font-normal",
                                                                children: "(optional)"
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                                                lineNumber: 1182,
                                                                columnNumber: 22
                                                            }, this)
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                                        lineNumber: 1180,
                                                        columnNumber: 15
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$input$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Input"], {
                                                        placeholder: "Enter city...",
                                                        value: city,
                                                        onChange: (e)=>setCity(e.target.value),
                                                        className: "border-primary/20 focus:ring-primary/30"
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                                        lineNumber: 1184,
                                                        columnNumber: 15
                                                    }, this)
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                                lineNumber: 1179,
                                                columnNumber: 13
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                        lineNumber: 1041,
                                        columnNumber: 11
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "flex flex-col sm:flex-row gap-3",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$button$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Button"], {
                                                onClick: ()=>handleStartDiscovery(),
                                                disabled: !canDiscover || discoverMutation.isPending,
                                                className: "flex-1 sm:flex-none bg-primary hover:bg-primary/90 active:scale-95 transition-all",
                                                size: "lg",
                                                children: discoverMutation.isPending ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Fragment"], {
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$loader$2d$circle$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Loader2$3e$__["Loader2"], {
                                                            className: "h-4 w-4 mr-2 animate-spin"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                                            lineNumber: 1202,
                                                            columnNumber: 19
                                                        }, this),
                                                        "Starting Discovery..."
                                                    ]
                                                }, void 0, true) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Fragment"], {
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$zap$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Zap$3e$__["Zap"], {
                                                            className: "h-4 w-4 mr-2"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                                            lineNumber: 1207,
                                                            columnNumber: 19
                                                        }, this),
                                                        "Start Discovery"
                                                    ]
                                                }, void 0, true)
                                            }, void 0, false, {
                                                fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                                lineNumber: 1194,
                                                columnNumber: 13
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$button$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Button"], {
                                                variant: "outline",
                                                size: "lg",
                                                className: "border-primary/20 hover:border-primary/40 hover:bg-primary/5 active:scale-95 transition-all",
                                                onClick: ()=>setImportOpen(true),
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$file$2d$up$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__FileUp$3e$__["FileUp"], {
                                                        className: "h-4 w-4 mr-2"
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                                        lineNumber: 1218,
                                                        columnNumber: 15
                                                    }, this),
                                                    "Import CSV"
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                                lineNumber: 1212,
                                                columnNumber: 13
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                        lineNumber: 1193,
                                        columnNumber: 11
                                    }, this)
                                ]
                            }, void 0, true) : /* ── AI Chat Mode ── */ /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "space-y-4",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("form", {
                                        onSubmit: (e)=>{
                                            e.preventDefault();
                                            handleAiParse();
                                        },
                                        className: "space-y-3",
                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "relative",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$sparkles$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Sparkles$3e$__["Sparkles"], {
                                                    className: "absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary/60 pointer-events-none"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                                    lineNumber: 1234,
                                                    columnNumber: 19
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$input$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Input"], {
                                                    value: aiQuery,
                                                    onChange: (e)=>setAiQuery(e.target.value),
                                                    placeholder: "Describe what leads you're looking for... e.g. 'Find 20 restaurants in Dubai with no website and poor social media presence'",
                                                    className: "pl-9 pr-28 h-11",
                                                    disabled: aiParsing || discoverMutation.isPending
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                                    lineNumber: 1235,
                                                    columnNumber: 19
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$button$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Button"], {
                                                    type: "submit",
                                                    size: "sm",
                                                    className: "absolute right-1.5 top-1/2 -translate-y-1/2 h-8 gap-1",
                                                    disabled: !aiQuery.trim() || aiParsing || discoverMutation.isPending,
                                                    children: [
                                                        aiParsing ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$loader$2d$circle$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Loader2$3e$__["Loader2"], {
                                                            className: "h-3.5 w-3.5 animate-spin"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                                            lineNumber: 1249,
                                                            columnNumber: 23
                                                        }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$search$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Search$3e$__["Search"], {
                                                            className: "h-3.5 w-3.5"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                                            lineNumber: 1251,
                                                            columnNumber: 23
                                                        }, this),
                                                        aiParsing ? 'Reading…' : 'Read Request'
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                                    lineNumber: 1242,
                                                    columnNumber: 19
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                            lineNumber: 1233,
                                            columnNumber: 17
                                        }, this)
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                        lineNumber: 1226,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$framer$2d$motion$2f$dist$2f$es$2f$components$2f$AnimatePresence$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["AnimatePresence"], {
                                        children: parsedIntent && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$framer$2d$motion$2f$dist$2f$es$2f$render$2f$components$2f$motion$2f$proxy$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["motion"].div, {
                                            initial: {
                                                opacity: 0,
                                                y: 10
                                            },
                                            animate: {
                                                opacity: 1,
                                                y: 0
                                            },
                                            exit: {
                                                opacity: 0,
                                                y: -10
                                            },
                                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-3",
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: "flex flex-wrap items-center gap-2",
                                                        children: [
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                className: "text-xs font-medium text-muted-foreground",
                                                                children: "Searching for:"
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                                                lineNumber: 1267,
                                                                columnNumber: 25
                                                            }, this),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$badge$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Badge"], {
                                                                variant: "outline",
                                                                className: "bg-primary/10 border-primary/25 gap-1",
                                                                children: [
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$search$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Search$3e$__["Search"], {
                                                                        className: "h-3 w-3"
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                                                        lineNumber: 1269,
                                                                        columnNumber: 27
                                                                    }, this),
                                                                    parsedIntent.count != null ? `${parsedIntent.count} ` : '',
                                                                    parsedIntent.niche,
                                                                    " in ",
                                                                    parsedIntent.location
                                                                ]
                                                            }, void 0, true, {
                                                                fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                                                lineNumber: 1268,
                                                                columnNumber: 25
                                                            }, this),
                                                            parsedIntent.requirements && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Fragment"], {
                                                                children: [
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                        className: "text-xs font-medium text-muted-foreground",
                                                                        children: "|"
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                                                        lineNumber: 1274,
                                                                        columnNumber: 29
                                                                    }, this),
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                        className: "text-xs font-medium text-muted-foreground",
                                                                        children: "Filter:"
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                                                        lineNumber: 1275,
                                                                        columnNumber: 29
                                                                    }, this),
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$badge$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Badge"], {
                                                                        variant: "outline",
                                                                        className: "bg-amber-500/10 border-amber-500/25 text-amber-600 dark:text-amber-400 gap-1",
                                                                        children: [
                                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$circle$2d$alert$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__AlertCircle$3e$__["AlertCircle"], {
                                                                                className: "h-3 w-3"
                                                                            }, void 0, false, {
                                                                                fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                                                                lineNumber: 1280,
                                                                                columnNumber: 31
                                                                            }, this),
                                                                            parsedIntent.requirements
                                                                        ]
                                                                    }, void 0, true, {
                                                                        fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                                                        lineNumber: 1276,
                                                                        columnNumber: 29
                                                                    }, this)
                                                                ]
                                                            }, void 0, true)
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                                        lineNumber: 1266,
                                                        columnNumber: 23
                                                    }, this),
                                                    describeCriteria(parsedIntent.criteria) && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: "flex flex-wrap items-center gap-2",
                                                        children: [
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                className: "text-xs font-medium text-muted-foreground",
                                                                children: "Hard filters (strictly enforced):"
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                                                lineNumber: 1289,
                                                                columnNumber: 27
                                                            }, this),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$badge$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Badge"], {
                                                                variant: "outline",
                                                                className: "bg-emerald-500/10 border-emerald-500/25 text-emerald-600 dark:text-emerald-400 gap-1",
                                                                children: [
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$shield$2d$check$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__ShieldCheck$3e$__["ShieldCheck"], {
                                                                        className: "h-3 w-3"
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                                                        lineNumber: 1294,
                                                                        columnNumber: 29
                                                                    }, this),
                                                                    describeCriteria(parsedIntent.criteria)
                                                                ]
                                                            }, void 0, true, {
                                                                fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                                                lineNumber: 1290,
                                                                columnNumber: 27
                                                            }, this)
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                                        lineNumber: 1288,
                                                        columnNumber: 25
                                                    }, this),
                                                    parsedIntent.criteria && (parsedIntent.criteria.employeeMin != null || parsedIntent.criteria.employeeMax != null || parsedIntent.criteria.exactEmployeeCount != null) && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                        className: "text-[11px] text-muted-foreground",
                                                        children: "Only companies whose employee count can be verified within this range will be returned — if fewer verified matches exist than you asked for, you'll see the honest count."
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                                        lineNumber: 1300,
                                                        columnNumber: 25
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: "flex flex-wrap gap-2",
                                                        children: [
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$button$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Button"], {
                                                                size: "sm",
                                                                onClick: ()=>{
                                                                    setHonestMatchNotice(null);
                                                                    handleStartDiscovery({
                                                                        niche: parsedIntent.niche,
                                                                        country: parsedIntent.country,
                                                                        city: parsedIntent.city || undefined,
                                                                        source,
                                                                        maxResults: parsedIntent.count ?? undefined,
                                                                        requirements: parsedIntent.requirements || undefined,
                                                                        criteria: parsedIntent.criteria
                                                                    });
                                                                },
                                                                disabled: discoverMutation.isPending,
                                                                className: "bg-primary hover:bg-primary/90 active:scale-95 transition-all",
                                                                children: [
                                                                    discoverMutation.isPending ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$loader$2d$circle$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Loader2$3e$__["Loader2"], {
                                                                        className: "h-3.5 w-3.5 mr-1.5 animate-spin"
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                                                        lineNumber: 1323,
                                                                        columnNumber: 29
                                                                    }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$zap$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Zap$3e$__["Zap"], {
                                                                        className: "h-3.5 w-3.5 mr-1.5"
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                                                        lineNumber: 1325,
                                                                        columnNumber: 29
                                                                    }, this),
                                                                    discoverMutation.isPending ? 'Starting Discovery...' : 'Start Discovery'
                                                                ]
                                                            }, void 0, true, {
                                                                fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                                                lineNumber: 1305,
                                                                columnNumber: 25
                                                            }, this),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$button$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Button"], {
                                                                size: "sm",
                                                                variant: "outline",
                                                                onClick: handleEditFilters,
                                                                disabled: discoverMutation.isPending,
                                                                className: "border-primary/20 hover:border-primary/40 hover:bg-primary/5 active:scale-95 transition-all",
                                                                children: [
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$pencil$2d$line$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__PencilLine$3e$__["PencilLine"], {
                                                                        className: "h-3.5 w-3.5 mr-1.5"
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                                                        lineNumber: 1336,
                                                                        columnNumber: 27
                                                                    }, this),
                                                                    "Edit Filters"
                                                                ]
                                                            }, void 0, true, {
                                                                fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                                                lineNumber: 1329,
                                                                columnNumber: 25
                                                            }, this)
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                                        lineNumber: 1304,
                                                        columnNumber: 23
                                                    }, this)
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                                lineNumber: 1265,
                                                columnNumber: 21
                                            }, this)
                                        }, void 0, false, {
                                            fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                            lineNumber: 1260,
                                            columnNumber: 19
                                        }, this)
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                        lineNumber: 1258,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                        className: "text-[11px] text-muted-foreground",
                                        children: [
                                            "Describe your ideal leads in plain English — AI fills the filters and starts the discovery for you. Uses your current source selection (",
                                            ' ',
                                            DISCOVERY_SOURCES.find((s)=>s.value === source)?.label ?? source,
                                            ")."
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                        lineNumber: 1345,
                                        columnNumber: 15
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                lineNumber: 1225,
                                columnNumber: 13
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                        lineNumber: 992,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                lineNumber: 979,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$framer$2d$motion$2f$dist$2f$es$2f$components$2f$AnimatePresence$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["AnimatePresence"], {
                children: activeJob && (activeJob.status === 'running' || activeJob.status === 'pending') && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$framer$2d$motion$2f$dist$2f$es$2f$render$2f$components$2f$motion$2f$proxy$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["motion"].div, {
                    initial: {
                        opacity: 0,
                        y: 10
                    },
                    animate: {
                        opacity: 1,
                        y: 0
                    },
                    exit: {
                        opacity: 0,
                        y: -10
                    },
                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(DiscoveryJobProgress, {
                        job: activeJob,
                        onComplete: handleJobComplete
                    }, void 0, false, {
                        fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                        lineNumber: 1363,
                        columnNumber: 13
                    }, this)
                }, void 0, false, {
                    fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                    lineNumber: 1358,
                    columnNumber: 11
                }, this)
            }, void 0, false, {
                fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                lineNumber: 1356,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$framer$2d$motion$2f$dist$2f$es$2f$components$2f$AnimatePresence$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["AnimatePresence"], {
                children: discoveryHistory.length > 0 && !activeJob && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$framer$2d$motion$2f$dist$2f$es$2f$render$2f$components$2f$motion$2f$proxy$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["motion"].div, {
                    initial: {
                        opacity: 0,
                        y: 10
                    },
                    animate: {
                        opacity: 1,
                        y: 0
                    },
                    exit: {
                        opacity: 0,
                        y: -10
                    },
                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Card"], {
                        className: "card-glow",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["CardContent"], {
                            className: "p-4",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "flex items-center justify-between mb-3",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "flex items-center gap-2",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$clock$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Clock$3e$__["Clock"], {
                                                    className: "h-4 w-4 text-muted-foreground"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                                    lineNumber: 1380,
                                                    columnNumber: 21
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                                                    className: "text-sm font-semibold",
                                                    children: "Recent Searches"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                                    lineNumber: 1381,
                                                    columnNumber: 21
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                            lineNumber: 1379,
                                            columnNumber: 19
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$button$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Button"], {
                                            variant: "ghost",
                                            size: "sm",
                                            className: "h-7 text-xs text-muted-foreground hover:text-destructive gap-1.5",
                                            onClick: ()=>{
                                                try {
                                                    localStorage.removeItem('acquisitionos_discovery_history');
                                                    setDiscoveryHistory([]);
                                                    __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$sonner$2f$dist$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toast"].success('Search history cleared');
                                                } catch  {}
                                            },
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$trash$2d$2$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Trash2$3e$__["Trash2"], {
                                                    className: "h-3 w-3"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                                    lineNumber: 1395,
                                                    columnNumber: 21
                                                }, this),
                                                "Clear"
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                            lineNumber: 1383,
                                            columnNumber: 19
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                    lineNumber: 1378,
                                    columnNumber: 17
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "space-y-2",
                                    children: discoveryHistory.slice(0, 5).map((item, i)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$framer$2d$motion$2f$dist$2f$es$2f$render$2f$components$2f$motion$2f$proxy$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["motion"].button, {
                                            initial: {
                                                opacity: 0,
                                                x: -10
                                            },
                                            animate: {
                                                opacity: 1,
                                                x: 0
                                            },
                                            transition: {
                                                delay: i * 0.05
                                            },
                                            onClick: ()=>{
                                                setNiche(item.niche);
                                                setCountry(item.country);
                                                setCity(item.city || '');
                                            },
                                            className: "w-full flex items-center gap-3 p-2.5 rounded-lg border border-border/50 bg-muted/30 hover:bg-muted/60 hover:border-primary/20 transition-colors text-left",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: "flex items-center justify-center h-8 w-8 rounded-lg bg-primary/10 shrink-0",
                                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$search$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Search$3e$__["Search"], {
                                                        className: "h-3.5 w-3.5 text-primary"
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                                        lineNumber: 1414,
                                                        columnNumber: 25
                                                    }, this)
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                                    lineNumber: 1413,
                                                    columnNumber: 23
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: "flex-1 min-w-0",
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                            className: "text-xs font-medium truncate",
                                                            children: [
                                                                item.niche,
                                                                " · ",
                                                                item.country,
                                                                item.city ? ` · ${item.city}` : ''
                                                            ]
                                                        }, void 0, true, {
                                                            fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                                            lineNumber: 1417,
                                                            columnNumber: 25
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                            className: "text-[10px] text-muted-foreground",
                                                            children: [
                                                                item.resultCount,
                                                                " result",
                                                                item.resultCount !== 1 ? 's' : ''
                                                            ]
                                                        }, void 0, true, {
                                                            fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                                            lineNumber: 1420,
                                                            columnNumber: 25
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                                    lineNumber: 1416,
                                                    columnNumber: 23
                                                }, this)
                                            ]
                                        }, `${item.niche}-${item.country}-${item.timestamp}`, true, {
                                            fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                            lineNumber: 1401,
                                            columnNumber: 21
                                        }, this))
                                }, void 0, false, {
                                    fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                    lineNumber: 1399,
                                    columnNumber: 17
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                            lineNumber: 1377,
                            columnNumber: 15
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                        lineNumber: 1376,
                        columnNumber: 13
                    }, this)
                }, void 0, false, {
                    fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                    lineNumber: 1371,
                    columnNumber: 11
                }, this)
            }, void 0, false, {
                fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                lineNumber: 1369,
                columnNumber: 7
            }, this),
            discoveredLeads.length === 0 && !activeJob && discoveryHistory.length === 0 && recentlyDiscovered.length === 0 && popularNiches.length === 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$framer$2d$motion$2f$dist$2f$es$2f$render$2f$components$2f$motion$2f$proxy$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["motion"].div, {
                initial: {
                    opacity: 0,
                    y: 20
                },
                animate: {
                    opacity: 1,
                    y: 0
                },
                transition: {
                    delay: 0.2
                },
                className: "flex flex-col items-center justify-center py-16 px-4",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "relative mb-6",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "rounded-full bg-primary/10 p-6",
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$search$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Search$3e$__["Search"], {
                                    className: "h-12 w-12 text-primary/40"
                                }, void 0, false, {
                                    fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                    lineNumber: 1443,
                                    columnNumber: 15
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                lineNumber: 1442,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "absolute -bottom-1 -right-1 h-8 w-8 rounded-full bg-primary/15 flex items-center justify-center",
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$sparkles$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Sparkles$3e$__["Sparkles"], {
                                    className: "h-4 w-4 text-primary/60"
                                }, void 0, false, {
                                    fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                    lineNumber: 1446,
                                    columnNumber: 15
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                lineNumber: 1445,
                                columnNumber: 13
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                        lineNumber: 1441,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                        className: "text-xl font-bold mb-2",
                        children: "Find Your Next Lead"
                    }, void 0, false, {
                        fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                        lineNumber: 1449,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: "text-sm text-muted-foreground text-center max-w-md mb-6",
                        children: "Use the search form above to discover potential acquisition targets across multiple sources."
                    }, void 0, false, {
                        fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                        lineNumber: 1450,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                lineNumber: 1435,
                columnNumber: 9
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$framer$2d$motion$2f$dist$2f$es$2f$components$2f$AnimatePresence$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["AnimatePresence"], {
                children: honestMatchNotice && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$framer$2d$motion$2f$dist$2f$es$2f$render$2f$components$2f$motion$2f$proxy$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["motion"].div, {
                    initial: {
                        opacity: 0,
                        y: 10
                    },
                    animate: {
                        opacity: 1,
                        y: 0
                    },
                    exit: {
                        opacity: 0,
                        y: -10
                    },
                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex items-start gap-3 rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-3",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$shield$2d$check$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__ShieldCheck$3e$__["ShieldCheck"], {
                                className: "h-4 w-4 text-blue-500 mt-0.5 shrink-0"
                            }, void 0, false, {
                                fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                lineNumber: 1465,
                                columnNumber: 15
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "space-y-0.5",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                        className: "text-sm font-medium text-blue-700 dark:text-blue-400",
                                        children: honestMatchNotice
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                        lineNumber: 1467,
                                        columnNumber: 17
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                        className: "text-[11px] text-muted-foreground",
                                        children: "Hard filters (employee range, website, exclusions) are enforced server-side — every company above was verified against them. The list is never padded with loosely related companies."
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                        lineNumber: 1468,
                                        columnNumber: 17
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                lineNumber: 1466,
                                columnNumber: 15
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                        lineNumber: 1464,
                        columnNumber: 13
                    }, this)
                }, void 0, false, {
                    fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                    lineNumber: 1459,
                    columnNumber: 11
                }, this)
            }, void 0, false, {
                fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                lineNumber: 1457,
                columnNumber: 7
            }, this),
            discoveredLeads.length > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "space-y-4",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex items-center justify-between",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                                className: "text-sm font-semibold text-muted-foreground",
                                children: [
                                    "Discovered ",
                                    discoveredLeads.length,
                                    " verified lead",
                                    discoveredLeads.length === 1 ? '' : 's'
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                lineNumber: 1482,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$button$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Button"], {
                                variant: "ghost",
                                size: "sm",
                                className: "text-xs text-muted-foreground",
                                onClick: ()=>{
                                    setDiscoveredLeads([]);
                                    setHonestMatchNotice(null);
                                },
                                children: "Clear results"
                            }, void 0, false, {
                                fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                lineNumber: 1485,
                                columnNumber: 13
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                        lineNumber: 1481,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 stagger-children",
                        children: discoveredLeads.map((lead)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(DiscoveredLeadCard, {
                                lead: lead,
                                onAddToPipeline: handleAddToPipeline,
                                onViewDetails: handleViewDetails,
                                isAdding: pipelineAddingIds.has(lead.id),
                                isAdded: addedIds.has(lead.id)
                            }, lead.id, false, {
                                fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                lineNumber: 1499,
                                columnNumber: 15
                            }, this))
                    }, void 0, false, {
                        fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                        lineNumber: 1497,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                lineNumber: 1480,
                columnNumber: 9
            }, this),
            recentlyDiscovered.length > 0 && discoveredLeads.length === 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$framer$2d$motion$2f$dist$2f$es$2f$render$2f$components$2f$motion$2f$proxy$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["motion"].div, {
                initial: {
                    opacity: 0,
                    y: 10
                },
                animate: {
                    opacity: 1,
                    y: 0
                },
                transition: {
                    delay: 0.15
                },
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Card"], {
                    className: "card-glow",
                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["CardContent"], {
                        className: "p-4",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "flex items-center gap-2 mb-3",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$clock$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Clock$3e$__["Clock"], {
                                        className: "h-4 w-4 text-muted-foreground"
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                        lineNumber: 1522,
                                        columnNumber: 17
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                                        className: "text-sm font-semibold",
                                        children: "Recently Discovered"
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                        lineNumber: 1523,
                                        columnNumber: 17
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                lineNumber: 1521,
                                columnNumber: 15
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "space-y-2",
                                children: recentlyDiscovered.map((lead)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$framer$2d$motion$2f$dist$2f$es$2f$render$2f$components$2f$motion$2f$proxy$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["motion"].button, {
                                        initial: {
                                            opacity: 0,
                                            x: -10
                                        },
                                        animate: {
                                            opacity: 1,
                                            x: 0
                                        },
                                        onClick: ()=>handleViewDetails(lead.id),
                                        className: "w-full flex items-center gap-3 p-2.5 rounded-lg border border-border/50 bg-muted/30 hover:bg-muted/60 hover:border-primary/20 transition-colors text-left",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "flex items-center justify-center h-8 w-8 rounded-lg bg-primary/10 shrink-0",
                                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$building$2d$2$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Building2$3e$__["Building2"], {
                                                    className: "h-3.5 w-3.5 text-primary"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                                    lineNumber: 1535,
                                                    columnNumber: 23
                                                }, this)
                                            }, void 0, false, {
                                                fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                                lineNumber: 1534,
                                                columnNumber: 21
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "flex-1 min-w-0",
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                        className: "text-xs font-medium truncate",
                                                        children: lead.businessName
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                                        lineNumber: 1538,
                                                        columnNumber: 23
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                        className: "text-[10px] text-muted-foreground",
                                                        children: [
                                                            lead.niche,
                                                            " · ",
                                                            lead.country,
                                                            lead.city ? ` · ${lead.city}` : ''
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                                        lineNumber: 1539,
                                                        columnNumber: 23
                                                    }, this)
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                                lineNumber: 1537,
                                                columnNumber: 21
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: "text-[10px] font-mono font-medium text-emerald-500",
                                                children: [
                                                    lead.conversionScore,
                                                    "%"
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                                lineNumber: 1543,
                                                columnNumber: 21
                                            }, this)
                                        ]
                                    }, lead.id, true, {
                                        fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                        lineNumber: 1527,
                                        columnNumber: 19
                                    }, this))
                            }, void 0, false, {
                                fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                lineNumber: 1525,
                                columnNumber: 15
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                        lineNumber: 1520,
                        columnNumber: 13
                    }, this)
                }, void 0, false, {
                    fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                    lineNumber: 1519,
                    columnNumber: 11
                }, this)
            }, void 0, false, {
                fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                lineNumber: 1514,
                columnNumber: 9
            }, this),
            popularNiches.length > 0 && discoveredLeads.length === 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$framer$2d$motion$2f$dist$2f$es$2f$render$2f$components$2f$motion$2f$proxy$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["motion"].div, {
                initial: {
                    opacity: 0,
                    y: 10
                },
                animate: {
                    opacity: 1,
                    y: 0
                },
                transition: {
                    delay: 0.1
                },
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Card"], {
                    className: "card-glow",
                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$card$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["CardContent"], {
                        className: "p-4",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "flex items-center gap-2 mb-3",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$trending$2d$up$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__TrendingUp$3e$__["TrendingUp"], {
                                        className: "h-4 w-4 text-emerald-500"
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                        lineNumber: 1562,
                                        columnNumber: 17
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                                        className: "text-sm font-semibold",
                                        children: "Popular Niches"
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                        lineNumber: 1563,
                                        columnNumber: 17
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                lineNumber: 1561,
                                columnNumber: 15
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "flex flex-wrap gap-2",
                                children: popularNiches.map((n)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$framer$2d$motion$2f$dist$2f$es$2f$render$2f$components$2f$motion$2f$proxy$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["motion"].button, {
                                        initial: {
                                            opacity: 0,
                                            scale: 0.8
                                        },
                                        animate: {
                                            opacity: 1,
                                            scale: 1
                                        },
                                        transition: {
                                            type: 'spring',
                                            stiffness: 300,
                                            damping: 20
                                        },
                                        onClick: ()=>{
                                            setNiche(n.name);
                                            setCity('');
                                        },
                                        className: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$utils$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["cn"])('inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors active:scale-95', niche === n.name ? 'bg-primary/15 text-primary border-primary/30' : 'bg-muted/50 text-foreground border-border hover:bg-muted hover:border-primary/20'),
                                        children: [
                                            n.name,
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$badge$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Badge"], {
                                                variant: "secondary",
                                                className: "h-4 px-1 text-[9px] font-mono",
                                                children: n.count
                                            }, void 0, false, {
                                                fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                                lineNumber: 1581,
                                                columnNumber: 21
                                            }, this)
                                        ]
                                    }, n.name, true, {
                                        fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                        lineNumber: 1567,
                                        columnNumber: 19
                                    }, this))
                            }, void 0, false, {
                                fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                lineNumber: 1565,
                                columnNumber: 15
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                        lineNumber: 1560,
                        columnNumber: 13
                    }, this)
                }, void 0, false, {
                    fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                    lineNumber: 1559,
                    columnNumber: 11
                }, this)
            }, void 0, false, {
                fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                lineNumber: 1554,
                columnNumber: 9
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$dashboard$2f$lead$2d$import$2d$dialog$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                open: importOpen,
                onOpenChange: setImportOpen
            }, void 0, false, {
                fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                lineNumber: 1591,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$alert$2d$dialog$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["AlertDialog"], {
                open: allSourcesConfirmOpen,
                onOpenChange: setAllSourcesConfirmOpen,
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$alert$2d$dialog$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["AlertDialogContent"], {
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$alert$2d$dialog$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["AlertDialogHeader"], {
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$alert$2d$dialog$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["AlertDialogTitle"], {
                                    children: [
                                        "Search all ",
                                        ALL_SOURCES_COUNT,
                                        " sources?"
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                    lineNumber: 1597,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$alert$2d$dialog$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["AlertDialogDescription"], {
                                    children: [
                                        "Searching all ",
                                        ALL_SOURCES_COUNT,
                                        " sources (AI Search, Google Maps, LinkedIn, JustDial, IndiaMart, Yellow Pages and Sulekha) will use approximately",
                                        ' ',
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "font-semibold text-foreground",
                                            children: [
                                                allSourcesCreditsEstimate,
                                                " credits"
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                            lineNumber: 1601,
                                            columnNumber: 15
                                        }, this),
                                        ". Results are merged and deduplicated. Continue?"
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                    lineNumber: 1598,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                            lineNumber: 1596,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$alert$2d$dialog$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["AlertDialogFooter"], {
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$alert$2d$dialog$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["AlertDialogCancel"], {
                                    onClick: ()=>setPendingStart(undefined),
                                    children: "Cancel"
                                }, void 0, false, {
                                    fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                    lineNumber: 1606,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ui$2f$alert$2d$dialog$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["AlertDialogAction"], {
                                    onClick: ()=>{
                                        discoverMutation.mutate(pendingStart);
                                        setPendingStart(undefined);
                                    },
                                    children: "Continue"
                                }, void 0, false, {
                                    fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                                    lineNumber: 1607,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                            lineNumber: 1605,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                    lineNumber: 1595,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/src/components/dashboard/discover-tab.tsx",
                lineNumber: 1594,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/components/dashboard/discover-tab.tsx",
        lineNumber: 977,
        columnNumber: 5
    }, this);
}
_s2(DiscoverTab, "XofNzKRyIBrTxsMHKZZOy+GIDsM=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$QueryClientProvider$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useQueryClient"],
        __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$store$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useAppStore"],
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$useQuery$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useQuery"],
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$useQuery$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useQuery"],
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$query$2f$build$2f$modern$2f$useMutation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMutation"]
    ];
});
_c4 = DiscoverTab;
var _c, _c1, _c2, _c3, _c4;
__turbopack_context__.k.register(_c, "Star");
__turbopack_context__.k.register(_c1, "DiscoveryJobsList");
__turbopack_context__.k.register(_c2, "DiscoveryJobProgress");
__turbopack_context__.k.register(_c3, "DiscoveredLeadCard");
__turbopack_context__.k.register(_c4, "DiscoverTab");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
]);

//# sourceMappingURL=src_392e86a3._.js.map