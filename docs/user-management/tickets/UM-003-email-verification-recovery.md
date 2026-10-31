# UM-003 — Email Verification & Password Recovery

| Field | Value |
| --- | --- |
| Ticket ID | UM-003 |
| Title | Email Verification & Password Recovery |
| Priority | **P0** |
| Story points | **5** |
| Dependencies | UM-002 |
| Blocks | UM-005 (invitation emails); soft for UM-004 (security notifications) |
| References | README §6, §15, §16, §17.1 (T2, T9, T11, T14) |

## User story

**As a** new or returning REDOVA user,
**I want** to verify my email address and recover access to my account when I forget my password,
**so that** only people who control the address can use the account, and I'm never locked out permanently.

## Business objective

Close the onboarding loop (BO-1) and provide a recovery path that can't be used to take over an account or enumerate users (BO-5). Establish the transactional email pipeline (queue → worker → Handlebars templates → transport) that later tickets reuse.

## Scope

### In scope

- `packages/queue`: `email` queue definition, producer with deterministic `jobId`, Redis connection factory.
- `apps/worker`: new standalone Node/NestJS application running the BullMQ email processor with graceful shutdown.
- `packages/integrations`: `EmailSender` port, `SmtpEmailSender` (nodemailer), `ProviderApiEmailSender` (behind decision D-11), Handlebars renderer, templates `verify-email`, `reset-password`, `existing-account`, `security-notification` + layout and partials.
- Replace the UM-001 development `enqueueEmail` with the BullMQ producer.
- Better Auth callbacks: `sendVerificationEmail`, `sendResetPassword`, `onPasswordReset`, `onExistingUserSignUp`, `afterEmailVerification`.
- Audit events: `auth.email.verified`, `auth.password.reset_requested`, `auth.password.reset_completed`.

### Out of scope

- `organization-invitation` template (UM-005); MFA-related and change-password notifications (UM-004). These reuse the `security-notification` template delivered here.
- Change email address (future). Any UI (backend-only phase).

## Implementation tasks

### `packages/queue`

- [x] `createRedisConnection(env)` (BullMQ-compatible, `maxRetriesPerRequest: null`).
- [x] `EMAIL_QUEUE = "email"`. `EmailJob` payload schema imported from `packages/contracts` and validated on enqueue **and** on process.
- [x] `enqueueEmail(job)`: `queue.add(job.template, job, { jobId: \`${job.template}-${sha256(job.dedupeKey)}\`, attempts: 5, backoff: { type: "exponential", delay: 30_000 }, removeOnComplete: true, removeOnFail: { age: 86_400 } })`.

### `packages/integrations`

- [x] `EmailSender` interface: `send({ to, subject, html, text }): Promise<{ messageId: string }>`.
- [x] `SmtpEmailSender` (nodemailer) configured from `SMTP_*` env. Dev: Gmail `smtp.gmail.com:465` secure with an App Password. Test/CI: Mailpit `localhost:1025`.
- [ ] `ProviderApiEmailSender` for the provider chosen in D-11. **[P1, blocked by D-11]** If D-11 is undecided at ticket start, deliver config validation that refuses `EMAIL_TRANSPORT=api` without an implemented provider and `EMAIL_API_KEY`.
- [x] `createEmailSender(env)` factory selecting by `EMAIL_TRANSPORT`. Startup check: `NODE_ENV=production` + `SMTP_HOST=smtp.gmail.com` → throw.
- [x] Handlebars renderer: precompile `templates/**/*.hbs` at startup; register `layouts/base.hbs` and partials `button`, `security-footer`; helpers `formatDate`, `truncate`. Render HTML + text variants and the subject. Strip CR/LF from subjects.
- [x] Templates: `verify-email`, `reset-password`, `existing-account`, `security-notification` (each `*.html.hbs`, `*.text.hbs`, `subject.hbs`).
- [x] Build-time guard test: no `{{{` in any template.

### `apps/worker`

- [x] Bootstrap: env validation (Zod), Redis connection, `Worker(EMAIL_QUEUE, processor, { concurrency: 5 })`.
- [x] Processor: validate payload → render → `EmailSender.send` → log `{ jobId, template, messageId, recipientDomain }`. Never log the payload or the full recipient address.
- [x] Graceful shutdown on SIGTERM/SIGINT (`worker.close()`).
- [x] `turbo dev` runs the worker alongside the server. `.env.example` for `apps/worker`.

### `packages/auth` (Better Auth callbacks)

- [x] `emailVerification.sendVerificationEmail({ user, url })` → enqueue `verify-email` (`dedupeKey = url`).
- [x] `emailAndPassword.sendResetPassword({ user, url })` → enqueue `reset-password` + audit `auth.password.reset_requested` (target = user).
- [x] `emailAndPassword.onPasswordReset({ user })` → enqueue `security-notification` (`eventLabel: "Password reset"`) + audit `auth.password.reset_completed` (★).
- [x] `emailAndPassword.onExistingUserSignUp({ user })` → enqueue `existing-account`.
- [x] `emailVerification.afterEmailVerification(user)` → audit `auth.email.verified`.
- [x] Confirm `verification.storeIdentifier: "hashed"` and that the verify/reset flows still work with it (tests below).
- [x] Rate-limit rules for `/send-verification-email`, `/request-password-reset`, `/reset-password` (README Appendix C.2).

### Test support

- [x] Mailpit API client helper for integration and API end-to-end tests (`waitForEmail(to, subject)`, `extractLink(email, prefix)`).

## Affected monorepo packages/apps

`packages/queue` (new), `packages/integrations` (new), `apps/worker` (new), `packages/auth`, `packages/contracts` (job schemas finalized), `apps/server` (tests), `docker/` (Mailpit used by tests).

## Database changes

None. The existing `verification` table is used natively, with hashed identifiers.

## Frontend requirements

None (backend-only phase). Links to future frontend pages (`signInUrl`, `secureAccountUrl`) are built from `WEB_ORIGIN` (README §16.2).

## Backend requirements

- All emails are sent asynchronously through the queue. Auth endpoints never await SMTP.
- Native action links (`verifyUrl`, `resetUrl`) are generated by Better Auth on `BETTER_AUTH_URL`. Client-supplied `callbackURL` / `redirectTo` must be on `WEB_ORIGIN`.
- Template variables are passed explicitly. Full user/entity objects are never passed to templates.

## Security considerations

- **Anti-enumeration:** `request-password-reset` answers identically for unknown emails (native). The `existing-account` mail goes only to the real owner.
- **Token handling:** reset tokens expire after 30 min, are single-use (native atomic consumption) and are stored hashed (`storeIdentifier: "hashed"`).
- **Open redirect:** `redirectTo` / `callbackURL` must be on a trusted origin (native validation).
- **Template injection:** escaped interpolation only; CR/LF stripped from subjects; user-supplied names truncated to 64 characters.
- **Queue payloads** contain action URLs with tokens. Mitigations: Redis password/TLS outside dev, `removeOnComplete`, failed jobs kept at most 24 h, payloads never logged.
- **Gmail credentials** are only in `apps/worker/.env.local` (git-ignored). The worker refuses Gmail SMTP in production.
- **Sessions after reset:** all revoked (native `revokeSessionsOnPasswordReset`).

## Acceptance criteria

### AC-003-01 — Verification email is delivered

- **Given** the worker running with Mailpit
- **When** a new user signs up with `callbackURL: WEB_ORIGIN + "/welcome"`
- **Then** Mailpit receives exactly one email to that address, subject "Verify your REDOVA email address", with HTML and text parts both containing a link starting with `BETTER_AUTH_URL/api/auth/verify-email?token=`.

### AC-003-02 — Verification signs the user in

- **Given** the link from AC-003-01
- **When** it is requested with `GET`
- **Then** `user.emailVerified` becomes `true`, the response sets a session cookie and redirects (`302`) to `WEB_ORIGIN/welcome`, and `auth.email.verified` is recorded.

### AC-003-03 — Expired or tampered verification link

- **Given** a verification link whose token is expired (test config `emailVerification.expiresIn = 1` s, waited 2 s) or has a modified character
- **When** it is requested
- **Then** no user is verified, no session cookie is set, and the redirect carries an `error` query parameter (or an error response when no `callbackURL` was given).

### AC-003-04 — Resend is rate-limited

- **When** `/send-verification-email` is called 4 times within 5 minutes from one IP
- **Then** the first 3 return `200` and the 4th returns `429` with `X-Retry-After`.

### AC-003-05 — Reset request does not reveal account existence

- **When** `request-password-reset` is called for an existing email and for an unknown email, both with `redirectTo: WEB_ORIGIN + "/reset-password"`
- **Then** both responses have the same status and body. Mailpit receives exactly one email, for the existing account. `auth.password.reset_requested` is recorded only for the existing account.

### AC-003-06 — Reset link hands the token to the client

- **Given** the reset email from AC-003-05
- **When** its link is requested with `GET`
- **Then** the response redirects (`302`) to `WEB_ORIGIN/reset-password?token=<token>`.

### AC-003-07 — Successful reset revokes every session

- **Given** a user signed in with two cookie jars who requested a reset
- **When** `POST /api/auth/reset-password { token, newPassword }` is called with a valid token and a valid password
- **Then** the password changes, both previous sessions are rejected on their next request, a `security-notification` email ("Password reset") is received, and `auth.password.reset_completed` is recorded.

### AC-003-08 — Reset token is single-use

- **Given** a token already used successfully
- **When** it is submitted again
- **Then** the API returns `400 INVALID_TOKEN` and the password is unchanged.

### AC-003-09 — Reset token expires

- **Given** a reset token whose `verification.expiresAt` is set to the past (test manipulation)
- **When** it is submitted
- **Then** the API returns `400 INVALID_TOKEN`.

### AC-003-10 — Tokens are not stored in clear

- **Given** a reset email containing token `T`
- **When** the `verification` table is inspected
- **Then** no `identifier` or `value` column contains `T` verbatim.

### AC-003-11 — Breached password rejected during reset

- **When** a valid token is submitted with a password present in the mocked HIBP range
- **Then** the API returns `400 PASSWORD_COMPROMISED` and the password is unchanged.

### AC-003-12 — Existing-account notice

- **Given** `alice@acme.io` exists
- **When** someone signs up again with that email
- **Then** the API response is the generic sign-up response, and Mailpit receives an `existing-account` email (not a verification email) for Alice.

### AC-003-13 — External redirect rejected

- **When** `request-password-reset` is called with `redirectTo: "https://evil.example/reset"`
- **Then** the request is rejected with a 4xx and no email is sent.

### AC-003-14 — Template escaping

- **Given** a user named `<img src=x onerror=alert(1)>`
- **When** any template is rendered for them
- **Then** the HTML output contains the escaped text (`&lt;img …`) and no `<img` tag from the name. The subject contains no CR or LF.

### AC-003-15 — Delivery retries and deduplication

- **Given** Mailpit stopped
- **When** a verification email is enqueued
- **Then** the job fails and is retried with exponential backoff. After Mailpit is restarted, exactly one email is delivered. Enqueuing the same job twice (same `dedupeKey`) results in one job.

### AC-003-16 — Gmail is refused in production

- **Given** `NODE_ENV=production` and `SMTP_HOST=smtp.gmail.com`
- **When** the worker starts
- **Then** it exits non-zero with an explicit configuration error.

## Test cases

### Unit

| ID | Test |
| --- | --- |
| UT-003-01 | Each template renders HTML + text + subject with sample variables (snapshot). |
| UT-003-02 | No template file contains `{{{` (filesystem scan). |
| UT-003-03 | Escaping and truncation of malicious names; subject CR/LF stripping (AC-003-14). |
| UT-003-04 | `createEmailSender` selection and the production Gmail guard (AC-003-16). |
| UT-003-05 | Job `jobId` derivation is deterministic and differs per `dedupeKey`. |
| UT-003-06 | Job payload schema rejects unknown templates or missing variables. |

### Integration (server + worker + PostgreSQL + Redis + Mailpit)

| ID | Test | AC |
| --- | --- | --- |
| IT-003-01 | Sign-up → Mailpit has one verification email with the expected link prefix | AC-003-01 |
| IT-003-02 | Follow verify link → `emailVerified`, cookie, 302, audit | AC-003-02 |
| IT-003-03 | Expired and tampered verification tokens | AC-003-03 |
| IT-003-04 | Resend rate limit | AC-003-04 |
| IT-003-05 | Reset request: identical responses, one email, conditional audit | AC-003-05 |
| IT-003-06 | Reset link redirects with token to `redirectTo` | AC-003-06 |
| IT-003-07 | Reset success revokes sessions + notification + audit | AC-003-07 |
| IT-003-08 | Token reuse and expiry | AC-003-08, AC-003-09 |
| IT-003-09 | DB inspection: token not stored verbatim | AC-003-10 |
| IT-003-10 | HIBP mocked compromised on reset | AC-003-11 |
| IT-003-11 | Duplicate sign-up sends `existing-account` | AC-003-12 |
| IT-003-12 | External `redirectTo` rejected, no email | AC-003-13 |
| IT-003-13 | Retry with SMTP down/up; dedupe | AC-003-15 |

### API end-to-end (running server + worker + Mailpit)

| ID | Test | AC |
| --- | --- | --- |
| E2E-003-01 | Sign up → read Mailpit → follow link → `get-session` returns the user, verified | AC-003-01, AC-003-02 |
| **E2E-JOURNEY-03** | Request reset → link from Mailpit → follow redirect → `reset-password` → old cookie jar rejected → sign in with the new password succeeds; a second use of the same token returns `INVALID_TOKEN` | AC-003-06, 07, 08 |

## Implementation notes

- The BullMQ `jobId` is `${template}-${sha256(dedupeKey)}`: BullMQ 6 rejects custom ids containing `:`.
- `ProviderApiEmailSender` stays blocked by D-11. `createEmailSender` refuses `EMAIL_TRANSPORT=api` with an explicit configuration error.
- Server integration tests replace the producer with an in-memory capture (`createTestApp().emails`); real delivery through Redis and Mailpit is covered by the worker integration suite (`apps/worker/test`).
- E2E-003-01 and E2E-JOURNEY-03 are delivered with the API end-to-end harness in UM-008; their assertions are already covered at integration level (IT-003-01..08).

## Definition of Done

- [ ] Global Definition of Done (README §20) satisfied.
- [x] All AC-003-xx automated and green (integration level; API end-to-end journeys land with the UM-008 E2E harness).
- [ ] Manual check in development with a Gmail App Password: verification and reset emails arrive and render correctly in Gmail web and one mobile client (screenshots in the PR).
- [x] The shared root `.env.example` documents every email variable (one env file for the monorepo, UM-001). The README §16.3 Gmail notes are accurate.
- [x] The UM-001 development `enqueueEmail` stub is removed.
