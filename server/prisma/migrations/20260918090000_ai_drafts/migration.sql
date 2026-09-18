-- AlterTable
ALTER TABLE "PricingPlan" ADD COLUMN "aiDraftsPerMonth" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "UsageMeter" ADD COLUMN "aiDrafts" INTEGER NOT NULL DEFAULT 0;
