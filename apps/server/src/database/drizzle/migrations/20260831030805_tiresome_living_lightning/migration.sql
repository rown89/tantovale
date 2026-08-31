LOCK TABLE "addresses", "entity_trustap_transactions", "items", "orders", "orders_proposals", "profiles" IN ACCESS EXCLUSIVE MODE;
--> statement-breakpoint
CREATE TABLE "commerce_reconciliation_audit" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
	"conflict_type" text NOT NULL,
	"source_table" text NOT NULL,
	"source_row_id" integer NOT NULL,
	"canonical_row_id" integer,
	"original_reference" text,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "commerce_reconciliation_audit_source_idx" ON "commerce_reconciliation_audit" ("source_table","source_row_id");
--> statement-breakpoint
CREATE TABLE "shipping_quotes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"checkout_attempt_id" uuid,
	"item_id" integer NOT NULL,
	"buyer_profile_id" integer NOT NULL,
	"seller_profile_id" integer NOT NULL,
	"buyer_address_id" integer NOT NULL,
	"seller_address_id" integer NOT NULL,
	"shippo_shipment_id" text NOT NULL,
	"shippo_rate_id" text NOT NULL,
	"amount" integer NOT NULL,
	"currency" text NOT NULL,
	"snapshot_fingerprint" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shipping_quotes_shippo_rate_id_key" UNIQUE("shippo_rate_id"),
	CONSTRAINT "shipping_quotes_checkout_attempt_id_key" UNIQUE("checkout_attempt_id"),
	CONSTRAINT "shipping_quotes_amount_positive" CHECK ("shipping_quotes"."amount" > 0),
	CONSTRAINT "shipping_quotes_currency_eur" CHECK ("shipping_quotes"."currency" = 'EUR')
);
--> statement-breakpoint
ALTER TABLE "shipping_quotes" ADD CONSTRAINT "shipping_quotes_item_id_items_id_fkey" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE cascade;
--> statement-breakpoint
ALTER TABLE "shipping_quotes" ADD CONSTRAINT "shipping_quotes_buyer_profile_id_profiles_id_fkey" FOREIGN KEY ("buyer_profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE cascade;
--> statement-breakpoint
ALTER TABLE "shipping_quotes" ADD CONSTRAINT "shipping_quotes_seller_profile_id_profiles_id_fkey" FOREIGN KEY ("seller_profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE cascade;
--> statement-breakpoint
ALTER TABLE "shipping_quotes" ADD CONSTRAINT "shipping_quotes_buyer_address_id_addresses_id_fkey" FOREIGN KEY ("buyer_address_id") REFERENCES "public"."addresses"("id") ON DELETE cascade ON UPDATE cascade;
--> statement-breakpoint
ALTER TABLE "shipping_quotes" ADD CONSTRAINT "shipping_quotes_seller_address_id_addresses_id_fkey" FOREIGN KEY ("seller_address_id") REFERENCES "public"."addresses"("id") ON DELETE cascade ON UPDATE cascade;
--> statement-breakpoint
CREATE INDEX "shipping_quotes_item_buyer_expiry_idx" ON "shipping_quotes" ("item_id","buyer_profile_id","expires_at");
--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "payment_provider_identity_attempt_id" uuid;
--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "payment_provider_identity_state" text DEFAULT 'uninitialized' NOT NULL;
--> statement-breakpoint
UPDATE "profiles" SET "payment_provider_identity_state" = 'created' WHERE "payment_provider_id" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_payment_provider_identity_attempt_id_key" UNIQUE("payment_provider_identity_attempt_id");
--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_payment_provider_identity_state_check" CHECK ("payment_provider_identity_state" IN ('uninitialized', 'creating', 'reconciliation_required', 'created'));
--> statement-breakpoint
ALTER TABLE "orders_proposals" ADD COLUMN "shipping_quote_id" uuid;
--> statement-breakpoint
ALTER TABLE "orders_proposals" ADD COLUMN "shipping_price" integer;
--> statement-breakpoint
ALTER TABLE "orders_proposals" ADD CONSTRAINT "orders_proposals_shipping_quote_id_shipping_quotes_id_fkey" FOREIGN KEY ("shipping_quote_id") REFERENCES "public"."shipping_quotes"("id") ON DELETE restrict ON UPDATE cascade;
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "legacy_payment_transaction_id" integer;
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "payment_attempt_id" uuid;
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "payment_creation_state" text DEFAULT 'created' NOT NULL;
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "payment_cancellation_state" text DEFAULT 'none' NOT NULL;
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "payment_recovery_notification_claimed_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "item_price" integer;
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "order_proposal_id" integer;
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "shipping_quote_id" uuid;
--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_payment_attempt_id_key" UNIQUE("payment_attempt_id");
--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_order_proposal_id_key" UNIQUE("order_proposal_id");
--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_order_proposal_id_orders_proposals_id_fkey" FOREIGN KEY ("order_proposal_id") REFERENCES "public"."orders_proposals"("id") ON DELETE restrict ON UPDATE cascade;
--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_shipping_quote_id_shipping_quotes_id_fkey" FOREIGN KEY ("shipping_quote_id") REFERENCES "public"."shipping_quotes"("id") ON DELETE restrict ON UPDATE cascade;
--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_payment_creation_state_check" CHECK ("payment_creation_state" IN ('preparing', 'creating', 'reconciliation_required', 'created'));
--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_payment_cancellation_state_check" CHECK ("payment_cancellation_state" IN ('none', 'cancelling', 'reconciliation_required', 'cancelled'));
--> statement-breakpoint
WITH ambiguous AS (
	SELECT transaction_id, min(id) AS canonical_id
	FROM entity_trustap_transactions
	GROUP BY transaction_id
	HAVING count(DISTINCT entity_id) > 1
)
INSERT INTO commerce_reconciliation_audit (conflict_type, source_table, source_row_id, canonical_row_id, original_reference, snapshot)
SELECT 'ambiguous_provider_transaction', 'entity_trustap_transactions', transaction.id, ambiguous.canonical_id,
	transaction.transaction_id::text, to_jsonb(transaction)
FROM ambiguous
JOIN entity_trustap_transactions AS transaction ON transaction.transaction_id = ambiguous.transaction_id;
--> statement-breakpoint
WITH ranked AS (
	SELECT id, first_value(id) OVER (PARTITION BY transaction_id ORDER BY created_at, id) AS canonical_id,
		row_number() OVER (PARTITION BY transaction_id ORDER BY created_at, id) AS duplicate_rank
	FROM entity_trustap_transactions
)
INSERT INTO commerce_reconciliation_audit (conflict_type, source_table, source_row_id, canonical_row_id, original_reference, snapshot)
SELECT 'duplicate_provider_transaction', 'entity_trustap_transactions', transaction.id, ranked.canonical_id,
	transaction.transaction_id::text, to_jsonb(transaction)
FROM ranked
JOIN entity_trustap_transactions AS transaction ON transaction.id = ranked.id
WHERE ranked.duplicate_rank > 1;
--> statement-breakpoint
WITH ranked AS (
	SELECT id, row_number() OVER (PARTITION BY transaction_id ORDER BY created_at, id) AS duplicate_rank
	FROM entity_trustap_transactions
)
DELETE FROM entity_trustap_transactions AS transaction
USING ranked
WHERE transaction.id = ranked.id AND ranked.duplicate_rank > 1;
--> statement-breakpoint
WITH conflicted_references AS (
	SELECT DISTINCT target.payment_transaction_id AS transaction_id
	FROM orders AS target
	LEFT JOIN entity_trustap_transactions AS transaction
		ON transaction.transaction_id = target.payment_transaction_id
	WHERE target.payment_transaction_id IS NOT NULL
		AND (transaction.id IS NULL OR transaction.entity_id IS DISTINCT FROM target.item_id)
	UNION
	SELECT DISTINCT original_reference::integer
	FROM commerce_reconciliation_audit
	WHERE conflict_type = 'ambiguous_provider_transaction'
)
INSERT INTO commerce_reconciliation_audit (conflict_type, source_table, source_row_id, original_reference, snapshot)
SELECT 'financial_graph_mismatch', 'orders', target.id, target.payment_transaction_id::text, to_jsonb(target)
FROM orders AS target
JOIN conflicted_references ON conflicted_references.transaction_id = target.payment_transaction_id;
--> statement-breakpoint
WITH conflicted_references AS (
	SELECT DISTINCT target.payment_transaction_id AS transaction_id
	FROM orders AS target
	LEFT JOIN entity_trustap_transactions AS transaction
		ON transaction.transaction_id = target.payment_transaction_id
	WHERE target.payment_transaction_id IS NOT NULL
		AND (transaction.id IS NULL OR transaction.entity_id IS DISTINCT FROM target.item_id)
	UNION
	SELECT DISTINCT original_reference::integer
	FROM commerce_reconciliation_audit
	WHERE conflict_type = 'ambiguous_provider_transaction'
)
UPDATE orders AS target
SET legacy_payment_transaction_id = target.payment_transaction_id,
	payment_transaction_id = NULL,
	status = 'cancelled',
	payment_creation_state = 'reconciliation_required',
	updated_at = now()
FROM conflicted_references
WHERE target.payment_transaction_id = conflicted_references.transaction_id;
--> statement-breakpoint
WITH ranked AS (
	SELECT id, first_value(id) OVER (PARTITION BY item_id, profile_id ORDER BY created_at, id) AS canonical_id,
		row_number() OVER (PARTITION BY item_id, profile_id ORDER BY created_at, id) AS duplicate_rank
	FROM orders_proposals
	WHERE status = 'pending'
)
INSERT INTO commerce_reconciliation_audit (conflict_type, source_table, source_row_id, canonical_row_id, snapshot)
SELECT 'duplicate_pending_proposal', 'orders_proposals', proposal.id, ranked.canonical_id, to_jsonb(proposal)
FROM ranked
JOIN orders_proposals AS proposal ON proposal.id = ranked.id
WHERE ranked.duplicate_rank > 1;
--> statement-breakpoint
WITH ranked AS (
	SELECT id, row_number() OVER (PARTITION BY item_id, profile_id ORDER BY created_at, id) AS duplicate_rank
	FROM orders_proposals
	WHERE status = 'pending'
)
UPDATE orders_proposals AS proposal
SET status = 'expired', updated_at = now()
FROM ranked
WHERE proposal.id = ranked.id AND ranked.duplicate_rank > 1;
--> statement-breakpoint
INSERT INTO commerce_reconciliation_audit (conflict_type, source_table, source_row_id, snapshot)
SELECT 'legacy_pending_proposal', 'orders_proposals', proposal.id, to_jsonb(proposal)
FROM orders_proposals AS proposal
WHERE proposal.status = 'pending' AND (proposal.shipping_quote_id IS NULL OR proposal.shipping_price IS NULL);
--> statement-breakpoint
UPDATE orders_proposals
SET status = 'expired', updated_at = now()
WHERE status = 'pending' AND (shipping_quote_id IS NULL OR shipping_price IS NULL);
--> statement-breakpoint
WITH ranked AS (
	SELECT id, first_value(id) OVER (PARTITION BY item_id ORDER BY created_at, id) AS canonical_id,
		row_number() OVER (PARTITION BY item_id ORDER BY created_at, id) AS duplicate_rank
	FROM orders
	WHERE status IN ('payment_pending', 'payment_confirmed', 'shipping_pending', 'shipping_confirmed', 'completed')
)
INSERT INTO commerce_reconciliation_audit (conflict_type, source_table, source_row_id, canonical_row_id, original_reference, snapshot)
SELECT 'duplicate_active_order', 'orders', target.id, ranked.canonical_id, target.payment_transaction_id::text, to_jsonb(target)
FROM ranked
JOIN orders AS target ON target.id = ranked.id
WHERE ranked.duplicate_rank > 1;
--> statement-breakpoint
WITH ranked AS (
	SELECT id, row_number() OVER (PARTITION BY item_id ORDER BY created_at, id) AS duplicate_rank
	FROM orders
	WHERE status IN ('payment_pending', 'payment_confirmed', 'shipping_pending', 'shipping_confirmed', 'completed')
)
UPDATE orders AS target
SET status = 'cancelled', payment_creation_state = 'reconciliation_required', updated_at = now()
FROM ranked
WHERE target.id = ranked.id AND ranked.duplicate_rank > 1;
--> statement-breakpoint
WITH ranked AS (
	SELECT id, first_value(id) OVER (PARTITION BY payment_transaction_id ORDER BY created_at, id) AS canonical_id,
		row_number() OVER (PARTITION BY payment_transaction_id ORDER BY created_at, id) AS duplicate_rank
	FROM orders
	WHERE payment_transaction_id IS NOT NULL
)
INSERT INTO commerce_reconciliation_audit (conflict_type, source_table, source_row_id, canonical_row_id, original_reference, snapshot)
SELECT 'duplicate_order_transaction', 'orders', target.id, ranked.canonical_id, target.payment_transaction_id::text, to_jsonb(target)
FROM ranked
JOIN orders AS target ON target.id = ranked.id
WHERE ranked.duplicate_rank > 1;
--> statement-breakpoint
WITH ranked AS (
	SELECT id, row_number() OVER (PARTITION BY payment_transaction_id ORDER BY created_at, id) AS duplicate_rank
	FROM orders
	WHERE payment_transaction_id IS NOT NULL
)
UPDATE orders AS target
SET legacy_payment_transaction_id = target.payment_transaction_id,
	payment_transaction_id = NULL,
	status = 'cancelled',
	payment_creation_state = 'reconciliation_required',
	updated_at = now()
FROM ranked
WHERE target.id = ranked.id AND ranked.duplicate_rank > 1;
--> statement-breakpoint
CREATE UNIQUE INDEX "entity_trustap_transactions_transaction_id_idx" ON "entity_trustap_transactions" ("transaction_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "orders_proposals_pending_item_buyer_idx" ON "orders_proposals" ("item_id","profile_id") WHERE "status" = 'pending';
--> statement-breakpoint
CREATE UNIQUE INDEX "orders_payment_transaction_id_idx" ON "orders" ("payment_transaction_id") WHERE "payment_transaction_id" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "orders_active_item_idx" ON "orders" ("item_id") WHERE "status" IN ('payment_pending', 'payment_confirmed', 'shipping_pending', 'shipping_confirmed', 'completed');
