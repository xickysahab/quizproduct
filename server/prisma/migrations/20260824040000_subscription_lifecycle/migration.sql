-- Subscription lifecycle.
--
-- Before this, a workspace's `plan` column was the whole story: a single
-- payment set it to PRO and nothing ever set it back. A monthly plan that
-- never expires is not a subscription, it is a one-time sale priced as if it
-- were recurring.

CREATE TYPE "SubscriptionStatus" AS ENUM ('NONE', 'ACTIVE', 'GRACE', 'EXPIRED', 'MANUAL');

ALTER TABLE "Organization"
  ADD COLUMN "planStatus"      "SubscriptionStatus" NOT NULL DEFAULT 'NONE',
  ADD COLUMN "planStartedAt"   TIMESTAMP(3),
  ADD COLUMN "planExpiresAt"   TIMESTAMP(3),
  ADD COLUMN "planCancelledAt" TIMESTAMP(3);

-- Everyone already on a paid plan got there by a SuperAdmin assigning it or by
-- the old never-expiring purchase. Either way there is no period on record, so
-- expiring them would be inventing a debt that was never agreed. Grandfather
-- them as MANUAL: full access, no expiry, and a SuperAdmin can move them onto
-- a real billing period whenever they next pay.
UPDATE "Organization" SET "planStatus" = 'MANUAL' WHERE "plan" <> 'FREE';

ALTER TABLE "Invoice"
  ADD COLUMN "plan"        "Plan",
  ADD COLUMN "periodStart" TIMESTAMP(3),
  ADD COLUMN "periodEnd"   TIMESTAMP(3);

-- The expiry sweep scans by status and date; without this it is a seq scan
-- over every workspace on every tick.
CREATE INDEX "Organization_planStatus_planExpiresAt_idx"
  ON "Organization" ("planStatus", "planExpiresAt");
