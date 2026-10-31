# Runbook — Operator MFA reset

| Field | Value |
| --- | --- |
| Use when | A user lost their authenticator **and** all backup codes |
| Command | `pnpm --filter @redova/server mfa:reset -- --email <email> --reason "<text>"` |
| Who may run it | The platform operator with production database access. Never on a user's own request alone. |
| Audit | `admin.user.mfa_reset`, actor `SYSTEM`, `metadata.reason`, `metadata.sessionsRevoked` |
| References | README §7.6, UM-004 (AC-004-16) |

A user who still has backup codes must not use this procedure. They sign in with a backup code, then disable and re-enroll MFA themselves (README §7.6).

## 1. Verify the identity out of band

An MFA reset removes the second factor, so the identity check replaces it. Complete **all** of these steps and write down the evidence in the support ticket:

1. The request comes from the account's email address, and you answer the request in a **new** email to that address, not as a reply.
2. The user confirms details only the owner knows: their organization names and roles, and their approximate account creation date.
3. For a `PLATFORM_ADMIN` or an `ORG_OWNER`, a second operator confirms the identity through a separate channel (video call or a known phone number).

Stop if any check fails or the request is urgent without explanation. Urgent pressure is a common social-engineering pattern.

## 2. Run the reset

```bash
pnpm --filter @redova/server build
DATABASE_URL=<production url> pnpm --filter @redova/server mfa:reset -- \
  --email alice@acme.io \
  --reason "lost device; identity verified by email + call, ticket SUP-123"
```

The command shows what it will do and asks you to **type the email again**. Any other answer changes nothing (exit code 1).

On success, in one transaction:

- every `twoFactor` row of the user is deleted and `user.twoFactorEnabled` is set to `false`;
- **all** sessions of the user are revoked;
- `admin.user.mfa_reset` is recorded with the reason.

## 3. After the reset

1. Tell the user, from a new email, that MFA was reset and that they must sign in with their password and enroll MFA again right away.
2. A `PLATFORM_ADMIN` cannot reach the admin API until MFA is re-enrolled (`MFA_ENROLLMENT_REQUIRED`).
3. Check the audit trail: `SELECT * FROM audit_event WHERE action = 'admin.user.mfa_reset' ORDER BY "occurredAt" DESC LIMIT 5;`
4. Close the support ticket with the identity evidence and the audit event id.
