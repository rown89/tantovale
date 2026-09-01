import { getTableName, is } from 'drizzle-orm';
import { type AnyPgTable, getTableConfig, PgTable } from 'drizzle-orm/pg-core';
import type { PoolClient, QueryResult } from 'pg';
import { describe, expect, it } from 'vitest';

import * as schema from '../../src/database/schemas/schema';
import { getTestDatabase } from '../helpers/database';

type ForeignKeyProjection = {
	columnName: string;
	foreignColumnName: string;
	foreignTableName: string;
	onDelete: string;
	onUpdate: string;
	tableName: string;
};

function compareForeignKeys(left: ForeignKeyProjection, right: ForeignKeyProjection): number {
	return JSON.stringify(left).localeCompare(JSON.stringify(right));
}

function sourceForeignKeys(): ForeignKeyProjection[] {
	const tables = (Object.values(schema) as unknown[]).filter((value): value is AnyPgTable => is(value, PgTable));

	return tables
		.flatMap((table) => {
			const tableConfig = getTableConfig(table);

			return tableConfig.foreignKeys.flatMap((foreignKey) => {
				const reference = foreignKey.reference();
				expect(reference.columns).toHaveLength(reference.foreignColumns.length);

				return reference.columns.map((column, index) => ({
					columnName: column.name,
					foreignColumnName: reference.foreignColumns[index]!.name,
					foreignTableName: getTableName(reference.foreignTable),
					onDelete: (foreignKey.onDelete ?? 'no action').toUpperCase(),
					onUpdate: (foreignKey.onUpdate ?? 'no action').toUpperCase(),
					tableName: tableConfig.name,
				}));
			});
		})
		.sort(compareForeignKeys);
}

async function readDatabaseForeignKeys(
	connection: Pick<PoolClient, 'query'>,
	tableName: string | null = null,
): Promise<QueryResult<ForeignKeyProjection>> {
	return connection.query<ForeignKeyProjection>(
		`
			SELECT
				fk.column_name AS "columnName",
				referenced.column_name AS "foreignColumnName",
				referenced.table_name AS "foreignTableName",
				reference.delete_rule AS "onDelete",
				reference.update_rule AS "onUpdate",
				fk.table_name AS "tableName"
			FROM information_schema.referential_constraints reference
			INNER JOIN information_schema.key_column_usage fk
				ON reference.constraint_catalog = fk.constraint_catalog
				AND reference.constraint_schema = fk.constraint_schema
				AND reference.constraint_name = fk.constraint_name
			INNER JOIN information_schema.key_column_usage referenced
				ON reference.unique_constraint_catalog = referenced.constraint_catalog
				AND reference.unique_constraint_schema = referenced.constraint_schema
				AND reference.unique_constraint_name = referenced.constraint_name
				AND fk.position_in_unique_constraint = referenced.ordinal_position
			WHERE reference.constraint_schema = 'public'
				AND ($1::text IS NULL OR fk.table_name = $1)
		`,
		[tableName],
	);
}

describe('runtime Drizzle schema', () => {
	it('matches every source foreign-key callback to the migrated PostgreSQL graph', async () => {
		const { client } = getTestDatabase();
		const { rows: databaseForeignKeys } = await readDatabaseForeignKeys(client);

		const source = sourceForeignKeys();
		const database = databaseForeignKeys.sort(compareForeignKeys);

		expect(source).toHaveLength(51);
		expect(source).toEqual(database);
		expect(
			Object.entries(
				source.reduce<Record<string, number>>((distribution, foreignKey) => {
					const action = `${foreignKey.onDelete}/${foreignKey.onUpdate}`;
					distribution[action] = (distribution[action] ?? 0) + 1;
					return distribution;
				}, {}),
			).sort(),
		).toEqual([
			['CASCADE/CASCADE', 45],
			['NO ACTION/NO ACTION', 1],
			['RESTRICT/CASCADE', 5],
		]);

		const mutated = structuredClone(source);
		mutated[0]!.onDelete = mutated[0]!.onDelete === 'CASCADE' ? 'RESTRICT' : 'CASCADE';
		expect(mutated).not.toEqual(database);
	});

	it('pairs composite foreign-key columns by their referenced ordinal positions', async () => {
		const { client } = getTestDatabase();
		const connection = await client.connect();

		try {
			await connection.query('BEGIN');
			await connection.query(`
				CREATE TABLE public.p07_composite_fk_parent (
					x integer NOT NULL,
					y integer NOT NULL,
					UNIQUE (x, y)
				);
				CREATE TABLE public.p07_composite_fk_child (
					a integer NOT NULL,
					b integer NOT NULL,
					CONSTRAINT p07_composite_fk_exact
						FOREIGN KEY (a, b)
						REFERENCES public.p07_composite_fk_parent (y, x)
						ON DELETE RESTRICT
						ON UPDATE CASCADE
				);
			`);

			const { rows } = await readDatabaseForeignKeys(connection, 'p07_composite_fk_child');
			const projection = rows.sort(compareForeignKeys);

			expect(projection).toEqual([
				{
					columnName: 'a',
					foreignColumnName: 'y',
					foreignTableName: 'p07_composite_fk_parent',
					onDelete: 'RESTRICT',
					onUpdate: 'CASCADE',
					tableName: 'p07_composite_fk_child',
				},
				{
					columnName: 'b',
					foreignColumnName: 'x',
					foreignTableName: 'p07_composite_fk_parent',
					onDelete: 'RESTRICT',
					onUpdate: 'CASCADE',
					tableName: 'p07_composite_fk_child',
				},
			]);
			expect(projection).not.toEqual([
				{ ...projection[0]!, foreignColumnName: 'x' },
				{ ...projection[1]!, foreignColumnName: 'y' },
			]);
		} finally {
			try {
				await connection.query('ROLLBACK');
			} finally {
				connection.release();
			}
		}
	});
});
