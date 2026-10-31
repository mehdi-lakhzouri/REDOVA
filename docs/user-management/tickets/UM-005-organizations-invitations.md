# UM-005 — Organizations, Members & Invitations

| Field | Value |
| --- | --- |
| Ticket ID | UM-005 |
| Title | Organizations, Members & Invitations |
| Priority | **P0** |
| Story points | **5** |
| Dependencies | UM-003 (email pipeline), UM-006 (escalation rules) |
| Blocks | UM-008 |
| References | README §8.2, §9.1, §10, §13, §15, §16.2 |

## User story

**As a** security team lead,
**I want** to create my organization, invite colleagues with the right role, manage their membership and switch between the organizations I belong to,
**so that** my team can collaborate in REDOVA while every member only gets the access their role allows.

## Business objective

Complete self-service onboarding through the API (BO-1) and make the organization, the unit of tenant isolation (BO-2), manageable by its owners without operator help.

## Scope

### In scope

- Verification, through tests, of the native organization flows configured in UM-001: create, check slug, update, list, get full organization, set active, invite, cancel, accept, reject, get invitation, list members, update role, remove, leave.
- `organization-invitation` email template + `sendInvitationEmail` wiring.
- Custom hooks: slug format and reserved slugs on creation; slug immutability, name and logo validation on update.
- Audit events: `org.created`, `org.updated`, `org.invitation.created|canceled|accepted|rejected`, `org.member.role_changed|removed|left`.
- Verification of which native hooks fire for `leave` and invitation acceptance (risk RK-3).

### Out of scope

- Organization deletion (disabled, D-07), ownership transfer, teams, custom roles, logo upload (URL only).
- Organization audit log API (UM-008).
- Escalation rules themselves (delivered in UM-006; this ticket must not duplicate them).
- Any UI (backend-only phase).

## Implementation tasks

### `packages/auth`

- [x] Verify the organization plugin config from UM-001 (`creatorRole`, `allowUserToCreateOrganization` = verified only, `organizationLimit: 3`, `invitationExpiresIn: 604800`, `cancelPendingInvitationsOnReInvite`, `requireEmailVerificationOnInvitation`, `disableOrganizationDeletion`).
- [x] `sendInvitationEmail({ invitation, inviter, organization })` → enqueue `organization-invitation` with `acceptUrl = ${WEB_ORIGIN}/invitations/${invitation.id}` and `dedupeKey = invitation.id`.
- [x] `organizationHooks.beforeCreateOrganization`: validate the slug format `^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])$`; reject reserved slugs (`admin`, `api`, `settings`, `new`, `orgs`, `invitations`); validate `name` 2–64 characters.
- [x] `organizationHooks.beforeUpdateOrganization`: reject any `slug` change (`ORG_SLUG_IMMUTABLE`); validate `name` 2–64 and `logo` as an `https:` URL ≤ 2048 characters.
- [x] Audit wiring: `afterCreateOrganization` → `org.created`; `afterUpdateOrganization` → `org.updated` (metadata: changed field names only); `afterCreateInvitation` / `afterCancelInvitation` / `afterAcceptInvitation` / `afterRejectInvitation` → `org.invitation.*`; `afterUpdateMemberRole` → `org.member.role_changed` (metadata `{ previousRole, newRole }`); `afterRemoveMember` → `org.member.removed`; `hooks.after` on `/organization/leave` → `org.member.left`. The actor is the session user (from `getSessionFromCtx` where the hook data does not include the actor).
- [x] Document in README §17.4 any difference found in hook firing (e.g. `leave` does not call `afterRemoveMember`, as the source suggests).

### `packages/integrations`

- [x] Template `organization-invitation` (HTML, text, subject) per README §16.2, with role label mapping (`SECURITY_ENGINEER` → "Security Engineer", …).

### Test support

- [x] Factories: `createOrganization(owner, { slug })`, `addMemberViaInvitation(org, inviter, user, role)`.

## Affected monorepo packages/apps

`packages/auth` (hooks), `packages/integrations` (template), `packages/contracts` (audit metadata schemas), `packages/db` (test factories), `apps/server` (tests).

## Database changes

None. Uses the native `organization`, `member`, `invitation` tables and the `member (organizationId, userId)` unique constraint from UM-001.

## Frontend requirements

None (backend-only phase). The invitation email links to the future frontend page `WEB_ORIGIN/invitations/{id}`. API clients accept invitations with `POST /api/auth/organization/accept-invitation { invitationId }`.

## Backend requirements

- All organization operations use native `/api/auth/organization/*` endpoints. No REDOVA facade (bounded collections, README §18.3).
- Escalation rules from UM-006 apply to every mutation.
- Hooks never throw for audit failures (logged instead).

## Security considerations

- **Invitation binding:** acceptance requires the signed-in user's verified email to match (native). `get-invitation` requires a session and the recipient's email (native). No invitation detail is readable anonymously.
- **Invitation link guessing:** invitation ids are random (native `generateId`), and expired/canceled invitations are unusable (native).
- **Organization creation abuse:** verified users only, max 3 per user, rate limit on invite (10/min).
- **Slug immutability** keeps future URLs and references stable and stops a slug from being changed to impersonate another organization.
- **Removal is effective immediately:** membership is re-checked on every request (UM-006).
- **HTML injection in emails:** organization name and inviter name are escaped (UM-003 renderer).
- **Invitation visibility:** any member can list pending invitations (native, D-18).

## Acceptance criteria

### AC-005-01 — Verified user creates an organization

- **Given** a verified user with no membership
- **When** they call `organization/create` with name "Acme Security" and slug `acme-security`
- **Then** the organization exists, they are its only member with role `ORG_OWNER`, `session.activeOrganizationId` is the new organization, and `org.created` is recorded.

### AC-005-02 — Creation constraints

- **When** a verified user with 3 organizations creates a 4th, or anyone uses a taken, reserved (`admin`) or invalid (`Acme!`) slug
- **Then** creation is rejected with an explicit error and no organization is created.

### AC-005-03 — Slug is immutable

- **Given** organization `acme-security`
- **When** an `ORG_OWNER` calls `organization/update` with `{ slug: "acme" }`
- **Then** the API returns `ORG_SLUG_IMMUTABLE` and the slug is unchanged. Updating `name` succeeds and records `org.updated` with `metadata.fields = ["name"]`.

### AC-005-04 — Invitation email

- **Given** Olivia (`ORG_OWNER`)
- **When** she invites `bob@x.io` as `AI_DEVELOPER`
- **Then** a pending invitation expiring in 7 days exists, Mailpit receives one `organization-invitation` email whose link is `WEB_ORIGIN/invitations/{id}` and which shows the organization name, Olivia's name and "AI Developer", and `org.invitation.created` is recorded.

### AC-005-05 — Re-invite replaces the pending invitation

- **Given** a pending invitation for `bob@x.io`
- **When** Olivia invites him again (resend)
- **Then** the previous invitation becomes `canceled`, exactly one invitation is `pending`, and a new email is sent.

### AC-005-06 — New user accepts an invitation

- **Given** a pending invitation for `bob@x.io`, who has no account
- **When** Bob signs up with `bob@x.io`, verifies his email, calls `get-invitation` and then `accept-invitation` with the id taken from the email
- **Then** `get-invitation` returns the organization, inviter and role; after acceptance Bob is a member with role `AI_DEVELOPER`, the organization is his active organization, the invitation is `accepted`, and `org.invitation.accepted` is recorded.

### AC-005-07 — Invitation is bound to its recipient

- **Given** a pending invitation for `bob@x.io`
- **When** a signed-in user `eve@x.io` calls `get-invitation` or `accept-invitation` for it
- **Then** both return `403 YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION` and no membership is created.

### AC-005-08 — Unverified recipients cannot accept

- **Given** a pending invitation for `bob@x.io`, and a session for Bob whose `emailVerified` was forced back to `false` in the DB (a normal unverified user has no session at all, SR-01)
- **When** Bob calls `accept-invitation`
- **Then** the API returns `403 EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION` and no membership is created.

### AC-005-09 — Expired and canceled invitations

- **Given** an invitation whose `expiresAt` is in the past, and another that was canceled
- **When** the recipient tries to accept either
- **Then** acceptance fails and no membership is created.

### AC-005-10 — Anonymous access to invitations is impossible

- **When** `GET /api/auth/organization/get-invitation?id=…` is called without a session
- **Then** the response is `401` and contains no invitation detail.

### AC-005-11 — Decline

- **When** Bob rejects a pending invitation
- **Then** its status becomes `rejected`, no membership is created, and `org.invitation.rejected` is recorded.

### AC-005-12 — Change role and remove member (allowed cases)

- **Given** Olivia (`ORG_OWNER`) and Dave (`VIEWER`)
- **When** Olivia changes Dave to `SECURITY_ENGINEER` (with `organizationId` in the body)
- **Then** the role changes and `org.member.role_changed` is recorded with `previousRole: VIEWER`.
- **When** she then removes Dave
- **Then** Dave's membership is deleted, `org.member.removed` is recorded, and Dave's next call to `get-full-organization` for that organization is rejected as a non-member.

### AC-005-13 — Leave organization

- **Given** Dave is a `VIEWER`
- **When** he calls `organization/leave`
- **Then** his membership is deleted and `org.member.left` is recorded.
- **When** the only `ORG_OWNER` tries to leave
- **Then** the native last-owner error is returned and nothing changes.

### AC-005-14 — Active organization switching

- **Given** Mia belongs to A (`AUDITOR`) and B (`VIEWER`)
- **When** she calls `organization/set-active` with B
- **Then** `session.activeOrganizationId` becomes B and `get-active-member` returns her B membership with role `VIEWER`.
- **When** she calls `set-active` with an organization C she does not belong to
- **Then** the request is rejected with `403 USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION` and the active organization is cleared (native fail-closed behavior; no access to C is granted).

### AC-005-15 — Members are visible to members only

- **Given** Mia is a member of A but not of C
- **When** she calls `list-members` and `list-invitations` for A and for C
- **Then** A succeeds (members and pending invitations are visible to every member, D-18), and C is rejected as a non-member.

## Test cases

### Unit

| ID | Test |
| --- | --- |
| UT-005-01 | Slug validation regex + reserved list. |
| UT-005-02 | `organization-invitation` template snapshot; role label mapping; escaping of organization and inviter names. |
| UT-005-03 | Organization update validation (name length, `https:` logo URL, slug change detection). |

### Integration

| ID | Test | AC |
| --- | --- | --- |
| IT-005-01 | Create organization → owner membership, active org, audit | AC-005-01 |
| IT-005-02 | Limit, taken, reserved and invalid slugs; unverified user cannot create | AC-005-02 |
| IT-005-03 | Slug update rejected; name update audited | AC-005-03 |
| IT-005-04 | Invite → Mailpit email content + audit | AC-005-04 |
| IT-005-05 | Re-invite cancels the previous invitation | AC-005-05 |
| IT-005-06 | Accept with matching verified user; mismatch → 403 | AC-005-06, AC-005-07 |
| IT-005-07 | Forged unverified session cannot accept | AC-005-08 |
| IT-005-08 | Expired / canceled acceptance | AC-005-09 |
| IT-005-09 | Anonymous `get-invitation` → 401 | AC-005-10 |
| IT-005-10 | Reject flow + audit | AC-005-11 |
| IT-005-11 | Role change + removal + audit; removed member rejected | AC-005-12 |
| IT-005-12 | Leave + last-owner leave blocked; audit `org.member.left` | AC-005-13 |
| IT-005-13 | `set-active` to own / foreign organization | AC-005-14 |
| IT-005-14 | Member/invitation listing for member vs non-member | AC-005-15 |
| IT-005-15 | Hook-firing verification for `leave` and `accept` (RK-3) | — |

### API end-to-end (running server + worker + Mailpit)

| ID | Test | AC |
| --- | --- | --- |
| **E2E-JOURNEY-01** | Sign up → verification link from Mailpit → create organization → `get-full-organization` shows one `ORG_OWNER` | AC-005-01 |
| **E2E-JOURNEY-02** | Owner invites → invitee (new) signs up → verifies → reads the invitation id from the invitation email → accepts → `get-active-member` shows `AI_DEVELOPER` | AC-005-04, 06 |
| **E2E-JOURNEY-06** | User in two organizations: `set-active` switches; a REDOVA tenant-scoped call (UM-006 test endpoint, or the org audit endpoint once UM-008 lands) uses the **path** organization regardless of the active one | AC-005-14 |

## Implementation notes

- Field rules live in `packages/core` (`validateOrgCreation`, `validateOrgUpdate`) and are enforced by `organizationHooks`; new hook codes: `ORG_SLUG_INVALID`, `ORG_SLUG_RESERVED`, `ORG_NAME_INVALID`, `ORG_LOGO_INVALID`, `ORG_SLUG_IMMUTABLE`. Sending the current slug back is not a change.
- The invitation email `dedupeKey` is `{invitation.id}:{expiresAt}`: a `resend` keeps the id but extends `expiresAt`, so it must not be deduplicated.
- AC-005-14 was adjusted to the native fail-closed behavior of `set-active` (the active organization is cleared on a rejected switch).
- Server integration tests assert the enqueued `organization-invitation` job; rendering is covered by `packages/integrations` snapshots and delivery by the worker suite. E2E-JOURNEY-01, 02 and 06 are delivered with the API end-to-end harness in UM-008.

## Definition of Done

- [ ] Global Definition of Done (README §20) satisfied.
- [x] All AC-005-xx automated and green, including E2E-JOURNEY-01, 02 and 06 (CI `e2e` job, UM-008).
- [x] UM-006 escalation tests still green (no rule duplicated or bypassed).
- [x] Hook-firing behavior verified (IT-005-15). README §17.4 updated if needed.
- [ ] Invitation email checked in Gmail (dev) and Mailpit (screenshots).
