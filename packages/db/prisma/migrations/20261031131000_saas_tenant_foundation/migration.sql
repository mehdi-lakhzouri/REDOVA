-- SaaS tenant metadata only: authorization, billing and quota enforcement remain application concerns.
BEGIN;

CREATE TYPE "TenantSubscriptionStatus" AS ENUM ('INCOMPLETE', 'TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED');

ALTER TABLE "member"
  ADD COLUMN "lastActiveAt" TIMESTAMP(3),
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "suspendedAt" TIMESTAMP(3),
  ADD CONSTRAINT "member_status_check" CHECK ("status" IN ('ACTIVE', 'SUSPENDED', 'REVOKED'));

ALTER TABLE "organization"
  ADD COLUMN "archivedAt" TIMESTAMP(3),
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "suspendedAt" TIMESTAMP(3),
  ADD COLUMN "suspensionReason" TEXT,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD CONSTRAINT "organization_status_check" CHECK ("status" IN ('ACTIVE', 'SUSPENDED', 'ARCHIVED'));

CREATE TABLE "organization_settings" (
  "organizationId" TEXT NOT NULL,
  "requireMfa" BOOLEAN NOT NULL DEFAULT false,
  "sessionMaxAgeSeconds" INTEGER,
  "auditRetentionDays" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "organization_settings_pkey" PRIMARY KEY ("organizationId"),
  CONSTRAINT "organization_settings_session_age_check" CHECK ("sessionMaxAgeSeconds" > 0),
  CONSTRAINT "organization_settings_audit_retention_check" CHECK ("auditRetentionDays" > 0),
  CONSTRAINT "organization_settings_organizationId_fkey" FOREIGN KEY ("organizationId")
    REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "tenant_subscription" (
  "organizationId" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "status" "TenantSubscriptionStatus" NOT NULL DEFAULT 'INCOMPLETE',
  "trialEndsAt" TIMESTAMP(3),
  "currentPeriodEnd" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tenant_subscription_pkey" PRIMARY KEY ("organizationId"),
  CONSTRAINT "tenant_subscription_plan_check" CHECK (length(btrim("planId")) > 0),
  CONSTRAINT "tenant_subscription_organizationId_fkey" FOREIGN KEY ("organizationId")
    REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "tenant_quota" (
  "organizationId" TEXT NOT NULL,
  "maxMembers" INTEGER,
  "maxAgents" INTEGER,
  "maxAssessments" INTEGER,
  "maxStorageBytes" BIGINT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tenant_quota_pkey" PRIMARY KEY ("organizationId"),
  CONSTRAINT "tenant_quota_members_check" CHECK ("maxMembers" >= 0),
  CONSTRAINT "tenant_quota_agents_check" CHECK ("maxAgents" >= 0),
  CONSTRAINT "tenant_quota_assessments_check" CHECK ("maxAssessments" >= 0),
  CONSTRAINT "tenant_quota_storage_check" CHECK ("maxStorageBytes" >= 0),
  CONSTRAINT "tenant_quota_organizationId_fkey" FOREIGN KEY ("organizationId")
    REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "tenant_subscription_status_idx" ON "tenant_subscription"("status");
CREATE INDEX "member_organizationId_status_idx" ON "member"("organizationId", "status");
CREATE INDEX "organization_status_idx" ON "organization"("status");

-- Existing tenants receive neutral defaults; no subscription/plan is invented during migration.
INSERT INTO "organization_settings" ("organizationId") SELECT "id" FROM "organization";
INSERT INTO "tenant_quota" ("organizationId") SELECT "id" FROM "organization";

COMMIT;
