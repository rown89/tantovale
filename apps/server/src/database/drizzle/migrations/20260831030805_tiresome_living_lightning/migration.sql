LOCK TABLE "addresses", "entity_trustap_transactions", "items", "orders", "orders_proposals", "profiles" IN ACCESS EXCLUSIVE MODE;
--> statement-breakpoint
ALTER TABLE "entity_trustap_transactions" ALTER COLUMN "transaction_id" TYPE bigint USING "transaction_id"::bigint;
--> statement-breakpoint
ALTER TABLE "entity_trustap_transactions" ADD COLUMN "reconciliation_required" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "payment_transaction_id" TYPE bigint USING "payment_transaction_id"::bigint;
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
ALTER TABLE "orders" ADD COLUMN "legacy_payment_transaction_id" bigint;
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "payment_attempt_id" uuid;
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "payment_creation_state" text DEFAULT 'created' NOT NULL;
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "payment_cancellation_state" text DEFAULT 'none' NOT NULL;
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "item_price" integer;
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "order_proposal_id" integer;
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "shipping_quote_id" uuid;
--> statement-breakpoint
INSERT INTO commerce_reconciliation_audit (conflict_type, source_table, source_row_id, original_reference, snapshot)
SELECT 'legacy_order_provider_status', 'orders', target.id, target.status, to_jsonb(target)
FROM orders AS target
WHERE target.status NOT IN ('payment_pending', 'payment_confirmed', 'payment_failed', 'payment_refunded', 'shipping_pending', 'shipping_confirmed', 'completed', 'cancelled', 'expired');
--> statement-breakpoint
UPDATE orders
SET status = CASE status
	WHEN 'created' THEN 'payment_pending'
	WHEN 'joined' THEN 'payment_pending'
	WHEN 'paid' THEN 'payment_confirmed'
	WHEN 'rejected' THEN 'payment_failed'
	WHEN 'cancelled' THEN 'cancelled'
	WHEN 'tracked' THEN 'shipping_confirmed'
	WHEN 'cancelled_with_payment' THEN 'payment_refunded'
	WHEN 'payment_refunded' THEN 'payment_refunded'
	WHEN 'delivered' THEN 'completed'
	WHEN 'complaint_period_ended' THEN 'completed'
	WHEN 'funds_released' THEN 'completed'
	ELSE 'payment_pending'
END,
payment_creation_state = CASE
	WHEN payment_transaction_id IS NULL
		OR status = 'complained'
		OR status NOT IN ('created', 'joined', 'paid', 'rejected', 'cancelled', 'tracked', 'cancelled_with_payment', 'payment_refunded', 'delivered', 'complaint_period_ended', 'funds_released', 'payment_pending', 'payment_confirmed', 'payment_failed', 'shipping_pending', 'shipping_confirmed', 'completed', 'expired')
		THEN 'reconciliation_required'
	ELSE payment_creation_state
END,
updated_at = now()
WHERE status NOT IN ('payment_pending', 'payment_confirmed', 'payment_failed', 'payment_refunded', 'shipping_pending', 'shipping_confirmed', 'completed', 'cancelled', 'expired');
--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_status_check" CHECK ("status" IN ('payment_pending', 'payment_confirmed', 'payment_failed', 'payment_refunded', 'shipping_pending', 'shipping_confirmed', 'completed', 'cancelled', 'expired'));
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
INSERT INTO commerce_reconciliation_audit (conflict_type, source_table, source_row_id, original_reference, snapshot)
SELECT 'legacy_status_missing_transaction', 'orders', target.id, target.status, to_jsonb(target)
FROM orders AS target
WHERE target.payment_transaction_id IS NULL;
--> statement-breakpoint
WITH candidate AS (
	SELECT target.id AS order_id, min(proposal.id) AS proposal_id, count(*) AS candidate_count
	FROM orders AS target
	JOIN orders_proposals AS proposal
		ON proposal.item_id = target.item_id
		AND proposal.profile_id = target.buyer_id
		AND proposal.status = 'accepted'
	GROUP BY target.id
)
UPDATE orders AS target
SET order_proposal_id = candidate.proposal_id
FROM candidate
WHERE target.id = candidate.order_id AND candidate.candidate_count = 1;
--> statement-breakpoint
UPDATE orders AS target
SET item_price = proposal.proposal_price
FROM orders_proposals AS proposal
WHERE target.order_proposal_id = proposal.id AND proposal.proposal_price > 0;
--> statement-breakpoint
UPDATE orders AS target
SET item_price = transaction.price - target.platform_charge
FROM entity_trustap_transactions AS transaction
JOIN profiles AS buyer_profile ON buyer_profile.payment_provider_id = transaction.buyer_id
JOIN profiles AS seller_profile ON seller_profile.payment_provider_id = transaction.seller_id
WHERE target.item_price IS NULL
	AND target.payment_transaction_id IS NOT NULL
	AND transaction.transaction_id = target.payment_transaction_id
	AND transaction.entity_id = target.item_id
	AND buyer_profile.id = target.buyer_id
	AND seller_profile.id = target.seller_id
	AND transaction.currency = 'eur'
	AND transaction.price - target.platform_charge > 0
	AND transaction.charge = target.payment_provider_charge
	AND transaction.charge_seller = 0;
--> statement-breakpoint
INSERT INTO commerce_reconciliation_audit (conflict_type, source_table, source_row_id, original_reference, snapshot)
SELECT 'audited_item_price_fallback', 'orders', target.id, 'items.price', to_jsonb(target)
FROM orders AS target
WHERE target.item_price IS NULL;
--> statement-breakpoint
UPDATE orders AS target
SET item_price = item.price,
	payment_creation_state = 'reconciliation_required',
	updated_at = now()
FROM items AS item
WHERE target.item_price IS NULL AND target.item_id = item.id AND item.price > 0;
--> statement-breakpoint
DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM orders WHERE item_price IS NULL OR item_price <= 0) THEN
		RAISE EXCEPTION 'M07 cannot safely backfill immutable item_price for every legacy order';
	END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "item_price" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_item_price_positive" CHECK ("item_price" > 0);
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
CREATE TEMP TABLE m07_conflicted_transactions (transaction_id bigint PRIMARY KEY) ON COMMIT DROP;
--> statement-breakpoint
INSERT INTO m07_conflicted_transactions (transaction_id)
SELECT DISTINCT original_reference::bigint
FROM commerce_reconciliation_audit
WHERE conflict_type = 'ambiguous_provider_transaction';
--> statement-breakpoint
INSERT INTO m07_conflicted_transactions (transaction_id)
SELECT DISTINCT target.payment_transaction_id
FROM orders AS target
LEFT JOIN entity_trustap_transactions AS transaction ON transaction.transaction_id = target.payment_transaction_id
LEFT JOIN profiles AS buyer_profile ON buyer_profile.id = target.buyer_id
LEFT JOIN profiles AS seller_profile ON seller_profile.id = target.seller_id
WHERE target.payment_transaction_id IS NOT NULL
	AND (
		transaction.id IS NULL
		OR target.item_id IS NULL OR target.buyer_id IS NULL OR target.seller_id IS NULL
		OR target.buyer_address IS NULL OR target.seller_address IS NULL
		OR target.payment_attempt_id IS NULL OR target.item_price IS NULL
		OR target.shipping_price <= 0 OR target.platform_charge < 0 OR target.payment_provider_charge < 0
		OR transaction.entity_id IS DISTINCT FROM target.item_id
		OR transaction.buyer_id IS DISTINCT FROM buyer_profile.payment_provider_id
		OR transaction.seller_id IS DISTINCT FROM seller_profile.payment_provider_id
		OR transaction.currency IS DISTINCT FROM 'eur'
		OR transaction.price IS DISTINCT FROM target.item_price + target.platform_charge
		OR transaction.charge IS DISTINCT FROM target.payment_provider_charge
		OR transaction.charge_seller IS DISTINCT FROM 0
	)
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO commerce_reconciliation_audit (conflict_type, source_table, source_row_id, original_reference, snapshot)
SELECT 'financial_graph_mismatch', 'orders', target.id, target.payment_transaction_id::text, to_jsonb(target)
FROM orders AS target
WHERE target.payment_transaction_id IN (SELECT transaction_id FROM m07_conflicted_transactions)
	OR target.payment_transaction_id IS NULL
	OR target.item_id IS NULL OR target.buyer_id IS NULL OR target.seller_id IS NULL
	OR target.buyer_address IS NULL OR target.seller_address IS NULL OR target.payment_attempt_id IS NULL;
--> statement-breakpoint
INSERT INTO commerce_reconciliation_audit (conflict_type, source_table, source_row_id, original_reference, snapshot)
SELECT 'quarantined_provider_transaction', 'entity_trustap_transactions', transaction.id,
	transaction.transaction_id::text, to_jsonb(transaction)
FROM entity_trustap_transactions AS transaction
WHERE transaction.transaction_id IN (SELECT transaction_id FROM m07_conflicted_transactions);
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
UPDATE entity_trustap_transactions
SET reconciliation_required = true, updated_at = now()
WHERE transaction_id IN (SELECT transaction_id FROM m07_conflicted_transactions);
--> statement-breakpoint
UPDATE orders AS target
SET legacy_payment_transaction_id = target.payment_transaction_id,
	payment_transaction_id = NULL,
	status = 'cancelled',
	payment_creation_state = 'reconciliation_required',
	updated_at = now()
WHERE target.payment_transaction_id IN (SELECT transaction_id FROM m07_conflicted_transactions)
	OR target.payment_transaction_id IS NULL
	OR target.item_id IS NULL OR target.buyer_id IS NULL OR target.seller_id IS NULL
	OR target.buyer_address IS NULL OR target.seller_address IS NULL OR target.payment_attempt_id IS NULL;
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
ALTER TABLE "orders_proposals" ADD CONSTRAINT "orders_proposals_pending_quote_check" CHECK ("status" <> 'pending' OR ("shipping_quote_id" IS NOT NULL AND "shipping_price" IS NOT NULL AND "shipping_price" > 0));
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
ALTER TABLE "entity_trustap_transactions" ADD CONSTRAINT "entity_trustap_transactions_active_graph_check" CHECK ("reconciliation_required" OR ("entity_id" IS NOT NULL AND "seller_id" IS NOT NULL AND "buyer_id" IS NOT NULL AND "currency" = 'eur' AND "price" > 0 AND "charge" >= 0 AND "charge_seller" = 0));
--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_operational_graph_check" CHECK (
	"payment_creation_state" = 'reconciliation_required' OR (
		"item_id" IS NOT NULL AND "buyer_id" IS NOT NULL AND "seller_id" IS NOT NULL
		AND "buyer_address" IS NOT NULL AND "seller_address" IS NOT NULL
		AND "payment_attempt_id" IS NOT NULL
		AND (("payment_creation_state" = 'created' AND "payment_transaction_id" IS NOT NULL)
			OR ("payment_creation_state" IN ('preparing', 'creating') AND "payment_transaction_id" IS NULL))
	)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "entity_trustap_transactions_transaction_id_idx" ON "entity_trustap_transactions" ("transaction_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "orders_proposals_pending_item_buyer_idx" ON "orders_proposals" ("item_id","profile_id") WHERE "status" = 'pending';
--> statement-breakpoint
CREATE UNIQUE INDEX "orders_payment_transaction_id_idx" ON "orders" ("payment_transaction_id") WHERE "payment_transaction_id" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "orders_active_item_idx" ON "orders" ("item_id") WHERE "status" IN ('payment_pending', 'payment_confirmed', 'shipping_pending', 'shipping_confirmed', 'completed');
--> statement-breakpoint
CREATE TABLE "payment_invitation_outbox" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
	"order_id" integer NOT NULL,
	"transaction_id" bigint NOT NULL,
	"recipient_email" text NOT NULL,
	"merchant_username" text NOT NULL,
	"item_name" text NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"lease_token" uuid,
	"lease_expires_at" timestamp with time zone,
	"last_attempt_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_invitation_outbox_order_id_orders_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE cascade,
	CONSTRAINT "payment_invitation_outbox_state_check" CHECK ("state" IN ('pending', 'sending', 'sent')),
	CONSTRAINT "payment_invitation_outbox_attempt_count_check" CHECK ("attempt_count" >= 0),
	CONSTRAINT "payment_invitation_outbox_lease_check" CHECK (
		("state" = 'pending' AND "lease_token" IS NULL AND "lease_expires_at" IS NULL AND "sent_at" IS NULL)
		OR ("state" = 'sending' AND "lease_token" IS NOT NULL AND "lease_expires_at" IS NOT NULL AND "last_attempt_at" IS NOT NULL AND "lease_expires_at" > "last_attempt_at" AND "sent_at" IS NULL)
		OR ("state" = 'sent' AND "lease_token" IS NULL AND "lease_expires_at" IS NULL AND "sent_at" IS NOT NULL)
	)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "payment_invitation_outbox_order_idx" ON "payment_invitation_outbox" ("order_id");
