-- Optional profile fields and server-owned tracking timestamps; existing users retain NULL values.
ALTER TABLE "user"
  ADD COLUMN "firstName" TEXT,
  ADD COLUMN "lastName" TEXT,
  ADD COLUMN "lastLoginAt" TIMESTAMP(3),
  ADD COLUMN "onboardingCompletedAt" TIMESTAMP(3),
  ADD COLUMN "lastActiveAt" TIMESTAMP(3);
