import { readFile } from 'node:fs/promises';
import { Client } from 'pg';
import { describe, expect, inject, it } from 'vitest';

import { createDatabaseConnectionConfig, quoteIdentifier } from './database-admin';

const migrationUrl = new URL(
	'../../src/database/drizzle/migrations/20260831030805_tiresome_living_lightning/migration.sql',
	import.meta.url,
);

async function waitForBlockedWriter(client: Client): Promise<void> {
	const deadline = Date.now() + 3_000;
	do {
		const result = await client.query<{ blocked: boolean }>(`
			SELECT EXISTS (
				SELECT 1
				FROM pg_stat_activity
				WHERE query LIKE '%m07-concurrent-writer%'
					AND cardinality(pg_blocking_pids(pid)) > 0
			) AS blocked
		`);
		if (result.rows[0]?.blocked) return;
		await new Promise((resolve) => setTimeout(resolve, 20));
	} while (Date.now() < deadline);
	throw new Error('Concurrent writer was not blocked by the migration table lock');
}

describe('M07 commerce migration', () => {
	it('locks out writers, preserves conflict evidence, and installs all uniqueness invariants', async () => {
		const runtime = inject('testRuntime');
		const database = `tantovale_api_test_${runtime.runId}_m07`;
		const admin = new Client(createDatabaseConnectionConfig(runtime, 'postgres'));
		let migrationClient: Client | undefined;
		let writer: Client | undefined;

		await admin.connect();
		try {
			await admin.query(
				`CREATE DATABASE ${quoteIdentifier(database)} TEMPLATE ${quoteIdentifier(runtime.resourceNames.templateDatabase)}`,
			);
			migrationClient = new Client(createDatabaseConnectionConfig(runtime, database));
			writer = new Client(createDatabaseConnectionConfig(runtime, database));
			await migrationClient.connect();
			await writer.connect();

			await migrationClient.query(`
				DROP INDEX entity_trustap_transactions_transaction_id_idx;
				DROP INDEX orders_proposals_pending_item_buyer_idx;
				DROP INDEX orders_payment_transaction_id_idx;
				DROP INDEX orders_active_item_idx;
				ALTER TABLE orders DROP CONSTRAINT orders_payment_attempt_id_key;
				ALTER TABLE orders DROP CONSTRAINT orders_order_proposal_id_key;
				ALTER TABLE orders DROP CONSTRAINT orders_order_proposal_id_orders_proposals_id_fkey;
				ALTER TABLE orders DROP CONSTRAINT orders_shipping_quote_id_shipping_quotes_id_fkey;
				ALTER TABLE orders DROP CONSTRAINT orders_payment_creation_state_check;
					ALTER TABLE orders DROP CONSTRAINT orders_payment_cancellation_state_check;
					ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
					ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_item_price_positive;
					ALTER TABLE orders_proposals DROP CONSTRAINT IF EXISTS orders_proposals_pending_quote_check;
				ALTER TABLE orders DROP COLUMN legacy_payment_transaction_id;
				ALTER TABLE orders DROP COLUMN payment_attempt_id;
				ALTER TABLE orders DROP COLUMN payment_creation_state;
				ALTER TABLE orders DROP COLUMN payment_cancellation_state;
				ALTER TABLE orders DROP COLUMN payment_recovery_notification_claimed_at;
				ALTER TABLE orders DROP COLUMN item_price;
				ALTER TABLE orders DROP COLUMN order_proposal_id;
				ALTER TABLE orders DROP COLUMN shipping_quote_id;
				ALTER TABLE orders_proposals DROP CONSTRAINT orders_proposals_shipping_quote_id_shipping_quotes_id_fkey;
				ALTER TABLE orders_proposals DROP COLUMN shipping_quote_id;
				ALTER TABLE orders_proposals DROP COLUMN shipping_price;
				DROP TABLE shipping_quotes;
				DROP TABLE commerce_reconciliation_audit;
				ALTER TABLE profiles DROP CONSTRAINT profiles_payment_provider_identity_attempt_id_key;
				ALTER TABLE profiles DROP CONSTRAINT profiles_payment_provider_identity_state_check;
				ALTER TABLE profiles DROP COLUMN payment_provider_identity_attempt_id;
					ALTER TABLE profiles DROP COLUMN payment_provider_identity_state;
					ALTER TABLE entity_trustap_transactions ALTER COLUMN transaction_id TYPE integer USING transaction_id::integer;
					ALTER TABLE orders ALTER COLUMN payment_transaction_id TYPE integer USING payment_transaction_id::integer;
			`);

			await migrationClient.query(`
				SET session_replication_role = replica;
				INSERT INTO users (id, username, email, password) OVERRIDING SYSTEM VALUE VALUES
					(1, 'seller', 'seller@example.test', 'x'), (2, 'buyer', 'buyer@example.test', 'x');
					INSERT INTO profiles (id, user_id, name, surname, gender) OVERRIDING SYSTEM VALUE VALUES
						(1, 1, 'Seller', 'One', 'male'), (2, 2, 'Buyer', 'One', 'female');
					UPDATE profiles SET payment_provider_id = CASE id WHEN 1 THEN 'legacy-seller' ELSE 'legacy-buyer' END;
				INSERT INTO addresses (id, profile_id, street_address, civic_number, city_id, province_id, postal_code, phone)
					OVERRIDING SYSTEM VALUE VALUES
					(1, 1, 'Seller street', '1', 1, 1, 10000, '1'), (2, 2, 'Buyer street', '2', 1, 1, 10000, '2');
				INSERT INTO categories (id, name, slug) OVERRIDING SYSTEM VALUE VALUES (1, 'Category', 'category');
				INSERT INTO subcategories (id, name, slug, category_id) OVERRIDING SYSTEM VALUE VALUES
					(1, 'Subcategory', 'subcategory', 1);
				INSERT INTO items (id, profile_id, subcategory_id, address_id, title, description, published, price, easy_pay)
					OVERRIDING SYSTEM VALUE VALUES
						(1, 1, 1, 1, 'Item one', 'Description', true, 10000, true),
						(2, 1, 1, 1, 'Item two', 'Description', true, 20000, true),
						(3, 1, 1, 1, 'Raw paid item', 'Description', true, 30000, true),
						(4, 1, 1, 1, 'Unknown state item', 'Description', true, 40000, true);
				INSERT INTO orders_proposals
					(id, item_id, profile_id, original_price, proposal_price, payment_provider_charge, platform_charge, shipping_label_id, status, created_at)
					OVERRIDING SYSTEM VALUE VALUES
					(1, 1, 2, 10000, 9000, 450, 90, 'shipment-1', 'pending', now() - interval '2 hours'),
					(2, 1, 2, 10000, 8000, 400, 80, 'shipment-2', 'pending', now() - interval '1 hour');
				INSERT INTO chat_rooms (id, item_id, buyer_id) OVERRIDING SYSTEM VALUE VALUES (1, 1, 2);
				SELECT setval(pg_get_serial_sequence('orders_proposals', 'id'), 2, true);
				INSERT INTO chat_messages (id, chat_room_id, sender_id, message, message_type, order_proposal_id)
					OVERRIDING SYSTEM VALUE VALUES (1, 1, 2, 'Preserve duplicate proposal history', 'proposal', 2);
					INSERT INTO entity_trustap_transactions
						(id, entity_id, seller_id, buyer_id, transaction_id, status, price, charge, charge_seller, entity_title, created_at)
						OVERRIDING SYSTEM VALUE VALUES
						(1, 2, 'legacy-seller', 'legacy-buyer', 500, 'created', 20180, 1000, 0, 'Item two ambiguous oldest', now() - interval '2 hours'),
						(2, 1, 'legacy-seller', 'legacy-buyer', 500, 'created', 10090, 500, 0, 'Item one ambiguous duplicate', now() - interval '1 hour'),
						(3, 1, 'legacy-seller', 'legacy-buyer', 700, 'created', 10090, 500, 0, 'Item one correlated', now() - interval '30 minutes');
				INSERT INTO orders
					(id, item_id, payment_provider_charge, platform_charge, shipping_label_id, shipping_price, buyer_id, seller_id, buyer_address, seller_address, payment_transaction_id, status, created_at)
					OVERRIDING SYSTEM VALUE VALUES
					(1, 1, 500, 90, 'shipment-1', 750, 2, 1, 2, 1, 500, 'payment_pending', now() - interval '4 hours'),
					(2, 1, 450, 80, 'shipment-2', 750, 2, 1, 2, 1, 500, 'payment_pending', now() - interval '3 hours'),
					(3, 2, 1000, 180, 'shipment-3', 750, 2, 1, 2, 1, 500, 'payment_pending', now() - interval '2 hours'),
					(4, 2, 900, 160, 'shipment-4', 750, 2, 1, 2, 1, 600, 'payment_pending', now() - interval '1 hour'),
					(5, 1, 500, 90, 'shipment-5', 750, 2, 1, 2, 1, 700, 'payment_pending', now() - interval '30 minutes'),
						(6, 1, 500, 90, 'shipment-6', 750, 2, 1, 2, 1, 700, 'payment_pending', now() - interval '20 minutes'),
						(7, 3, 500, 90, 'shipment-7', 750, 2, 1, 2, 1, NULL, 'paid', now() - interval '10 minutes'),
						(8, 4, 500, 90, 'shipment-8', 750, 2, 1, 2, 1, NULL, 'provider_future_state', now() - interval '5 minutes');
				SET session_replication_role = DEFAULT;
			`);

			const migration = await readFile(migrationUrl, 'utf8');
			const statements = migration
				.split('--> statement-breakpoint')
				.map((statement) => statement.trim())
				.filter(Boolean);
			expect(statements[0]).toMatch(/^LOCK TABLE .* ACCESS EXCLUSIVE MODE;$/s);

			await migrationClient.query('BEGIN');
			await migrationClient.query(statements[0]!);
			const writerResultPromise = writer
				.query(
					`/* m07-concurrent-writer */
					INSERT INTO orders_proposals
						(item_id, profile_id, original_price, proposal_price, payment_provider_charge, platform_charge, shipping_label_id)
					VALUES (1, 2, 10000, 7000, 350, 70, 'shipment-concurrent')`,
				)
				.then(
					() => ({ ok: true as const }),
					(error: unknown) => ({ ok: false as const, error }),
				);
			await waitForBlockedWriter(migrationClient);
			for (const statement of statements.slice(1)) await migrationClient.query(statement);
			await migrationClient.query('COMMIT');

			const writerResult = await writerResultPromise;
			expect(writerResult.ok).toBe(false);
			if (writerResult.ok) throw new Error('Legacy pending proposal writer unexpectedly bypassed the constraint');
			expect((writerResult.error as { code?: string }).code).toBe('23514');

			const proposals = await migrationClient.query<{ id: number; status: string }>(
				'SELECT id, status FROM orders_proposals ORDER BY id',
			);
			expect(proposals.rows.slice(0, 2)).toEqual([
				{ id: 1, status: 'expired' },
				{ id: 2, status: 'expired' },
			]);
			const history = await migrationClient.query<{ order_proposal_id: number }>(
				'SELECT order_proposal_id FROM chat_messages WHERE id = 1',
			);
			expect(history.rows[0]?.order_proposal_id).toBe(2);

			const providerRows = await migrationClient.query<{ id: number; entity_id: number; transaction_id: string }>(
				'SELECT id, entity_id, transaction_id FROM entity_trustap_transactions ORDER BY id',
			);
			expect(providerRows.rows).toEqual([
				{ id: 1, entity_id: 2, transaction_id: '500' },
				{ id: 3, entity_id: 1, transaction_id: '700' },
			]);
			const reconciledOrders = await migrationClient.query<{
				id: number;
				status: string;
				payment_creation_state: string;
				payment_transaction_id: string | null;
				legacy_payment_transaction_id: string | null;
			}>(
				'SELECT id, status, payment_creation_state, payment_transaction_id, legacy_payment_transaction_id FROM orders ORDER BY id',
			);
			for (const conflict of reconciledOrders.rows.slice(0, 4)) {
				expect(conflict).toMatchObject({
					status: 'cancelled',
					payment_creation_state: 'reconciliation_required',
					payment_transaction_id: null,
				});
			}
			expect(reconciledOrders.rows[4]).toMatchObject({
				id: 5,
				status: 'payment_pending',
				payment_creation_state: 'created',
				payment_transaction_id: '700',
			});
			expect(
				reconciledOrders.rows.filter(({ legacy_payment_transaction_id }) => legacy_payment_transaction_id === '500'),
			).toHaveLength(3);
			expect(reconciledOrders.rows[5]).toMatchObject({
				id: 6,
				status: 'cancelled',
				payment_creation_state: 'reconciliation_required',
				payment_transaction_id: null,
				legacy_payment_transaction_id: '700',
			});
			expect(reconciledOrders.rows[6]).toMatchObject({
				id: 7,
				status: 'payment_confirmed',
				payment_creation_state: 'created',
			});
			expect(reconciledOrders.rows[7]).toMatchObject({
				id: 8,
				status: 'payment_pending',
				payment_creation_state: 'reconciliation_required',
			});
			const frozenPrices = await migrationClient.query<{ id: number; item_price: number }>(
				'SELECT id, item_price FROM orders ORDER BY id',
			);
			expect(frozenPrices.rows).toEqual([
				{ id: 1, item_price: 10000 },
				{ id: 2, item_price: 10000 },
				{ id: 3, item_price: 20000 },
				{ id: 4, item_price: 20000 },
				{ id: 5, item_price: 10000 },
				{ id: 6, item_price: 10000 },
				{ id: 7, item_price: 30000 },
				{ id: 8, item_price: 40000 },
			]);
			await expect(
				migrationClient.query(
					"INSERT INTO orders (payment_provider_charge, platform_charge, shipping_label_id, shipping_price, status, item_price) VALUES (1, 1, 'x', 1, 'paid', 1)",
				),
			).rejects.toMatchObject({ code: '23514' });
			await expect(
				migrationClient.query(
					"INSERT INTO orders_proposals (original_price, proposal_price, payment_provider_charge, platform_charge, shipping_label_id, status) VALUES (1, 1, 1, 1, 'x', 'pending')",
				),
			).rejects.toMatchObject({ code: '23514' });
			expect(
				reconciledOrders.rows.some(
					({ status, payment_transaction_id }) => status === 'payment_pending' && payment_transaction_id === '500',
				),
			).toBe(false);

			const audit = await migrationClient.query<{ conflict_type: string; snapshot: Record<string, unknown> }>(
				'SELECT conflict_type, snapshot FROM commerce_reconciliation_audit ORDER BY id',
			);
			expect(new Set(audit.rows.map(({ conflict_type }) => conflict_type))).toEqual(
				new Set([
					'duplicate_provider_transaction',
					'ambiguous_provider_transaction',
					'financial_graph_mismatch',
					'legacy_pending_proposal',
					'duplicate_pending_proposal',
					'duplicate_active_order',
					'duplicate_order_transaction',
					'legacy_order_item_price_backfill',
					'legacy_order_provider_status',
				]),
			);
			expect(audit.rows.every(({ snapshot }) => typeof snapshot.id === 'number')).toBe(true);

			const indexes = await migrationClient.query<{ indexname: string }>(`
				SELECT indexname FROM pg_indexes
				WHERE indexname IN (
					'entity_trustap_transactions_transaction_id_idx',
					'orders_proposals_pending_item_buyer_idx',
					'orders_payment_transaction_id_idx',
					'orders_active_item_idx'
				)
			`);
			expect(indexes.rows).toHaveLength(4);
		} finally {
			await writer?.end();
			await migrationClient?.end();
			await admin.query(
				`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
				[database],
			);
			await admin.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(database)}`);
			await admin.end();
		}
	});
});
