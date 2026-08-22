import { DatabaseType } from '@/lib/domain/database-type';
import type { DBField } from '@/lib/domain/db-field';
import type { DBTable } from '@/lib/domain/db-table';
import type { Diagram } from '@/lib/domain/diagram';
import { describe, expect, it } from 'vitest';
import { exportBaseSQL } from '../export-sql-script';

describe('field example SQL export', () => {
    it('does not include example text in SQL', () => {
        const sentinel = 'UNIQUE_EXAMPLE_SENTINEL_XYZ';
        const field: DBField = {
            id: 'f1',
            name: 'firstname',
            type: { id: 'varchar', name: 'varchar' },
            primaryKey: false,
            unique: false,
            nullable: true,
            createdAt: Date.now(),
            comments: 'staff name',
            example: sentinel,
        };
        const table: DBTable = {
            id: 't1',
            name: 'wfm_staffs',
            fields: [field],
            indexes: [],
            createdAt: Date.now(),
            x: 0,
            y: 0,
            width: 200,
            color: '#ffffff',
            isView: false,
        };
        const diagram = {
            id: 'd1',
            name: 'test',
            databaseType: DatabaseType.POSTGRESQL,
            tables: [table],
            relationships: [],
            createdAt: new Date(),
            updatedAt: new Date(),
        } as Diagram;

        const sql = exportBaseSQL({
            diagram,
            targetDatabaseType: DatabaseType.POSTGRESQL,
        });
        expect(sql).not.toContain(sentinel);
    });
});
