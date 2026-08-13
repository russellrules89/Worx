import { pgTable, text, timestamp, boolean, serial, integer, jsonb, numeric } from "drizzle-orm/pg-core"

// ---------- Better Auth tables (do not rename columns) ----------
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("emailVerified")
    .$defaultFn(() => false)
    .notNull(),
  image: text("image"),
  // 'worker' (default) or 'owner'. Ownership is stored here rather than
  // relying only on the OWNER_EMAIL env var.
  role: text("role").notNull().default("worker"),
  // Worker's crypto wallet address for USDC payouts.
  payoutAddress: text("payoutAddress"),
  createdAt: timestamp("createdAt")
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: timestamp("updatedAt")
    .$defaultFn(() => new Date())
    .notNull(),
})

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expiresAt").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("createdAt").notNull(),
  updatedAt: timestamp("updatedAt").notNull(),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
})

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  idToken: text("idToken"),
  accessTokenExpiresAt: timestamp("accessTokenExpiresAt"),
  refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("createdAt").notNull(),
  updatedAt: timestamp("updatedAt").notNull(),
})

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").$defaultFn(() => new Date()),
  updatedAt: timestamp("updatedAt").$defaultFn(() => new Date()),
})

// ---------- App tables ----------
export const task = pgTable("task", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(), // 'annotation' | 'voice'
  title: text("title").notNull(),
  instructions: text("instructions").notNull(),
  payload: jsonb("payload"),
  // 100 DATA = $1, so the minimum task value is 2,500 DATA ($25).
  rewardTokens: integer("rewardTokens").notNull().default(2500),
  status: text("status").notNull().default("open"), // open | claimed | completed
  // Owner-provided reference to the verified sponsor agreement/funding record.
  fundingReference: text("fundingReference"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
})

export const submission = pgTable("submission", {
  id: serial("id").primaryKey(),
  taskId: integer("taskId").notNull(),
  userId: text("userId").notNull(),
  taskType: text("taskType").notNull(),
  data: jsonb("data"),
  status: text("status").notNull().default("pending"), // 'pending' | 'approved' | 'rejected'
  aiScore: integer("aiScore"),
  aiFeedback: text("aiFeedback"),
  rewardTokens: integer("rewardTokens").notNull().default(0),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
})

export const ledgerEntry = pgTable("ledger_entry", {
  id: serial("id").primaryKey(),
  userId: text("userId").notNull(),
  amount: integer("amount").notNull(),
  reason: text("reason").notNull(),
  submissionId: integer("submissionId"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
})

export const payout = pgTable("payout", {
  id: serial("id").primaryKey(),
  userId: text("userId").notNull(),
  dataAmount: integer("dataAmount").notNull(), // DATA tokens debited from the worker (gross)
  feeData: integer("feeData").notNull().default(0), // platform fee withheld, in DATA (your profit)
  usdcAmount: numeric("usdcAmount", { precision: 18, scale: 6 }).notNull(), // net USDC sent to worker
  toAddress: text("toAddress").notNull(),
  status: text("status").notNull().default("pending"), // 'pending' | 'sent' | 'confirmed' | 'failed'
  txHash: text("txHash"),
  error: text("error"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
})

// Owner withdrawals: moving accumulated platform profit (USDC) out of the
// treasury to the owner's personal wallet.
export const ownerWithdrawal = pgTable("owner_withdrawal", {
  id: serial("id").primaryKey(),
  usdcAmount: numeric("usdcAmount", { precision: 18, scale: 6 }).notNull(),
  toAddress: text("toAddress").notNull(),
  status: text("status").notNull().default("pending"), // 'pending' | 'sent' | 'failed'
  txHash: text("txHash"),
  error: text("error"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
})

// A purchaser request is a lead only. It never authorizes data release or
// payouts until the owner has verified the buyer, accepted terms, and funded USDC.
export const purchaserRequest = pgTable("purchaser_request", {
  id: serial("id").primaryKey(),
  organization: text("organization").notNull(),
  contactName: text("contactName").notNull(),
  contactEmail: text("contactEmail").notNull(),
  dataRequirements: text("dataRequirements").notNull(),
  estimatedBudgetUsd: numeric("estimatedBudgetUsd", { precision: 18, scale: 2 }),
  status: text("status").notNull().default("submitted"), // submitted | verified | funded | declined
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
})

// A verified payment grants access only to the specific approved data product.
// The unique payment reference prevents replaying a settled payment.
export const dataAccessEntitlement = pgTable("data_access_entitlement", {
  id: serial("id").primaryKey(),
  paymentId: text("paymentId").notNull().unique(),
  productId: text("productId").notNull(),
  payer: text("payer").notNull(),
  proofHash: text("proofHash").notNull(),
  termsVersion: text("termsVersion").notNull(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
})
