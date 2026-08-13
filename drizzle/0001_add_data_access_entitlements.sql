CREATE TABLE IF NOT EXISTS "data_access_entitlement" (
  "id" serial PRIMARY KEY,
  "paymentId" text NOT NULL UNIQUE,
  "productId" text NOT NULL,
  "payer" text NOT NULL,
  "proofHash" text NOT NULL,
  "termsVersion" text NOT NULL,
  "createdAt" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "data_access_entitlement_product_created_at_idx"
  ON "data_access_entitlement" ("productId", "createdAt" DESC);
