import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { and, asc, eq } from 'drizzle-orm';
import type { PoolClient } from 'pg';
import { describe, expect, it } from 'vitest';

import { app } from '../../src/app';
import { chat_messages, chat_rooms, items } from '../../src/database/schemas/schema';
import { itemStatus } from '../../src/database/schemas/enumerated_values';
import { createCommerceActors, createItemFixture } from '../fixtures/commerce';
import { authenticatedRequest } from '../helpers/auth';
import { getTestDatabase } from '../helpers/database';
import { waitForEmail, type MailpitSearch } from '../helpers/mailpit';
import type { CookieJar } from '../helpers/request';

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
	metadata: unknown;
};

async function createRoom(jar: CookieJar, itemId: number): Promise<Response> {
	return authenticatedRequest('/chat/auth/rooms', 'POST', jar, { item_id: itemId });
}

async function sendMessage(jar: CookieJar, roomId: number | string, message: string): Promise<Response> {
	return authenticatedRequest(`/chat/auth/rooms/${roomId}/messages`, 'POST', jar, { message });
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
});
