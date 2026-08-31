import { getTableColumns } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { shipping_label_purchases } from '../../src/database/schemas/schema';
import { createCommerceActors, createItemFixture, createOrderFixture } from '../fixtures/commerce';
import { getTestDatabase } from '../helpers/database';

describe('shipping label purchase migration parity', () => {
	it('fresh migration exposes every source column and durable uniqueness constraint', async () => {
		const { client } = getTestDatabase();
		const columns = await client.query<{ column_name: string }>(`
			SELECT column_name
			FROM information_schema.columns
			WHERE table_schema = 'public' AND table_name = 'shipping_label_purchases'
			ORDER BY column_name
		`);
		const sourceColumns = Object.values(getTableColumns(shipping_label_purchases))
			.map(({ name }) => name)
			.sort();
		expect(columns.rows.map(({ column_name }) => column_name)).toEqual(sourceColumns);

		const constraints = await client.query<{ conname: string }>(`
			SELECT conname
			FROM pg_constraint
			WHERE conrelid = 'public.shipping_label_purchases'::regclass
			ORDER BY conname
		`);
		expect(constraints.rows.map(({ conname }) => conname)).toEqual([
			'shipping_label_purchases_item_id_items_id_fkey',
			'shipping_label_purchases_order_id_orders_id_fkey',
			'shipping_label_purchases_pkey',
			'shipping_label_purchases_provider_evidence_check',
			'shipping_label_purchases_purchased_graph_check',
			'shipping_label_purchases_state_check',
		]);

		const indexes = await client.query<{ indexname: string }>(`
			SELECT indexname
			FROM pg_indexes
			WHERE schemaname = 'public' AND tablename = 'shipping_label_purchases'
			ORDER BY indexname
		`);
		expect(indexes.rows.map(({ indexname }) => indexname)).toEqual([
			'shipping_label_purchases_attempt_id_idx',
			'shipping_label_purchases_order_id_idx',
			'shipping_label_purchases_pkey',
			'shipping_label_purchases_provider_transaction_id_idx',
			'shipping_label_purchases_state_idx',
		]);
	});

	it('database constraints reject duplicate claims and partial provider evidence', async () => {
		const actors = await createCommerceActors();
		const item = await createItemFixture(actors);
		const order = await createOrderFixture(actors, item);
		const { client } = getTestDatabase();
		await client.query(
			`INSERT INTO shipping_label_purchases
				(order_id, item_id, purchase_attempt_id, shippo_rate_id)
			 VALUES ($1, $2, '00000000-0000-4000-8000-000000000001', 'rate-one')`,
			[order.id, item.id],
		);
		await expect(
			client.query(
				`INSERT INTO shipping_label_purchases
					(order_id, item_id, purchase_attempt_id, shippo_rate_id)
				 VALUES ($1, $2, '00000000-0000-4000-8000-000000000002', 'rate-two')`,
				[order.id, item.id],
			),
		).rejects.toMatchObject({ code: '23505' });
		await expect(
			client.query("UPDATE shipping_label_purchases SET state = 'purchased' WHERE order_id = $1", [order.id]),
		).rejects.toMatchObject({ code: '23514' });
		await expect(
			client.query(
				`UPDATE shipping_label_purchases
				 SET state = 'reconciliation_required', provider_transaction_id = 'partial-provider-evidence'
				 WHERE order_id = $1`,
				[order.id],
			),
		).rejects.toMatchObject({ code: '23514' });
		await expect(
			client.query(
				`UPDATE shipping_label_purchases
				 SET state = 'reconciliation_required',
				     provider_transaction_id = 'known-provider-transaction',
				     provider_status = 'SUCCESS',
				     label_url = 'https://labels.test/known.pdf'
				 WHERE order_id = $1`,
				[order.id],
			),
		).resolves.toMatchObject({ rowCount: 1 });
	});
});
