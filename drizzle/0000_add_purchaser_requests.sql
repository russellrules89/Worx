CREATE TABLE IF NOT EXISTS "purchaser_request" (
  "id" serial PRIMARY KEY,
  "organization" text NOT NULL,
  "contactName" text NOT NULL,
  "contactEmail" text NOT NULL,
  "dataRequirements" text NOT NULL,
  "estimatedBudgetUsd" numeric(18, 2),
  "status" text NOT NULL DEFAULT 'submitted',
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "purchaser_request_status_created_at_idx"
  ON "purchaser_request" ("status", "createdAt" DESC);

ALTER TABLE "task" ADD COLUMN IF NOT EXISTS "fundingReference" text;
