import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { and, asc, eq } from 'drizzle-orm';
import pg, { type PoolClient } from 'pg';
import { describe, expect, it, vi } from 'vitest';

import { app } from '../../src/app';
import { chat_messages, chat_rooms, items } from '../../src/database/schemas/schema';
import { itemStatus } from '../../src/database/schemas/enumerated_values';
import { createRouter } from '../../src/lib/create-app';
import type { User } from '../../src/lib/types';
import { chatRoute, createChatRoute } from '../../src/routes/chat';
import { createCommerceActors, createItemFixture } from '../fixtures/commerce';
import { authenticatedRequest } from '../helpers/auth';
import { getTestDatabase } from '../helpers/database';
import { waitForEmail, type MailpitSearch } from '../helpers/mailpit';
import { jsonRequest, type CookieJar } from '../helpers/request';

const CHAT_ROOM_UNIQUE_INDEX = 'chat_rooms_item_buyer_idx';
const migrationsDirectory = fileURLToPath(new URL('../../src/database/drizzle/migrations/', import.meta.url));

type RoomListEntry = {
	id: number;
	item: { id: number; title: string; price: number; status: string; published: boolean };
	author: { id: number; username: string };
	buyer: { id: number; username: string };
	last_message: {
		id: number | null;
		message: string | null;
		read_at: string | null;
		created_at: string | null;
		sender_id: number | null;
	};
};

type MessageResponse = {
	id: number;
	message: string;
	message_type: string;
	order_proposal_id: number | null;
	created_at: string;
	read_at: string | null;
	sender: { id: number; username: string };
	sender_id: number;
	metadata: unknown;
};

async function createRoom(jar: CookieJar, itemId: number): Promise<Response> {
	return authenticatedRequest('/chat/auth/rooms', 'POST', jar, { item_id: itemId });
}

async function sendMessage(jar: CookieJar, roomId: number | string, message: string): Promise<Response> {
	return authenticatedRequest(`/chat/auth/rooms/${roomId}/messages`, 'POST', jar, { message });
}

function directlyAuthenticatedRequest(
	path: string,
	method: string,
	user: User,
	body?: unknown,
	route: typeof chatRoute = chatRoute,
): Promise<Response> {
	const directApp = createRouter();
	directApp.use('*', async (c, next) => {
		c.set('user', user);
		await next();
	});
	directApp.route('/chat', route);
	return Promise.resolve(directApp.request(path, jsonRequest(method, body)));
}

function actorApiUser(actor: {
	user: Pick<User, 'id' | 'email' | 'username' | 'email_verified' | 'phone_verified'>;
	profile: { id: number };
}): User {
	return { ...actor.user, profile_id: actor.profile.id };
}

async function createRoomId(jar: CookieJar, itemId: number): Promise<number> {
	const response = await createRoom(jar, itemId);
	expect(response.status).toBe(200);
	const body = (await response.json()) as { id: number };
	return body.id;
}

async function roomRows(itemId: number, buyerProfileId: number) {
	const { db } = getTestDatabase();
	return db
		.select()
		.from(chat_rooms)
		.where(and(eq(chat_rooms.item_id, itemId), eq(chat_rooms.buyer_id, buyerProfileId)))
		.orderBy(asc(chat_rooms.id));
}

async function messageRows(roomId: number) {
	const { db } = getTestDatabase();
	return db.select().from(chat_messages).where(eq(chat_messages.chat_room_id, roomId)).orderBy(asc(chat_messages.id));
}

async function openDedicatedTestConnection(): Promise<pg.Client> {
	const { client } = getTestDatabase();
	const connection = new pg.Client(client.options);
	await connection.connect();
	return connection;
}

async function bounded<T>(promise: Promise<T>, label: string): Promise<T> {
	const timeout = AbortSignal.timeout(5_000);
	return Promise.race([
		promise,
		new Promise<never>((_resolve, reject) => {
			timeout.addEventListener('abort', () => reject(new Error(`Timed out waiting for ${label}`)), { once: true });
		}),
	]);
}

function mailpitApiUrl(path: string): URL {
	/* eslint-disable turbo/no-undeclared-env-vars -- Vitest supplies the isolated loopback Mailpit URL. */
	const value = process.env.MAILPIT_API_URL;
	if (!value) throw new Error('Missing local Mailpit API URL');

	const base = new URL(value);
	if (base.protocol !== 'http:' || !['localhost', '127.0.0.1', '::1'].includes(base.hostname)) {
		throw new Error('Unsafe Mailpit API URL');
	}
	return new URL(path, base);
}

async function emailsFor(recipient: string): Promise<MailpitSearch['messages']> {
	const url = mailpitApiUrl('/api/v1/search');
	url.searchParams.set('query', `to:${recipient}`);
	const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
	if (!response.ok) throw new Error(`Mailpit search failed with ${response.status}`);
	return ((await response.json()) as MailpitSearch).messages.filter(({ To }) =>
		To.some(({ Address }) => Address === recipient),
	);
}

function chatRoomUniqueMigration(): string[] {
	const migration = readdirSync(migrationsDirectory, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => readFileSync(`${migrationsDirectory}/${entry.name}/migration.sql`, 'utf8'))
		.find((sql) => sql.includes(`CREATE UNIQUE INDEX "${CHAT_ROOM_UNIQUE_INDEX}"`));

	if (!migration) throw new Error(`Missing migration that creates ${CHAT_ROOM_UNIQUE_INDEX} as UNIQUE`);
	return migration
		.split('--> statement-breakpoint')
		.map((statement) => statement.trim())
		.filter(Boolean);
}

async function waitForBlockedRoomInsert(connection: PoolClient, blockerPid: number, writerPid: number): Promise<void> {
	for (let attempt = 0; attempt < 200; attempt += 1) {
		const { rows } = await connection.query<{ waiting: number }>(
			`
			SELECT count(*)::int AS waiting
			FROM pg_locks AS waiting_lock
			WHERE waiting_lock.locktype = 'relation'
				AND waiting_lock.relation = 'chat_rooms'::regclass
				AND waiting_lock.mode = 'RowExclusiveLock'
				AND waiting_lock.granted = false
				AND waiting_lock.pid = $1
				AND $2::integer = ANY(pg_blocking_pids(waiting_lock.pid))
		`,
			[writerPid, blockerPid],
		);
		if ((rows[0]?.waiting ?? 0) === 1) return;
		await connection.query('SELECT pg_sleep(0.01)');
	}
	throw new Error('Timed out waiting for the migration table lock to block a chat-room insert');
}

async function waitForBlockedStatements(
	connection: Pick<pg.Client, 'query'>,
	blockerPid: number,
	count: number,
	queryPattern = '%',
): Promise<Array<{ pid: number; query: string }>> {
	const deadline = Date.now() + 5_000;
	while (Date.now() < deadline) {
		const { rows } = await connection.query<{ pid: number; query: string }>(
			`
			SELECT activity.pid, activity.query
			FROM pg_stat_activity AS activity
			WHERE activity.datname = current_database()
				AND activity.pid <> pg_backend_pid()
				AND activity.state IN ('active', 'idle in transaction')
				AND activity.wait_event_type = 'Lock'
				AND (
					$1::integer = ANY(pg_blocking_pids(activity.pid))
					OR EXISTS (
						SELECT 1
						FROM unnest(pg_blocking_pids(activity.pid)) AS immediate_blocker(pid)
						WHERE $1::integer = ANY(pg_blocking_pids(immediate_blocker.pid))
					)
				)
				AND activity.query ILIKE $2
			ORDER BY activity.pid
		`,
			[blockerPid, queryPattern],
		);
		if (rows.length >= count) return rows;
		await new Promise<void>((resolve) => setImmediate(resolve));
	}
	const { rows: diagnostics } = await connection.query<{
		pid: number;
		state: string;
		wait_event_type: string | null;
		wait_event: string | null;
		query: string;
		blockers: number[];
	}>(`
		SELECT pid, state, wait_event_type, wait_event, query, pg_blocking_pids(pid) AS blockers
		FROM pg_stat_activity
		WHERE datname = current_database()
		ORDER BY pid
	`);
	throw new Error(
		`Timed out waiting for ${count} database statements blocked by backend ${blockerPid}: ${JSON.stringify(diagnostics)}`,
	);
}

describe('chat routes', () => {
	it.each([
		['GET', '/chat/auth/rooms', undefined],
		['GET', '/chat/auth/rooms/id/1', undefined],
		['GET', '/chat/auth/rooms/1/messages', undefined],
		['POST', '/chat/auth/rooms', { item_id: 1 }],
		['POST', '/chat/auth/rooms/1/messages', { message: 'Hello' }],
	] as const)('requires authentication for %s %s', async (method, path, body) => {
		const response = await app.request(path, {
			method,
			headers: body === undefined ? undefined : { 'content-type': 'application/json' },
			body: body === undefined ? undefined : JSON.stringify(body),
		});

		expect(response.status).toBe(401);
	});

	it('runs the two-party text flow, exposes the latest message, records reads, and notifies the seller once', async () => {
		const actors = await createCommerceActors();
		const item = await createItemFixture(actors);
		const buyerText = "Ciao, l'articolo è ancora disponibile?";
		const sellerText = 'Sì, è disponibile e posso spedirlo domani.';

		const firstRoomResponse = await createRoom(actors.buyer.jar, item.id);
		expect(firstRoomResponse.status).toBe(200);
		const firstRoom = (await firstRoomResponse.json()) as { id: number };
		expect(firstRoom.id).toEqual(expect.any(Number));

		const duplicateRoomResponse = await createRoom(actors.buyer.jar, item.id);
		expect(duplicateRoomResponse.status).toBe(200);
		expect(await duplicateRoomResponse.json()).toEqual({ id: firstRoom.id });
		expect(await roomRows(item.id, actors.buyer.profile.id)).toHaveLength(1);

		const buyerMessageResponse = await sendMessage(actors.buyer.jar, firstRoom.id, buyerText);
		expect(buyerMessageResponse.status).toBe(200);
		expect(await buyerMessageResponse.json()).toMatchObject({
			chat_room_id: firstRoom.id,
			sender_id: actors.buyer.profile.id,
			message: buyerText,
			message_type: 'text',
		});

		const sellerEmail = await waitForEmail(actors.seller.user.email, 'Tantovale - New message received');
		expect(sellerEmail.HTML).toContain(actors.buyer.user.username);
		expect(sellerEmail.HTML).toContain(buyerText);
		expect(await emailsFor(actors.seller.user.email)).toHaveLength(1);
		expect(await emailsFor(actors.buyer.user.email)).toHaveLength(0);

		const sellerMessageResponse = await sendMessage(actors.seller.jar, firstRoom.id, sellerText);
		expect(sellerMessageResponse.status).toBe(200);
		expect(await sellerMessageResponse.json()).toMatchObject({
			chat_room_id: firstRoom.id,
			sender_id: actors.seller.profile.id,
			message: sellerText,
			message_type: 'text',
		});

		for (const actor of [actors.buyer, actors.seller]) {
			const listResponse = await authenticatedRequest('/chat/auth/rooms', 'GET', actor.jar);
			expect(listResponse.status).toBe(200);
			const rooms = (await listResponse.json()) as RoomListEntry[];
			expect(rooms).toHaveLength(1);
			expect(rooms[0]).toMatchObject({
				id: firstRoom.id,
				item: {
					id: item.id,
					title: item.title,
					price: item.price,
					status: item.status,
					published: item.published,
				},
				author: { id: actors.seller.user.id, username: actors.seller.user.username },
				buyer: { id: actors.buyer.user.id, username: actors.buyer.user.username },
				last_message: {
					message: sellerText,
					sender_id: actors.seller.user.id,
				},
			});
		}

		const messagesResponse = await authenticatedRequest(
			`/chat/auth/rooms/${firstRoom.id}/messages`,
			'GET',
			actors.buyer.jar,
		);
		expect(messagesResponse.status).toBe(200);
		const messages = (await messagesResponse.json()) as MessageResponse[];
		expect(messages.map(({ message }) => message)).toEqual([buyerText, sellerText]);
		expect(messages.map(({ sender }) => sender)).toEqual([
			{ id: actors.buyer.user.id, username: actors.buyer.user.username },
			{ id: actors.seller.user.id, username: actors.seller.user.username },
		]);

		const persistedMessages = await messageRows(firstRoom.id);
		expect(persistedMessages).toHaveLength(2);
		expect(persistedMessages[0]?.sender_id).toBe(actors.buyer.profile.id);
		expect(persistedMessages[0]?.read_at).toBeNull();
		expect(persistedMessages[1]?.sender_id).toBe(actors.seller.profile.id);
		expect(persistedMessages[1]?.read_at).toBeInstanceOf(Date);

		const resolveResponse = await authenticatedRequest(`/chat/auth/rooms/id/${item.id}`, 'GET', actors.buyer.jar);
		expect(resolveResponse.status).toBe(200);
		expect(await resolveResponse.json()).toEqual({ id: firstRoom.id });
	});

	it('keeps existing conversations visible with their last message and orders them by recent activity', async () => {
		const actors = await createCommerceActors();
		const [unpublishedItem, unavailableItem, deletedItem] = await Promise.all([
			createItemFixture(actors, { commons: { title: 'Later unpublished item' } }),
			createItemFixture(actors, { commons: { title: 'Later unavailable item' } }),
			createItemFixture(actors, { commons: { title: 'Later deleted item' } }),
		]);
		const unpublishedRoomId = await createRoomId(actors.buyer.jar, unpublishedItem.id);
		const unavailableRoomId = await createRoomId(actors.buyer.jar, unavailableItem.id);
		const deletedRoomId = await createRoomId(actors.buyer.jar, deletedItem.id);
		const { db } = getTestDatabase();
		await db.insert(chat_messages).values([
			{
				chat_room_id: unpublishedRoomId,
				sender_id: actors.buyer.profile.id,
				message: 'Most recent activity survives unpublishing',
				created_at: new Date('2026-03-03T00:00:00.000Z'),
			},
			{
				chat_room_id: unavailableRoomId,
				sender_id: actors.buyer.profile.id,
				message: 'Older activity survives sold state',
				created_at: new Date('2026-03-01T00:00:00.000Z'),
			},
			{
				chat_room_id: deletedRoomId,
				sender_id: actors.buyer.profile.id,
				message: 'Equal-time activity survives soft delete',
				created_at: new Date('2026-03-02T00:00:00.000Z'),
			},
		]);
		await Promise.all([
			db
				.update(chat_rooms)
				.set({ updated_at: new Date('2030-01-01T00:00:00.000Z') })
				.where(eq(chat_rooms.id, unpublishedRoomId)),
			db
				.update(chat_rooms)
				.set({ updated_at: new Date('2020-01-01T00:00:00.000Z') })
				.where(eq(chat_rooms.id, unavailableRoomId)),
			db
				.update(chat_rooms)
				.set({ updated_at: new Date('2020-01-01T00:00:00.000Z') })
				.where(eq(chat_rooms.id, deletedRoomId)),
			db.update(items).set({ published: false }).where(eq(items.id, unpublishedItem.id)),
			db.update(items).set({ status: itemStatus.SOLD }).where(eq(items.id, unavailableItem.id)),
			db.update(items).set({ deleted_at: new Date() }).where(eq(items.id, deletedItem.id)),
		]);

		for (const actor of [actors.buyer, actors.seller]) {
			const response = await authenticatedRequest('/chat/auth/rooms', 'GET', actor.jar);
			expect(response.status).toBe(200);
			const rooms = (await response.json()) as RoomListEntry[];
			expect(rooms.map(({ id }) => id)).toEqual([unpublishedRoomId, deletedRoomId, unavailableRoomId]);
			expect(rooms.map(({ last_message }) => last_message.message)).toEqual([
				'Most recent activity survives unpublishing',
				'Equal-time activity survives soft delete',
				'Older activity survives sold state',
			]);
			expect(rooms.map(({ last_message }) => last_message.sender_id)).toEqual([
				actors.buyer.user.id,
				actors.buyer.user.id,
				actors.buyer.user.id,
			]);
		}
	});

	describe('POST /chat/auth/rooms', () => {
		it('rejects the item owner', async () => {
			const actors = await createCommerceActors();
			const item = await createItemFixture(actors);

			const response = await createRoom(actors.seller.jar, item.id);

			expect(response.status).toBe(400);
			expect(await response.json()).toEqual({ error: 'You cannot chat about your own item' });
			expect(await roomRows(item.id, actors.seller.profile.id)).toEqual([]);
		});

		it('returns 404 for an absent item', async () => {
			const actors = await createCommerceActors();

			const response = await createRoom(actors.buyer.jar, 2_147_483_647);

			expect(response.status).toBe(404);
		});

		it.each([
			['unpublished', { published: false }],
			['unavailable', { status: itemStatus.SOLD }],
			['deleted', { deleted_at: new Date() }],
		] as const)('returns 404 and writes nothing for an item that is %s', async (_label, update) => {
			const actors = await createCommerceActors();
			const item = await createItemFixture(actors);
			const { db } = getTestDatabase();
			await db.update(items).set(update).where(eq(items.id, item.id));

			const response = await createRoom(actors.buyer.jar, item.id);

			expect(response.status).toBe(404);
			expect(await roomRows(item.id, actors.buyer.profile.id)).toEqual([]);
		});

		it.each([{}, { item_id: '1' }, { item_id: 0 }, { item_id: -1 }, { item_id: 1.5 }, { item_id: 2_147_483_648 }])(
			'rejects malformed input %#',
			async (body) => {
				const actors = await createCommerceActors();
				const response = await authenticatedRequest('/chat/auth/rooms', 'POST', actors.buyer.jar, body);

				expect(response.status).toBe(400);
			},
		);

		it('enforces item and buyer uniqueness for writers that bypass the route', async () => {
			const actors = await createCommerceActors();
			const item = await createItemFixture(actors);
			const { client, db } = getTestDatabase();

			await db.insert(chat_rooms).values({ item_id: item.id, buyer_id: actors.buyer.profile.id });
			await expect(
				db.insert(chat_rooms).values({ item_id: item.id, buyer_id: actors.buyer.profile.id }),
			).rejects.toThrow();
			expect(await roomRows(item.id, actors.buyer.profile.id)).toHaveLength(1);

			const { rows } = await client.query<{ indisunique: boolean }>(
				`SELECT index_relation.indisunique
				 FROM pg_index AS index_relation
				 INNER JOIN pg_class AS index_class ON index_class.oid = index_relation.indexrelid
				 WHERE index_class.relname = $1`,
				[CHAT_ROOM_UNIQUE_INDEX],
			);
			expect(rows).toEqual([{ indisunique: true }]);
		});

		it('returns one stable room under concurrent duplicate creation', async () => {
			const actors = await createCommerceActors();
			const item = await createItemFixture(actors);

			const responses = await Promise.all(Array.from({ length: 12 }, () => createRoom(actors.buyer.jar, item.id)));
			expect(responses.every(({ status }) => status === 200)).toBe(true);
			const ids = await Promise.all(
				responses.map((response) => response.json().then((body) => (body as { id: number }).id)),
			);

			expect(new Set(ids)).toEqual(new Set([ids[0]]));
			expect(await roomRows(item.id, actors.buyer.profile.id)).toHaveLength(1);
		});

		it.each([
			['unpublished', 'UPDATE items SET published = false WHERE id = $1'],
			['unavailable', "UPDATE items SET status = 'sold' WHERE id = $1"],
			['deleted', 'UPDATE items SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1'],
		] as const)(
			'revalidates an item that becomes %s while creation waits on its exact row lock',
			async (_state, sql) => {
				const actors = await createCommerceActors();
				const item = await createItemFixture(actors);
				const blocker = await openDedicatedTestConnection();
				let createPromise: Promise<Response> | undefined;
				let blockedQuery = '';

				try {
					await blocker.query('BEGIN');
					await blocker.query('SELECT id FROM items WHERE id = $1 FOR NO KEY UPDATE', [item.id]);
					const blockerBackend = await blocker.query<{ pid: number }>('SELECT pg_backend_pid() AS pid');
					const blockerPid = blockerBackend.rows[0]?.pid;
					if (!blockerPid) throw new Error('Missing item blocker PID');

					createPromise = directlyAuthenticatedRequest('/chat/auth/rooms', 'POST', actorApiUser(actors.buyer), {
						item_id: item.id,
					});
					const [blockedStatement] = await waitForBlockedStatements(
						blocker,
						blockerPid,
						1,
						'%from "items"%for update%',
					);
					blockedQuery = blockedStatement?.query ?? '';
					await blocker.query(sql, [item.id]);
					await blocker.query('COMMIT');

					const response = await createPromise;
					expect(blockedQuery).toContain('from "items"');
					expect(blockedQuery).toContain('for update');
					expect(response.status).toBe(404);
					expect(await roomRows(item.id, actors.buyer.profile.id)).toEqual([]);
				} finally {
					await blocker.query('ROLLBACK');
					await blocker.end();
					await createPromise?.catch(() => undefined);
				}
			},
		);

		it('locks writers while reconciling legacy duplicates and replacing the non-unique index', async () => {
			const migrationStatements = chatRoomUniqueMigration();
			expect(migrationStatements[0]?.replaceAll(/\s+/g, ' ')).toBe('LOCK TABLE "chat_rooms" IN ACCESS EXCLUSIVE MODE;');
			const actors = await createCommerceActors();
			const item = await createItemFixture(actors);
			const { client } = getTestDatabase();
			const migrationConnection = await client.connect();
			const writerConnection = await client.connect();

			try {
				await migrationConnection.query(`DROP INDEX "${CHAT_ROOM_UNIQUE_INDEX}"`);
				await migrationConnection.query(`CREATE INDEX "${CHAT_ROOM_UNIQUE_INDEX}" ON chat_rooms (item_id, buyer_id)`);
				const inserted = await migrationConnection.query<{ id: number }>(
					`INSERT INTO chat_rooms (item_id, buyer_id) VALUES ($1, $2), ($1, $2), ($1, $2) RETURNING id`,
					[item.id, actors.buyer.profile.id],
				);
				const canonicalId = Math.min(...inserted.rows.map(({ id }) => id));

				await migrationConnection.query('BEGIN');
				const migrationBackend = await migrationConnection.query<{ pid: number }>('SELECT pg_backend_pid() AS pid');
				const migrationPid = migrationBackend.rows[0]?.pid;
				if (!migrationPid) throw new Error('Missing migration backend PID');
				const firstStatement = migrationStatements[0];
				if (!firstStatement) throw new Error('Chat-room migration has no statements');
				await migrationConnection.query(firstStatement);

				const writerBackend = await writerConnection.query<{ pid: number }>('SELECT pg_backend_pid() AS pid');
				const writerPid = writerBackend.rows[0]?.pid;
				if (!writerPid) throw new Error('Missing concurrent chat-room writer PID');
				const writerOutcomePromise = writerConnection
					.query(`INSERT INTO chat_rooms (item_id, buyer_id) VALUES ($1, $2)`, [item.id, actors.buyer.profile.id])
					.then(
						() => ({ outcome: 'inserted' as const }),
						(error: unknown) => ({ outcome: 'rejected' as const, error }),
					);
				await waitForBlockedRoomInsert(migrationConnection, migrationPid, writerPid);

				for (const statement of migrationStatements.slice(1)) {
					await migrationConnection.query(statement);
				}

				const reconciled = await migrationConnection.query<{ id: number }>(
					`SELECT id FROM chat_rooms WHERE item_id = $1 AND buyer_id = $2`,
					[item.id, actors.buyer.profile.id],
				);
				expect(reconciled.rows).toEqual([{ id: canonicalId }]);

				await migrationConnection.query('COMMIT');
				const writerOutcome = await writerOutcomePromise;
				expect(writerOutcome.outcome).toBe('rejected');
				if (writerOutcome.outcome !== 'rejected') throw new Error('Concurrent chat-room writer unexpectedly succeeded');
				expect((writerOutcome.error as { code?: string }).code).toBe('23505');
				expect(await roomRows(item.id, actors.buyer.profile.id)).toEqual([
					expect.objectContaining({ id: canonicalId }),
				]);
			} finally {
				await migrationConnection.query('ROLLBACK');
				await writerConnection.query('ROLLBACK');
				await migrationConnection.query(`
					DELETE FROM chat_rooms AS duplicate
					USING chat_rooms AS canonical
					WHERE duplicate.item_id = canonical.item_id
						AND duplicate.buyer_id = canonical.buyer_id
						AND duplicate.id > canonical.id
				`);
				await migrationConnection.query(`DROP INDEX IF EXISTS "${CHAT_ROOM_UNIQUE_INDEX}"`);
				await migrationConnection.query(
					`CREATE UNIQUE INDEX "${CHAT_ROOM_UNIQUE_INDEX}" ON chat_rooms (item_id, buyer_id)`,
				);
				writerConnection.release();
				migrationConnection.release();
			}
		});

		it('reparents every legacy duplicate-room message before deleting duplicate rooms', async () => {
			const migrationStatements = chatRoomUniqueMigration();
			const actors = await createCommerceActors();
			const item = await createItemFixture(actors);
			const { client } = getTestDatabase();
			const connection = await client.connect();
			const createdDates = [
				new Date('2026-01-03T00:00:00.000Z'),
				new Date('2026-01-01T00:00:00.000Z'),
				new Date('2026-01-02T00:00:00.000Z'),
			];
			const updatedDates = [
				new Date('2026-01-04T00:00:00.000Z'),
				new Date('2026-01-06T00:00:00.000Z'),
				new Date('2026-01-05T00:00:00.000Z'),
			];

			try {
				await connection.query(`DROP INDEX "${CHAT_ROOM_UNIQUE_INDEX}"`);
				await connection.query(`CREATE INDEX "${CHAT_ROOM_UNIQUE_INDEX}" ON chat_rooms (item_id, buyer_id)`);
				const insertedRooms = await connection.query<{ id: number }>(
					`INSERT INTO chat_rooms (item_id, buyer_id, created_at, updated_at)
					 VALUES ($1, $2, $3, $4), ($1, $2, $5, $6), ($1, $2, $7, $8)
					 RETURNING id`,
					[
						item.id,
						actors.buyer.profile.id,
						createdDates[0],
						updatedDates[0],
						createdDates[1],
						updatedDates[1],
						createdDates[2],
						updatedDates[2],
					],
				);
				const [canonicalRoom, firstDuplicate, secondDuplicate] = insertedRooms.rows;
				if (!canonicalRoom || !firstDuplicate || !secondDuplicate) {
					throw new Error('Legacy duplicate-room fixture insert failed');
				}

				const insertedMessages = await connection.query<{
					id: number;
					chat_room_id: number;
					sender_id: number;
					message: string;
					read_at: Date | null;
					created_at: Date;
				}>(
					`INSERT INTO chat_messages (chat_room_id, sender_id, message, read_at, created_at)
					 VALUES
						($1, $2, 'canonical-middle', NULL, '2026-01-03T12:00:00.000Z'),
						($3, $4, 'duplicate-first', '2026-01-04T00:00:00.000Z', '2026-01-02T12:00:00.000Z'),
						($5, $2, 'duplicate-last', NULL, '2026-01-04T12:00:00.000Z')
					 RETURNING id, chat_room_id, sender_id, message, read_at, created_at`,
					[canonicalRoom.id, actors.buyer.profile.id, firstDuplicate.id, actors.seller.profile.id, secondDuplicate.id],
				);
				const expectedMessages = [...insertedMessages.rows]
					.sort((left, right) => left.created_at.getTime() - right.created_at.getTime() || left.id - right.id)
					.map((row) => ({ ...row, chat_room_id: canonicalRoom.id }));

				await connection.query('BEGIN');
				for (const statement of migrationStatements) await connection.query(statement);

				const reconciledRooms = await connection.query<{
					id: number;
					created_at: Date;
					updated_at: Date;
				}>(`SELECT id, created_at, updated_at FROM chat_rooms WHERE item_id = $1 AND buyer_id = $2`, [
					item.id,
					actors.buyer.profile.id,
				]);
				const reconciledMessages = await connection.query<(typeof expectedMessages)[number]>(
					`SELECT id, chat_room_id, sender_id, message, read_at, created_at
					 FROM chat_messages
					 WHERE chat_room_id = $1
					 ORDER BY created_at, id`,
					[canonicalRoom.id],
				);

				expect(reconciledRooms.rows).toEqual([
					{
						id: canonicalRoom.id,
						created_at: createdDates[1],
						updated_at: updatedDates[1],
					},
				]);
				expect(reconciledMessages.rows).toEqual(expectedMessages);
				await connection.query('COMMIT');
			} finally {
				await connection.query('ROLLBACK');
				await connection.query(`
					DELETE FROM chat_rooms AS duplicate
					USING chat_rooms AS canonical
					WHERE duplicate.item_id = canonical.item_id
						AND duplicate.buyer_id = canonical.buyer_id
						AND duplicate.id > canonical.id
				`);
				await connection.query(`DROP INDEX IF EXISTS "${CHAT_ROOM_UNIQUE_INDEX}"`);
				await connection.query(`CREATE UNIQUE INDEX "${CHAT_ROOM_UNIQUE_INDEX}" ON chat_rooms (item_id, buyer_id)`);
				connection.release();
			}
		});
	});

	describe('room isolation and identifier validation', () => {
		it('returns no rooms or room ID to an outsider', async () => {
			const actors = await createCommerceActors();
			const item = await createItemFixture(actors);
			const roomResponse = await createRoom(actors.buyer.jar, item.id);
			const { id } = (await roomResponse.json()) as { id: number };
			await sendMessage(actors.buyer.jar, id, 'Private conversation');

			const listResponse = await authenticatedRequest('/chat/auth/rooms', 'GET', actors.outsider.jar);
			expect(listResponse.status).toBe(200);
			expect(await listResponse.json()).toEqual([]);

			const resolveResponse = await authenticatedRequest(`/chat/auth/rooms/id/${item.id}`, 'GET', actors.outsider.jar);
			expect(resolveResponse.status).toBe(200);
			expect(await resolveResponse.json()).toEqual({});
		});

		it('rejects outsider message reads and writes without mutating the room', async () => {
			const actors = await createCommerceActors();
			const item = await createItemFixture(actors);
			const roomResponse = await createRoom(actors.buyer.jar, item.id);
			const { id } = (await roomResponse.json()) as { id: number };
			await sendMessage(actors.buyer.jar, id, 'Only participants can read this');

			const readResponse = await authenticatedRequest(`/chat/auth/rooms/${id}/messages`, 'GET', actors.outsider.jar);
			const writeResponse = await sendMessage(actors.outsider.jar, id, 'Intrusion');

			expect(readResponse.status).toBe(403);
			expect(await readResponse.json()).toEqual({ error: 'Unauthorized access to chat room' });
			expect(writeResponse.status).toBe(403);
			expect(await writeResponse.json()).toEqual({ error: 'Unauthorized access to chat room' });
			expect((await messageRows(id)).map(({ message }) => message)).toEqual(['Only participants can read this']);
		});

		it.each(['not-a-number', '0', '-1', '1.5', '2147483648'])(
			'rejects malformed room ID %s for reads',
			async (roomId) => {
				const actors = await createCommerceActors();
				const response = await authenticatedRequest(`/chat/auth/rooms/${roomId}/messages`, 'GET', actors.buyer.jar);

				expect(response.status).toBe(400);
			},
		);

		it.each(['not-a-number', '0', '-1', '1.5', '2147483648'])(
			'rejects malformed room ID %s for writes',
			async (roomId) => {
				const actors = await createCommerceActors();
				const response = await sendMessage(actors.buyer.jar, roomId, 'Hello');

				expect(response.status).toBe(400);
			},
		);

		it.each(['not-a-number', '0', '-1', '1.5', '2147483648'])(
			'rejects malformed item ID %s when resolving a room',
			async (itemId) => {
				const actors = await createCommerceActors();
				const response = await authenticatedRequest(`/chat/auth/rooms/id/${itemId}`, 'GET', actors.buyer.jar);

				expect(response.status).toBe(400);
			},
		);

		it('returns 404 for absent rooms and preserves the legacy empty room-ID lookup', async () => {
			const actors = await createCommerceActors();

			const readResponse = await authenticatedRequest('/chat/auth/rooms/2147483647/messages', 'GET', actors.buyer.jar);
			const writeResponse = await sendMessage(actors.buyer.jar, 2_147_483_647, 'Hello');
			const resolveResponse = await authenticatedRequest('/chat/auth/rooms/id/2147483647', 'GET', actors.buyer.jar);

			expect(readResponse.status).toBe(404);
			expect(writeResponse.status).toBe(404);
			expect(resolveResponse.status).toBe(200);
			expect(await resolveResponse.json()).toEqual({});
		});
	});

	describe('message response and read tracking', () => {
		it('preserves the legacy top-level sender_id as the public user ID', async () => {
			const actors = await createCommerceActors();
			const item = await createItemFixture(actors);
			const roomId = await createRoomId(actors.buyer.jar, item.id);
			const createdAt = new Date('2026-02-03T04:05:06.000Z');
			const { db } = getTestDatabase();
			const [inserted] = await db
				.insert(chat_messages)
				.values({
					chat_room_id: roomId,
					sender_id: actors.seller.profile.id,
					message: 'Legacy response contract',
					created_at: createdAt,
				})
				.returning();
			if (!inserted) throw new Error('Chat message fixture insert failed');

			const response = await authenticatedRequest(`/chat/auth/rooms/${roomId}/messages`, 'GET', actors.buyer.jar);

			expect(response.status).toBe(200);
			expect(await response.json()).toEqual([
				{
					id: inserted.id,
					message: inserted.message,
					message_type: 'text',
					order_proposal_id: null,
					created_at: createdAt.toISOString(),
					read_at: null,
					sender: { id: actors.seller.user.id, username: actors.seller.user.username },
					sender_id: actors.seller.user.id,
					metadata: null,
				},
			]);
		});

		it('marks only unread message IDs returned by the response snapshot', async () => {
			const actors = await createCommerceActors();
			const item = await createItemFixture(actors);
			const roomId = await createRoomId(actors.buyer.jar, item.id);
			const { db } = getTestDatabase();
			const [target] = await db
				.insert(chat_messages)
				.values({
					chat_room_id: roomId,
					sender_id: actors.seller.profile.id,
					message: 'Visible before the read snapshot',
				})
				.returning();
			if (!target) throw new Error('Read target fixture insert failed');
			let releaseSnapshot!: () => void;
			let announceSnapshot!: () => void;
			const snapshotSelected = new Promise<void>((resolve) => {
				announceSnapshot = resolve;
			});
			const snapshotRelease = new Promise<void>((resolve) => {
				releaseSnapshot = resolve;
			});
			const isolatedRoute = createChatRoute({
				afterMessagesSnapshot: async () => {
					announceSnapshot();
					await bounded(snapshotRelease, 'read-snapshot release');
				},
			});
			const readPromise = directlyAuthenticatedRequest(
				`/chat/auth/rooms/${roomId}/messages`,
				'GET',
				actorApiUser(actors.buyer),
				undefined,
				isolatedRoute,
			);
			await bounded(snapshotSelected, 'read snapshot');
			const [concurrentMessage] = await db
				.insert(chat_messages)
				.values({
					chat_room_id: roomId,
					sender_id: actors.seller.profile.id,
					message: 'Arrived after the response snapshot',
				})
				.returning({ id: chat_messages.id });
			if (!concurrentMessage) throw new Error('Concurrent message fixture insert failed');
			releaseSnapshot();
			const readResponse = await bounded(readPromise, 'read-race response');

			expect(readResponse.status).toBe(200);
			const responseMessages = (await readResponse.json()) as Array<{ id: number }>;
			expect(responseMessages.map(({ id }) => id)).toEqual([target.id]);
			const persisted = await messageRows(roomId);
			expect(persisted.find(({ id }) => id === target.id)?.read_at).toBeInstanceOf(Date);
			expect(persisted.find(({ id }) => id === concurrentMessage.id)?.read_at).toBeNull();
		});
	});

	describe('message validation', () => {
		it.each(['', '   ', '\n\t', 'x'.repeat(601)])('rejects invalid text %#', async (message) => {
			const actors = await createCommerceActors();
			const item = await createItemFixture(actors);
			const roomResponse = await createRoom(actors.buyer.jar, item.id);
			const { id } = (await roomResponse.json()) as { id: number };

			const response = await sendMessage(actors.buyer.jar, id, message);

			expect(response.status).toBe(400);
			expect(await messageRows(id)).toEqual([]);
			expect(await emailsFor(actors.seller.user.email)).toHaveLength(0);
		});

		it('accepts exactly 600 characters', async () => {
			const actors = await createCommerceActors();
			const item = await createItemFixture(actors);
			const roomResponse = await createRoom(actors.buyer.jar, item.id);
			const { id } = (await roomResponse.json()) as { id: number };
			const message = 'x'.repeat(600);

			const response = await sendMessage(actors.buyer.jar, id, message);

			expect(response.status).toBe(200);
			expect((await messageRows(id))[0]?.message).toBe(message);
		});

		it.each([
			'message\u0000with-nul',
			'message\u0001with-soh',
			'message\u000bwith-vtab',
			'message\u001fwith-unit-separator',
		])('rejects unsafe C0 text %# before email or database work', async (message) => {
			const actors = await createCommerceActors();
			const item = await createItemFixture(actors);
			const roomId = await createRoomId(actors.buyer.jar, item.id);

			const response = await sendMessage(actors.buyer.jar, roomId, message);

			expect(response.status).toBe(400);
			expect(await messageRows(roomId)).toEqual([]);
			expect(await emailsFor(actors.seller.user.email)).toHaveLength(0);
		});

		it('preserves safe newline and tab characters verbatim', async () => {
			const actors = await createCommerceActors();
			const item = await createItemFixture(actors);
			const roomId = await createRoomId(actors.buyer.jar, item.id);
			const message = 'First line\n\tIndented second line';

			const response = await sendMessage(actors.buyer.jar, roomId, message);

			expect(response.status).toBe(200);
			expect((await response.json()) as { message: string }).toMatchObject({ message });
			expect((await messageRows(roomId))[0]?.message).toBe(message);
		});

		it('stores text verbatim but escapes HTML before interpolating it into notification markup', async () => {
			const actors = await createCommerceActors();
			const item = await createItemFixture(actors);
			const roomResponse = await createRoom(actors.buyer.jar, item.id);
			const { id } = (await roomResponse.json()) as { id: number };
			const message = '<img src=x onerror=alert(1)>Still available?';

			const response = await sendMessage(actors.buyer.jar, id, message);

			expect(response.status).toBe(200);
			expect((await messageRows(id))[0]?.message).toBe(message);
			const email = await waitForEmail(actors.seller.user.email, 'Tantovale - New message received');
			expect(email.HTML).not.toContain('<img');
			expect(email.HTML).toContain('&lt;img src=x onerror=alert(1)&gt;Still available?');
		});
	});

	describe('message transaction and notification ordering', () => {
		it('commits the message and room activity before treating SMTP failure as best effort', async () => {
			const actors = await createCommerceActors();
			const item = await createItemFixture(actors);
			const roomId = await createRoomId(actors.buyer.jar, item.id);
			const { db } = getTestDatabase();
			const oldActivity = new Date('2000-01-01T00:00:00.000Z');
			await db.update(chat_rooms).set({ updated_at: oldActivity }).where(eq(chat_rooms.id, roomId));
			const originalHost = process.env.SMTP_HOST;
			const originalPort = process.env.SMTP_PORT;
			const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
			let response: Response;

			try {
				process.env.SMTP_HOST = '127.0.0.1';
				process.env.SMTP_PORT = '1';
				response = await sendMessage(actors.buyer.jar, roomId, 'Persist despite unavailable SMTP');
			} finally {
				if (originalHost === undefined) delete process.env.SMTP_HOST;
				else process.env.SMTP_HOST = originalHost;
				if (originalPort === undefined) delete process.env.SMTP_PORT;
				else process.env.SMTP_PORT = originalPort;
				consoleError.mockRestore();
			}

			expect(response.status).toBe(200);
			expect((await messageRows(roomId)).map(({ message }) => message)).toEqual(['Persist despite unavailable SMTP']);
			const [room] = await db.select().from(chat_rooms).where(eq(chat_rooms.id, roomId));
			expect(room?.updated_at.getTime()).toBeGreaterThan(oldActivity.getTime());
			expect(await emailsFor(actors.seller.user.email)).toHaveLength(0);
		});

		it('emits no notification when the message insert fails', async () => {
			const actors = await createCommerceActors();
			const item = await createItemFixture(actors);
			const roomId = await createRoomId(actors.buyer.jar, item.id);
			const { client } = getTestDatabase();
			const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
			await client.query("SELECT setval(pg_get_serial_sequence('public.chat_messages', 'id'), 2147483647, true)");

			let response: Response;
			try {
				response = await sendMessage(actors.buyer.jar, roomId, 'This insert must fail');
			} finally {
				consoleError.mockRestore();
			}

			expect(response.status).toBe(500);
			expect(await messageRows(roomId)).toEqual([]);
			expect(await emailsFor(actors.seller.user.email)).toHaveLength(0);
		});

		it('rolls back the message and emits no notification when room activity cannot update', async () => {
			const actors = await createCommerceActors();
			const item = await createItemFixture(actors);
			const roomId = await createRoomId(actors.buyer.jar, item.id);
			const { client } = getTestDatabase();
			const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
			await client.query(`
				CREATE FUNCTION test_fail_chat_room_update() RETURNS trigger
				LANGUAGE plpgsql AS $$
				BEGIN
					RAISE EXCEPTION 'injected chat room update failure';
				END;
				$$;
				CREATE TRIGGER test_fail_chat_room_update
				BEFORE UPDATE ON chat_rooms
				FOR EACH ROW EXECUTE FUNCTION test_fail_chat_room_update();
			`);
			let response: Response;

			try {
				response = await sendMessage(actors.buyer.jar, roomId, 'This transaction must roll back');
			} finally {
				await client.query('DROP TRIGGER IF EXISTS test_fail_chat_room_update ON chat_rooms');
				await client.query('DROP FUNCTION IF EXISTS test_fail_chat_room_update()');
				consoleError.mockRestore();
			}

			expect(response.status).toBe(500);
			expect(await messageRows(roomId)).toEqual([]);
			expect(await emailsFor(actors.seller.user.email)).toHaveLength(0);
		});

		it('locks only the chat room row while preserving sender serialization', async () => {
			const actors = await createCommerceActors();
			const item = await createItemFixture(actors);
			const roomId = await createRoomId(actors.buyer.jar, item.id);
			const { client } = getTestDatabase();
			const barrier = await openDedicatedTestConnection();
			const itemWriter = await openDedicatedTestConnection();
			let firstSend: Promise<Response> | undefined;
			let secondSend: Promise<Response> | undefined;
			let itemUpdate: Promise<unknown> | undefined;
			let advisoryLockHeld = false;

			await client.query(`
				CREATE FUNCTION test_hold_chat_message_insert() RETURNS trigger
				LANGUAGE plpgsql AS $$
				BEGIN
					PERFORM pg_advisory_xact_lock(hashtext(current_database()), 606);
					RETURN NEW;
				END;
				$$;
				CREATE TRIGGER test_hold_chat_message_insert
					BEFORE INSERT ON chat_messages
					FOR EACH ROW EXECUTE FUNCTION test_hold_chat_message_insert();
			`);

			try {
				await barrier.query('SELECT pg_advisory_lock(hashtext(current_database()), 606)');
				advisoryLockHeld = true;
				const barrierBackend = await barrier.query<{ pid: number }>('SELECT pg_backend_pid() AS pid');
				const barrierPid = barrierBackend.rows[0]?.pid;
				if (!barrierPid) throw new Error('Missing message-insert barrier PID');

				firstSend = directlyAuthenticatedRequest(
					`/chat/auth/rooms/${roomId}/messages`,
					'POST',
					actorApiUser(actors.buyer),
					{ message: 'First lock-scope message' },
				);
				const [blockedInsert] = await waitForBlockedStatements(barrier, barrierPid, 1, '%insert into "chat_messages"%');
				const firstSenderPid = blockedInsert?.pid;
				if (!firstSenderPid) throw new Error('Missing blocked first-sender PID');

				secondSend = directlyAuthenticatedRequest(
					`/chat/auth/rooms/${roomId}/messages`,
					'POST',
					actorApiUser(actors.buyer),
					{ message: 'Second serialized message' },
				);
				const [blockedRoomLock] = await waitForBlockedStatements(
					barrier,
					firstSenderPid,
					1,
					'%from "chat_rooms"%for update%',
				);

				itemUpdate = itemWriter.query('UPDATE items SET updated_at = updated_at WHERE id = $1 RETURNING id', [item.id]);
				let itemUpdateCompletedWhileRoomWasLocked = true;
				try {
					await bounded(itemUpdate, 'independent item update');
				} catch {
					itemUpdateCompletedWhileRoomWasLocked = false;
				}

				expect({
					itemUpdateCompletedWhileRoomWasLocked,
					roomLockIsScoped: blockedRoomLock?.query.includes('for update of "chat_rooms"') ?? false,
				}).toEqual({ itemUpdateCompletedWhileRoomWasLocked: true, roomLockIsScoped: true });
			} finally {
				if (advisoryLockHeld) {
					await barrier.query('SELECT pg_advisory_unlock(hashtext(current_database()), 606)');
				}
				await Promise.allSettled([firstSend, secondSend, itemUpdate].filter((promise) => promise !== undefined));
				await client.query('DROP TRIGGER IF EXISTS test_hold_chat_message_insert ON chat_messages');
				await client.query('DROP FUNCTION IF EXISTS test_hold_chat_message_insert()');
				await itemWriter.end();
				await barrier.end();
			}

			if (!firstSend || !secondSend) throw new Error('Lock-scope sender requests did not start');
			expect((await Promise.all([firstSend, secondSend])).map(({ status }) => status)).toEqual([200, 200]);
			expect(new Set((await messageRows(roomId)).map(({ message }) => message))).toEqual(
				new Set(['First lock-scope message', 'Second serialized message']),
			);
		});

		it('serializes concurrent first sends and emits exactly one post-commit notification', async () => {
			const actors = await createCommerceActors();
			const item = await createItemFixture(actors);
			const roomId = await createRoomId(actors.buyer.jar, item.id);
			const blocker = await openDedicatedTestConnection();
			let sendPromise: Promise<Response[]> | undefined;
			let preReleaseEmails: MailpitSearch['messages'] = [];
			let blockedQueries: string[] = [];

			try {
				await blocker.query('BEGIN');
				await blocker.query('SELECT id FROM chat_rooms WHERE id = $1 FOR NO KEY UPDATE', [roomId]);
				const blockerBackend = await blocker.query<{ pid: number }>('SELECT pg_backend_pid() AS pid');
				const blockerPid = blockerBackend.rows[0]?.pid;
				if (!blockerPid) throw new Error('Missing room blocker PID');

				sendPromise = Promise.all([
					directlyAuthenticatedRequest(`/chat/auth/rooms/${roomId}/messages`, 'POST', actorApiUser(actors.buyer), {
						message: 'Concurrent first message A',
					}),
					directlyAuthenticatedRequest(`/chat/auth/rooms/${roomId}/messages`, 'POST', actorApiUser(actors.buyer), {
						message: 'Concurrent first message B',
					}),
				]);
				blockedQueries = (await waitForBlockedStatements(blocker, blockerPid, 2, '%from "chat_rooms"%for update%')).map(
					({ query }) => query,
				);
				preReleaseEmails = await emailsFor(actors.seller.user.email);
				await blocker.query('COMMIT');
			} finally {
				await blocker.query('ROLLBACK');
				await blocker.end();
			}

			if (!sendPromise) throw new Error('Concurrent send fixture did not start');
			const responses = await sendPromise;
			expect(blockedQueries.every((query) => query.includes('from "chat_rooms"') && query.includes('for update'))).toBe(
				true,
			);
			expect(preReleaseEmails).toHaveLength(0);
			expect(responses.map(({ status }) => status)).toEqual([200, 200]);
			await waitForEmail(actors.seller.user.email, 'Tantovale - New message received');
			expect(await emailsFor(actors.seller.user.email)).toHaveLength(1);
			expect(new Set((await messageRows(roomId)).map(({ message }) => message))).toEqual(
				new Set(['Concurrent first message A', 'Concurrent first message B']),
			);
		});
	});
});
