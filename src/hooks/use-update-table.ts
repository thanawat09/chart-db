import type { DBTable } from '@/lib/domain';
import { useCallback, useEffect, useState } from 'react';
import { useChartDB } from './use-chartdb';
import { useDebounce } from './use-debounce-v2';

// Hook for updating table properties with debouncing for performance
export const useUpdateTable = (table: DBTable) => {
    const { updateTable: chartDBUpdateTable } = useChartDB();
    const [localTableName, setLocalTableName] = useState(table.name);
    const [localTableComments, setLocalTableComments] = useState(
        table.comments ?? ''
    );

    // Debounced update function
    const debouncedUpdate = useDebounce(
        useCallback(
            (value: string) => {
                if (value.trim() && value.trim() !== table.name) {
                    chartDBUpdateTable(table.id, { name: value.trim() });
                }
            },
            [chartDBUpdateTable, table.id, table.name]
        ),
        1000 // 1000ms debounce
    );

    const debouncedCommentsUpdate = useDebounce(
        useCallback(
            (value: string) => {
                const next = value.trim() ? value : null;
                const current = table.comments?.trim()
                    ? table.comments
                    : null;
                if ((next ?? null) !== (current ?? null)) {
                    chartDBUpdateTable(table.id, { comments: next });
                }
            },
            [chartDBUpdateTable, table.id, table.comments]
        ),
        300
    );

    // Update local state immediately for responsive UI
    const handleTableNameChange = useCallback(
        (value: string) => {
            setLocalTableName(value);
            debouncedUpdate(value);
        },
        [debouncedUpdate]
    );

    const handleTableCommentsChange = useCallback(
        (value: string) => {
            setLocalTableComments(value);
            debouncedCommentsUpdate(value);
        },
        [debouncedCommentsUpdate]
    );

    // Update local state when table name changes externally
    useEffect(() => {
        setLocalTableName(table.name);
    }, [table.name]);

    useEffect(() => {
        setLocalTableComments(table.comments ?? '');
    }, [table.comments]);

    return {
        tableName: localTableName,
        tableComments: localTableComments,
        handleTableNameChange,
        handleTableCommentsChange,
    };
};
