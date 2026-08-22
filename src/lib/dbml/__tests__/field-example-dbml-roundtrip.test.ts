import { DatabaseType } from '@/lib/domain/database-type';
import type { DBField } from '@/lib/domain/db-field';
import type { DBTable } from '@/lib/domain/db-table';
import type { Diagram } from '@/lib/domain/diagram';
import { describe, expect, it } from 'vitest';
import { generateDBMLFromDiagram } from '../dbml-export/dbml-export';
import { importDBMLToDiagram } from '../dbml-import/dbml-import';

describe('field example DBML round-trip', () => {
    it('preserves example and comments through export → import', async () => {
        const field: DBField = {
            id: 'f1',
            name: 'firstname',
            type: { id: 'varchar', name: 'varchar' },
            primaryKey: false,
            unique: false,
            nullable: true,
            createdAt: Date.now(),
            characterMaximumLength: '255',
            comments: 'ชื่อพนักงาน',
            example: 'สมชาย',
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

        const { standardDbml, error } = generateDBMLFromDiagram(diagram);
        expect(error).toBeUndefined();
        expect(standardDbml).toMatch(/@example:\s*สมชาย/);
        expect(standardDbml).toContain('ชื่อพนักงาน');

        const imported = await importDBMLToDiagram(standardDbml, {
            databaseType: DatabaseType.POSTGRESQL,
        });
        const importedField = imported.tables?.[0]?.fields.find(
            (f) => f.name === 'firstname'
        );
        expect(importedField?.comments).toBe('ชื่อพนักงาน');
        expect(importedField?.example).toBe('สมชาย');
    });
});
