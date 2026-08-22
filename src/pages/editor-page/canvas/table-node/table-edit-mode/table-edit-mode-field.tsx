import { Input } from '@/components/input/input';
import { SelectBox } from '@/components/select-box/select-box';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/tooltip/tooltip';
import { useChartDB } from '@/hooks/use-chartdb';
import { useUpdateTableField } from '@/hooks/use-update-table-field';
import { requiresNotNull } from '@/lib/data/data-types/data-types';
import type { DatabaseType, DBTable } from '@/lib/domain';
import { generateDBFieldSuffix, type DBField } from '@/lib/domain/db-field';
import { cn } from '@/lib/utils';
import { Eye, EyeOff, KeyRound, Trash2 } from 'lucide-react';
import React, { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { TableFieldToggle } from './table-field-toggle';

export interface TableEditModeFieldProps {
    table: DBTable;
    field: DBField;
    focused?: boolean;
    databaseType: DatabaseType;
}

export const TableEditModeField: React.FC<TableEditModeFieldProps> = React.memo(
    ({ table, field, focused = false, databaseType }) => {
        const { t } = useTranslation();
        const { relationships } = useChartDB();
        const [showHighlight, setShowHighlight] = React.useState(false);

        const {
            dataFieldOptions,
            handleDataTypeChange,
            handlePrimaryKeyToggle,
            handleNullableToggle,
            handleShowWhenCollapsedToggle,
            handleNameChange,
            handleExampleChange,
            handleCommentsChange,
            generateFieldSuffix,
            fieldName,
            example,
            comments,
            nullable,
            primaryKey,
            showWhenCollapsed,
            removeField,
        } = useUpdateTableField(table, field);

        const isForeignKey = useMemo(
            () =>
                relationships.some(
                    (rel) =>
                        rel.sourceFieldId === field.id ||
                        rel.targetFieldId === field.id
                ),
            [relationships, field.id]
        );

        const inputRef = React.useRef<HTMLInputElement>(null);

        const typeRequiresNotNull = requiresNotNull(field.type.name);

        useEffect(() => {
            if (focused) {
                const timer = setTimeout(() => {
                    setShowHighlight(true);
                    inputRef.current?.select();

                    setTimeout(() => {
                        setShowHighlight(false);
                    }, 2000);
                }, 200);

                return () => clearTimeout(timer);
            } else {
                setShowHighlight(false);
            }
        }, [focused]);

        return (
            <div
                className={cn(
                    'flex flex-1 flex-row justify-between gap-2 border-b border-border/40 p-2 transition-colors duration-1000 ease-out last:border-b-0',
                    {
                        'bg-sky-100 dark:bg-sky-950': showHighlight,
                    }
                )}
            >
                <div className="flex min-w-0 flex-1 items-center justify-start gap-1 overflow-hidden">
                    <span className="relative min-w-0 flex-[2]">
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Input
                                    ref={inputRef}
                                    className="h-8 w-full !truncate bg-background focus-visible:ring-0"
                                    type="text"
                                    placeholder={t(
                                        'side_panel.tables_section.table.field_name'
                                    )}
                                    value={fieldName}
                                    onChange={(e) =>
                                        handleNameChange(e.target.value)
                                    }
                                    autoFocus={focused}
                                />
                            </TooltipTrigger>
                            <TooltipContent>{fieldName}</TooltipContent>
                        </Tooltip>
                    </span>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Input
                                className="h-8 min-w-0 flex-[2] !truncate bg-background focus-visible:ring-0"
                                type="text"
                                placeholder={t(
                                    'side_panel.tables_section.table.field_actions.no_comments'
                                )}
                                value={comments}
                                onChange={(e) =>
                                    handleCommentsChange(e.target.value)
                                }
                            />
                        </TooltipTrigger>
                        <TooltipContent>
                            {comments ||
                                t(
                                    'side_panel.tables_section.table.field_actions.comments'
                                )}
                        </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Input
                                className="h-8 min-w-0 flex-1 !truncate bg-background focus-visible:ring-0"
                                type="text"
                                placeholder={t(
                                    'side_panel.tables_section.table.field_actions.no_example'
                                )}
                                value={example}
                                onChange={(e) =>
                                    handleExampleChange(e.target.value)
                                }
                            />
                        </TooltipTrigger>
                        <TooltipContent>
                            {example ||
                                t(
                                    'side_panel.tables_section.table.field_actions.example'
                                )}
                        </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                        <TooltipTrigger
                            className="flex h-8 w-[8.5rem] shrink-0"
                            asChild
                        >
                            <span>
                                <SelectBox
                                    className="flex h-8 min-h-8 w-full bg-background"
                                    popoverClassName="min-w-[200px]"
                                    options={dataFieldOptions}
                                    placeholder={t(
                                        'side_panel.tables_section.table.field_type'
                                    )}
                                    value={field.type.id}
                                    valueSuffix={generateDBFieldSuffix(field, {
                                        databaseType,
                                    })}
                                    optionSuffix={(option) =>
                                        generateFieldSuffix(option.value)
                                    }
                                    onChange={handleDataTypeChange}
                                    emptyPlaceholder={t(
                                        'side_panel.tables_section.table.no_types_found'
                                    )}
                                    commandOnClick={(e) => e.stopPropagation()}
                                    commandOnMouseDown={(e) =>
                                        e.stopPropagation()
                                    }
                                />
                            </span>
                        </TooltipTrigger>
                        <TooltipContent>
                            {field.type.name}
                            {generateDBFieldSuffix(field, {
                                databaseType,
                            })}
                        </TooltipContent>
                    </Tooltip>
                </div>
                <div className="flex shrink-0 items-center justify-end gap-1">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <span>
                                <TableFieldToggle
                                    pressed={showWhenCollapsed}
                                    onPressedChange={
                                        handleShowWhenCollapsedToggle
                                    }
                                >
                                    {showWhenCollapsed ? (
                                        <Eye className="h-3.5" />
                                    ) : (
                                        <EyeOff className="h-3.5" />
                                    )}
                                </TableFieldToggle>
                            </span>
                        </TooltipTrigger>
                        <TooltipContent>
                            <div>
                                {t(
                                    'side_panel.tables_section.table.field_actions.show_when_collapsed'
                                )}
                            </div>
                            {primaryKey || isForeignKey ? (
                                <div className="mt-1 text-xs opacity-80">
                                    {t(
                                        'side_panel.tables_section.table.field_actions.show_when_collapsed_pk_fk_hint'
                                    )}
                                </div>
                            ) : null}
                        </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <span>
                                <TableFieldToggle
                                    pressed={nullable}
                                    onPressedChange={handleNullableToggle}
                                    disabled={typeRequiresNotNull || primaryKey}
                                >
                                    N
                                </TableFieldToggle>
                            </span>
                        </TooltipTrigger>
                        <TooltipContent>
                            {nullable ? 'Null' : 'Not Null'}
                        </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <span>
                                <TableFieldToggle
                                    pressed={primaryKey}
                                    onPressedChange={handlePrimaryKeyToggle}
                                >
                                    <KeyRound className="h-3.5" />
                                </TableFieldToggle>
                            </span>
                        </TooltipTrigger>
                        <TooltipContent>
                            {t('side_panel.tables_section.table.primary_key')}
                        </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <span>
                                <TableFieldToggle onPressedChange={removeField}>
                                    <Trash2 className="h-3.5 text-red-700" />
                                </TableFieldToggle>
                            </span>
                        </TooltipTrigger>
                        <TooltipContent>
                            {t(
                                'side_panel.tables_section.table.field_actions.delete_field'
                            )}
                        </TooltipContent>
                    </Tooltip>
                </div>
            </div>
        );
    }
);

TableEditModeField.displayName = 'TableEditModeField';
