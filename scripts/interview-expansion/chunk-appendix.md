## APPENDIX B — API Logic Deep-Dives (the "walk me through the code" answers)

> The single most common senior-level drill: *"Walk me through what happens, end to end, when this endpoint is called — Controller to database row."* These six walk-throughs cover the APIs interviewers will pick. Rehearse them until you can narrate WITHOUT notes: filter chain → controller → validation → service → transaction boundary → SQL → events → response. The code sketches are the level of detail expected on a whiteboard.

### B.1 — `POST /api/auth/otp/verify` (the security-critical path)

```java
// Filter chain: corsFilter -> RateLimitFilter (per-IP bucket) -> JwtAuthenticationFilter (skipped: public path)
// -> Controller
@PostMapping("/api/auth/otp/verify")
public ResponseEntity<AuthResponse> verify(@Valid @RequestBody OtpVerifyRequest req) {
    return ResponseEntity.ok(authService.verifyOtp(req.email(), req.otp(), clientMeta()));
}

// Service (transactional)
@Transactional
public AuthResponse verifyOtp(String email, String otp, ClientMeta meta) {
    UserAccount user = userRepository.findByEmail(email)
        .orElseThrow(new BadCredentialsException("INVALID_CREDENTIALS")); // generic: no existence oracle
    // 1. Lockout check (Redis atomic counter, Q4-11)
    if (lockService.isLocked(email)) throw new AccountLockedException(); // 423, generic message
    // 2. Attempt guard: INCR otp:attempts:{hash} -- Lua atomic, TTL 15min
    lockService.recordAttempt(email);
    // 3. Constant-time verify against HASHED otp (BCrypt), expiry via stored expiry column
    if (!otpHasher.matches(otp, user.getOtpHash()) || clock.now().isAfter(user.getOtpExpiry()))
        throw new BadCredentialsException("INVALID_CREDENTIALS");        // 5th failure -> 15min lock
    lockService.clearAttempts(email);
    // 4. Issue tokens: 15-min access JWT (kid, jti) + opaque refresh (SHA-256 hashed into user_session,
    //    family_id for rotation/reuse detection, device fingerprint recorded)
    TokenPair pair = tokenService.issue(user, meta);
    auditService.event("AUTH.OTP_SUCCESS", user);                        // AFTER_COMMIT async write
    return new AuthResponse(pair.accessToken(), pair.refreshCookie());
}
```

**Narration script:** rate-limit layer (per-IP 10/10min) → validation → user lookup with GENERIC error (no oracle) → Redis lockout check → atomic attempt increment → constant-time hash match + expiry → token issuance with hashed refresh + session row → audit event after commit. **Probe next:** "Where exactly can this race?" (two parallel verifies on the 5th attempt — the Lua INCR closes it), "Why hash the OTP in DB?" (dump = inert), "What leaks if you return different errors for unknown email vs wrong OTP?" (existence oracle).

### B.2 — `GET /api/leads?status=HOT&sort=created_at&cursor=...` (the hot read path)

```java
@GetMapping("/api/leads")
public LeadPageResponse list(@Valid LeadFilterRequest filter, @RequestParam Optional<String> cursor) {
    return leadQueryService.list(filter, cursor, securityContext.orgId()); // orgId from JWT claims
}

// Service: NO @Transactional(readOnly=true) needed on primary-routed single query; replica-routed variant has it
public LeadPageResponse list(LeadFilterRequest f, Optional<String> cursor, UUID orgId) {
    Cursor cur = cursorCodec.decode(cursor, f.filterHash());   // Base64 tuple+hash; 409 on cross-query swap
    SortKey sort = sortRegistry.resolve(f.sort());             // allow-list: created_at -> (created_at DESC, id DESC)
    var spec = LeadSpecs.forOrg(orgId)                         // tenant filter FIRST (Q4-6 defense in depth)
        .and(LeadSpecs.status(f.status()))
        .and(LeadSpecs.notDeleted());                          // soft-delete always appended
    if (cur != null) spec.and(LeadSpecs.afterCursor(sort, cur.tuple())); // WHERE (created_at,id) < (:t1,:t2)
    Slice<LeadRow> rows = leadRepository.findBy(spec, PageRequest.ofSize(Math.min(f.limit(), 100)), LeadRow.class);
    return assembler.toResponse(rows, cursorCodec.encodeNext(rows, sort, f.filterHash())); // no total count
}
```

**SQL produced:** `SELECT id, business_name, stage, ... FROM lead WHERE org_id = ? AND status = ? AND deleted_at IS NULL AND (created_at, id) < (?, ?) ORDER BY created_at DESC, id DESC LIMIT 51` — index `(org_id, status, created_at DESC, id DESC)` partial `WHERE deleted_at IS NULL` → index-only scan with INCLUDE columns. **Probe next:** "Why LIMIT 51?" (fetch one extra row → has_more without COUNT), "Why is `id` in the tuple?" (unique tiebreaker, Q8-3), "What if a filter changes mid-scroll?" (filter-hash → 409 CURSOR_MISMATCH).

### B.3 — `POST /api/outreach/generate` (the metered AI path)

```java
@PostMapping("/api/outreach/generate")
public ResponseEntity<GenerationResponse> generate(@Valid @RequestBody GenerateRequest req) {
    return ResponseEntity.accepted().body(outreachFacade.generate(req.leadId(), securityContext.principal()));
}

// Facade — the 6-step flow (Q3-20's Facade pattern)
@Transactional
public GenerationResponse generate(UUID leadId, Principal p) {
    Lead lead = leadRepository.findInOrg(leadId, p.orgId()).orElseThrow(LeadNotFoundException::new); // 404 cross-tenant
    int cost = creditCosts.of("AI_GENERATION");                       // Redis-cached config, Q7-2
    creditService.reserve(p.userId(), cost, "AI_GEN", key(leadId));   // conditional UPDATE + PENDING ledger row
    try {
        GeneratedEmail email = aiGateway.generate(promptManager.build(lead, p.orgTone()), timeout(20s));
        // aiGateway: breaker + retry(429/5xx) + fallback-to-template chain (Q3-12); fallback marks AI_FALLBACK,
        // refunds the reservation, returns within budget -- user never sees a 500 for provider downtime
        validator.assertSafe(email);                                  // schema + injection-marker guards
        Generation gen = generationRepository.save(Generation.of(lead, email));
        creditService.confirm(key(leadId));                           // PENDING -> POSTED
        eventPublisher.publishEvent(new OutreachGeneratedEvent(gen.id(), p.orgId()));
        return GenerationResponse.of(gen);
    } catch (AiValidationException e) {
        creditService.refund(key(leadId));                            // compensating ledger entry
        throw e;
    }
}
// Event listeners (AFTER_COMMIT + @Async): analytics counter, hot-lead re-score, websocket push to UI
```

**Narration script:** tenant-scoped fetch (404 not 403) → credit RESERVATION (conditional UPDATE — the row is the lock) → provider call OUTSIDE the lock via the gateway's breaker stack → validation → confirm reservation → AFTER_COMMIT side effects. **Probe next:** "Crash after reserve, before confirm?" (sweeper reaps PENDING > 5 min — refund; idempotency key makes the retry safe), "Why not deduct AFTER the AI call?" (double-spend window), "What does the user see when the breaker is open?" (template fallback + AI_FALLBACK tag + no charge).

### B.4 — `POST /api/webhooks/stripe` (the money path)

```java
@PostMapping(value = "/api/webhooks/stripe", consumes = "application/json")
public ResponseEntity<Void> onStripe(HttpServletRequest request) throws IOException {
    String raw = request.getInputStream().readAllBytes()...;        // RAW body: signature needs exact bytes
    Event event = stripeVerifier.verifyAndParse(raw, sigHeader, tolerance(300s)); // HMAC + timestamp window
    webhookIngest.ingest(Provider.STRIPE, event.id(), event.type(), raw); // persist-then-ack
    return ResponseEntity.ok().build();                             // 2xx AFTER durability, NOT after processing
}

// Ingest: INSERT webhook_event (provider, event_id UNIQUE, payload, status=RECEIVED) -- dedupe is structural.
// Async worker (job-table, SKIP LOCKED):
@Transactional
public void process(WebhookEvent we) {
    switch (we.type()) {
        case "checkout.session.completed" -> billingService.activateSubscription(we); // idempotent: session id
        case "invoice.payment_failed"     -> billingService.markDunning(we);
        case "customer.subscription.deleted" -> billingService.downgrade(we);
        default -> webhookRegistry.markUnhandled(we);               // 2xx already sent; unknown = data, not error
    }
    we.markProcessed();
}
```

**Narration script:** raw-byte capture → signature + tolerance → persist with UNIQUE event-id (replays no-op structurally) → 2xx immediately → async idempotent handlers keyed on provider object ids → freshness alarm (no webhooks in 30 min = page) + hourly reconciliation sweep (RECEIVED older than 10 min → re-dispatch). **Probe next:** "Why 2xx before processing?" (provider retry storms + duplicate processing otherwise), "Handler crashes mid-activate?" (transaction rolls back, row stays RECEIVED, sweep re-dispatches — handler idempotency absorbs it), "A replayed checkout.completed for an already-active sub?" (idempotency key → no-op, ledger unchanged).

### B.5 — `POST /api/meetings/book` (the distributed-write path)

```java
@Transactional
public BookingResponse book(UUID slotId, BookerIdentity booker) {
    // 1. Atomic slot claim: DB is the concurrency control (Q6-13)
    int claimed = slotRepository.claim(slotId, PROPOSED, BOOKED);   // UPDATE ... WHERE id=? AND status='PROPOSED'
    if (claimed == 0) throw new SlotAlreadyBookedException();       // 409 + next-best slots
    MeetingSlot slot = slotRepository.findBooked(slotId);
    // 2. Google write AFTER local commit via outbox -- we do NOT call Google inside the transaction (Q6-11:
    //    no external I/O while holding row locks). Outbox row = instruction; relay executes events.insert.
    outbox.publish(new CalendarEventCreate(slot.id(), slot.window(), booker, slot.organizerToken()));
    eventPublisher.publishEvent(new MeetingBookedEvent(slot.id(), slot.orgId())); // AFTER_COMMIT: ICS emails
    return BookingResponse.confirmed(slot, "PENDING_CALENDAR_SYNC");
}
// Relay worker: executes CalendarCreate via Google API (refresh token envelope-decrypted per use, Q9-9),
// stores google_event_id back on the slot; failure -> compensation job retries -> if Google says CONFLICT,
// slot marked CONFLICT + apology email + re-propose flow (Q2-12's distributed-write failure story).
```

**Narration script:** conditional claim (rows-affected verdict) → outbox instruction → commit → relay does the Google call with compensation semantics → reconciliation on conflict. **Probe next:** "Why not call Google in the transaction?" (lock held across network I/O — the pool-starvation incident class, Q6-13), "Two leads click the same slot?" (second UPDATE matches zero rows → 409), "DB committed but Google insert fails permanently?" (compensation job + CONFLICT state + human-readable recovery — never silently lost).

### B.6 — `POST /api/leads/import` (the batch path)

```java
@PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
public ResponseEntity<ImportJobResponse> importLeads(@RequestPart("file") MultipartFile file) {
    validator.assertCsv(file);                       // magic-byte sniff + size cap (413 clean, Q3-15)
    String key = objectStorage.put(file);            // STREAMED to S3 (constant JVM memory), sha256 recorded
    ImportJob job = importService.enqueue(key, file.getSize(), securityContext.orgId()); // job-table row
    return ResponseEntity.accepted().body(ImportJobResponse.of(job));   // 202 + job id -- never parse inline
}
// Spring Batch job: FlatFileItemReader (from S3 stream, fetchSize=chunk) -> validate/transform processor
// (schema, dupes-in-file, dedupe-against-db via idempotency hash) -> JPA batch writer (jdbc batch_size 50,
// SEQUENCE ids, clear() per chunk 100 -- Q5-16's full stack). Progress = first-class resource:
// GET /api/leads/import/{jobId} -> {processed: 240000, total: 500000, rejected: 1204, reportUrl: ...}
```

**Narration script:** sniff + stream-to-storage (never heap) → 202 immediately → chunked batch with per-chunk commit checkpoints (crash = resume from last chunk, Q5-16) → per-row errors collected to a downloadable report → progress endpoint polled/SSE'd. **Probe next:** "Why not parse in the request?" (timeout lottery + deploy hazard, Q11-7), "Duplicate rows in the file AND in DB?" (idempotency hash per row + UNIQUE constraint — rejected-with-report, not silently merged), "A 2GB file?" (presigned direct-to-storage protocol, Q8-7 — the app never touches bytes).

---

