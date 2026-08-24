-- Plans become data.
--
-- They were a constant in the source, so changing a price meant a code change,
-- a review and a deploy — and left no record of who changed it or when. Pricing
-- is a commercial decision; it should not need an engineer.
--
-- The enum goes with them. An enum cannot gain a value without a migration,
-- which is the whole thing being removed here.

CREATE TABLE "PricingPlan" (
  "id"                   TEXT NOT NULL,
  "code"                 TEXT NOT NULL,
  "label"                TEXT NOT NULL,
  "blurb"                TEXT NOT NULL,
  "pricePaise"           INTEGER NOT NULL DEFAULT 0,
  "eventsPerMonth"       INTEGER NOT NULL,
  "participantsPerEvent" INTEGER NOT NULL,
  "questionsPerEvent"    INTEGER NOT NULL,
  "branding"             BOOLEAN NOT NULL DEFAULT false,
  "isActive"             BOOLEAN NOT NULL DEFAULT true,
  "isDefault"            BOOLEAN NOT NULL DEFAULT false,
  "sortOrder"            INTEGER NOT NULL DEFAULT 0,
  "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"            TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PricingPlan_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PricingPlan_code_key" ON "PricingPlan"("code");
CREATE INDEX "PricingPlan_isActive_sortOrder_idx" ON "PricingPlan"("isActive", "sortOrder");

-- Exactly one plan is the default. A partial unique index makes that the
-- database's rule rather than something the application is trusted to keep:
-- two defaults would make "which plan does a new workspace get" ambiguous, and
-- zero would make signup fail.
CREATE UNIQUE INDEX "PricingPlan_one_default" ON "PricingPlan"("isDefault") WHERE "isDefault";

-- Seed with exactly what the constants held, so nothing changes on the day
-- this ships. Prices are in paise, exclusive of GST.
INSERT INTO "PricingPlan"
  ("id", "code", "label", "blurb", "pricePaise", "eventsPerMonth", "participantsPerEvent", "questionsPerEvent", "branding", "isDefault", "sortOrder", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'FREE', 'Free',
   'For trying it out in a classroom or a team meeting.',
   0, 5, 50, 20, false, true, 0, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'PRO', 'Pro',
   'For a department, a college, or a company running regular sessions.',
   149900, 100, 500, 100, true, false, 1, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'ENTERPRISE', 'Enterprise',
   'For conferences and campus-wide rollouts.',
   749900, 10000, 5000, 500, true, false, 2, CURRENT_TIMESTAMP);

-- Move the two columns off the enum. The values are identical strings, so no
-- row changes meaning; only the type does.
ALTER TABLE "Organization" ALTER COLUMN "plan" DROP DEFAULT;
ALTER TABLE "Organization" ALTER COLUMN "plan" TYPE TEXT USING "plan"::TEXT;
ALTER TABLE "Organization" ALTER COLUMN "plan" SET DEFAULT 'FREE';

ALTER TABLE "Invoice" ALTER COLUMN "plan" TYPE TEXT USING "plan"::TEXT;

DROP TYPE "Plan";
