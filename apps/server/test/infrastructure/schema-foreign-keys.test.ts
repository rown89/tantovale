import { getTableName, is } from 'drizzle-orm';
import { type AnyPgTable, getTableConfig, PgTable } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import * as schema from '../../src/database/schemas/schema';
import { getTestDatabase } from '../helpers/database';

type ForeignKeyProjection = {
	columnName: string;
	foreignColumnName: string;
	foreignTableName: string;
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
					tableName: tableConfig.name,
				}));
			});
		})
		.sort(compareForeignKeys);
}

describe('runtime Drizzle schema', () => {
	it('matches every source foreign-key callback to the migrated PostgreSQL graph', async () => {
		const { client } = getTestDatabase();
		const { rows: databaseForeignKeys } = await client.query<ForeignKeyProjection>(`
			SELECT
				kcu.column_name AS "columnName",
				ccu.column_name AS "foreignColumnName",
				ccu.table_name AS "foreignTableName",
				tc.table_name AS "tableName"
			FROM information_schema.table_constraints tc
			INNER JOIN information_schema.key_column_usage kcu
				ON tc.constraint_schema = kcu.constraint_schema
				AND tc.constraint_name = kcu.constraint_name
			INNER JOIN information_schema.constraint_column_usage ccu
				ON tc.constraint_schema = ccu.constraint_schema
				AND tc.constraint_name = ccu.constraint_name
			WHERE tc.constraint_schema = 'public'
				AND tc.constraint_type = 'FOREIGN KEY'
		`);

		expect(sourceForeignKeys()).toEqual(databaseForeignKeys.sort(compareForeignKeys));
	});
});
