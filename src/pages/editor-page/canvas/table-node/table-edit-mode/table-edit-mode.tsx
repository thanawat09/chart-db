import { Button } from '@/components/button/button';
import { ColorPicker } from '@/components/color-picker/color-picker';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogTitle,
} from '@/components/dialog/dialog';
import { Input } from '@/components/input/input';
import { ScrollArea } from '@/components/scroll-area/scroll-area';
import type { SelectBoxOption } from '@/components/select-box/select-box';
import { SelectBox } from '@/components/select-box/select-box';
import { Separator } from '@/components/separator/separator';
import { useChartDB } from '@/hooks/use-chartdb';
import { useLayout } from '@/hooks/use-layout';
import { useUpdateTable } from '@/hooks/use-update-table';
import { defaultSchemas } from '@/lib/data/default-schemas';
import type { DBTable } from '@/lib/domain';
import type { DBSchema } from '@/lib/domain/db-schema';
import {
    databasesWithSchemas,
    schemaNameToSchemaId,
} from '@/lib/domain/db-schema';
import { CircleDotDashed, FileType2, SquarePlus } from 'lucide-react';
import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { TableEditModeField } from './table-edit-mode-field';

export interface TableEditModeProps {
    table: DBTable;
    color: string;
    focusFieldId?: string;
    onClose: () => void;
}

export const TableEditMode: React.FC<TableEditModeProps> = React.memo(
    ({ table, color, focusFieldId: focusFieldIdProp, onClose }) => {
        const scrollAreaRef = useRef<HTMLDivElement>(null);
        const fieldRefs = useRef<Map<string, HTMLDivElement>>(new Map());
        const { createField, updateTable, schemas, databaseType } =
            useChartDB();
        const { t } = useTranslation();
        const { openTableFromSidebar, selectSidebarSection } = useLayout();
        const {
            tableName,
            tableComments,
            handleTableNameChange,
            handleTableCommentsChange,
        } = useUpdateTable(table);
        const [focusFieldId, setFocusFieldId] = useState<string | undefined>(
            focusFieldIdProp
        );
        const inputRef = useRef<HTMLInputElement>(null);

        const [isCreatingNewSchema, setIsCreatingNewSchema] = useState(false);
        const [newSchemaName, setNewSchemaName] = useState('');
        const [selectedSchemaId, setSelectedSchemaId] = useState<string>(() =>
            table.schema ? schemaNameToSchemaId(table.schema) : ''
        );

        useEffect(() => {
            setSelectedSchemaId(
                table.schema ? schemaNameToSchemaId(table.schema) : ''
            );
        }, [table.schema]);

        const supportsSchemas = useMemo(
            () => databasesWithSchemas.includes(databaseType),
            [databaseType]
        );

        const defaultSchemaName = useMemo(
            () => defaultSchemas?.[databaseType],
            [databaseType]
        );

        const schemaOptions: SelectBoxOption[] = useMemo(
            () =>
                schemas.map((schema) => ({
                    value: schema.id,
                    label: schema.name,
                })),
            [schemas]
        );

        useEffect(() => {
            setFocusFieldId(focusFieldIdProp);
            if (!focusFieldIdProp) {
                inputRef.current?.select();
            }
        }, [focusFieldIdProp]);

        const setFieldRef = useCallback((fieldId: string) => {
            return (element: HTMLDivElement | null) => {
                if (element) {
                    fieldRefs.current.set(fieldId, element);
                } else {
                    fieldRefs.current.delete(fieldId);
                }
            };
        }, []);

        const scrollToFieldId = useCallback((fieldId: string) => {
            const fieldElement = fieldRefs.current.get(fieldId);
            if (fieldElement) {
                fieldElement.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center',
                });
            }
        }, []);

        useEffect(() => {
            if (focusFieldId) {
                scrollToFieldId(focusFieldId);
            }
        }, [focusFieldId, scrollToFieldId]);

        useEffect(() => {
            const handleWheel = (e: WheelEvent) => {
                if (e.ctrlKey || e.metaKey) {
                    return;
                }
                e.stopPropagation();
            };

            const scrollArea = scrollAreaRef.current;
            if (scrollArea) {
                scrollArea.addEventListener('wheel', handleWheel, {
                    passive: false,
                });
                return () => {
                    scrollArea.removeEventListener('wheel', handleWheel);
                };
            }
        }, []);

        const handleAddField = useCallback(async () => {
            const field = await createField(table.id);
            if (field.id) {
                setFocusFieldId(field.id);
            }
        }, [createField, table.id]);

        const handleColorChange = useCallback(
            (newColor: string) => {
                updateTable(table.id, { color: newColor });
            },
            [updateTable, table.id]
        );

        const handleSchemaChange = useCallback(
            (schemaId: string) => {
                const schema = schemas.find((s) => s.id === schemaId);
                if (schema) {
                    updateTable(table.id, { schema: schema.name });
                    setSelectedSchemaId(schemaId);
                }
            },
            [schemas, updateTable, table.id]
        );

        const handleCreateNewSchema = useCallback(() => {
            if (newSchemaName.trim()) {
                const trimmedName = newSchemaName.trim();
                const newSchema: DBSchema = {
                    id: schemaNameToSchemaId(trimmedName),
                    name: trimmedName,
                    tableCount: 0,
                };
                updateTable(table.id, { schema: newSchema.name });
                setSelectedSchemaId(newSchema.id);
                setIsCreatingNewSchema(false);
                setNewSchemaName('');
            }
        }, [newSchemaName, updateTable, table.id]);

        const handleToggleSchemaMode = useCallback(() => {
            if (isCreatingNewSchema && newSchemaName.trim()) {
                handleCreateNewSchema();
            } else {
                setIsCreatingNewSchema(!isCreatingNewSchema);
                setNewSchemaName('');
            }
        }, [isCreatingNewSchema, newSchemaName, handleCreateNewSchema]);

        const openTableInEditor = useCallback(() => {
            selectSidebarSection('tables');
            openTableFromSidebar(table.id);
        }, [selectSidebarSection, openTableFromSidebar, table.id]);

        return (
            <Dialog
                open
                onOpenChange={(open) => {
                    if (!open) {
                        onClose();
                    }
                }}
            >
                <DialogContent
                    showClose
                    className="flex h-[min(500px,95vh)] max-h-[min(500px,95vh)] w-[min(800px,95vw)] max-w-[min(800px,95vw)] flex-col gap-0 overflow-hidden p-0 sm:rounded-lg"
                    onClick={(e) => e.stopPropagation()}
                    onOpenAutoFocus={(e) => {
                        if (focusFieldIdProp) {
                            e.preventDefault();
                        }
                    }}
                    onPointerDownOutside={(e) => {
                        const target = e.target as HTMLElement | null;
                        if (
                            target?.closest(
                                '[data-radix-popper-content-wrapper]'
                            ) ||
                            target?.closest('[data-radix-select-content]') ||
                            target?.closest('[data-radix-tooltip-content]')
                        ) {
                            e.preventDefault();
                        }
                    }}
                    onInteractOutside={(e) => {
                        const target = e.target as HTMLElement | null;
                        if (
                            target?.closest(
                                '[data-radix-popper-content-wrapper]'
                            ) ||
                            target?.closest('[data-radix-select-content]') ||
                            target?.closest('[data-radix-tooltip-content]')
                        ) {
                            e.preventDefault();
                        }
                    }}
                    onEscapeKeyDown={(e) => e.preventDefault()}
                >
                    <DialogTitle className="sr-only">
                        {tableName || table.name}
                    </DialogTitle>
                    <DialogDescription className="sr-only">
                        {t('side_panel.tables_section.table.fields')}
                    </DialogDescription>

                    <div
                        className="h-2 shrink-0"
                        style={{ backgroundColor: color }}
                    />
                    <div className="flex h-11 shrink-0 items-center justify-between gap-2 border-b bg-slate-200 px-3 pr-12 dark:bg-slate-900">
                        <div className="flex min-w-0 flex-1 items-center gap-2">
                            {supportsSchemas && !isCreatingNewSchema && (
                                <SelectBox
                                    options={schemaOptions}
                                    value={selectedSchemaId}
                                    onChange={(value) =>
                                        handleSchemaChange(value as string)
                                    }
                                    placeholder={
                                        defaultSchemaName || 'Select schema'
                                    }
                                    className="h-8 min-h-8 w-28 shrink-0 rounded-sm border-slate-600 bg-background py-0 pl-2 pr-0.5 text-sm"
                                    popoverClassName="w-[200px]"
                                    commandOnMouseDown={(e) =>
                                        e.stopPropagation()
                                    }
                                    commandOnClick={(e) => e.stopPropagation()}
                                    footerButtons={
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="w-full justify-center rounded-none text-xs"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleToggleSchemaMode();
                                            }}
                                        >
                                            <SquarePlus className="!size-3.5" />
                                            Create new schema
                                        </Button>
                                    }
                                />
                            )}
                            {supportsSchemas && isCreatingNewSchema && (
                                <Input
                                    value={newSchemaName}
                                    onChange={(e) =>
                                        setNewSchemaName(e.target.value)
                                    }
                                    placeholder={`Enter schema name${defaultSchemaName ? ` (e.g. ${defaultSchemaName})` : ''}`}
                                    className="h-8 w-36 shrink-0 rounded-sm border-slate-600 bg-background text-sm"
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            handleCreateNewSchema();
                                        } else if (e.key === 'Escape') {
                                            handleToggleSchemaMode();
                                        }
                                    }}
                                    onBlur={handleToggleSchemaMode}
                                    autoFocus
                                />
                            )}
                            <Input
                                ref={inputRef}
                                className="h-8 flex-1 rounded-sm border-slate-600 bg-background text-sm"
                                placeholder="Table name"
                                value={tableName}
                                onChange={(e) =>
                                    handleTableNameChange(e.target.value)
                                }
                            />
                        </div>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="size-8 shrink-0 p-0 text-slate-500 hover:bg-slate-300 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                            onClick={openTableInEditor}
                        >
                            <CircleDotDashed className="size-4" />
                        </Button>
                    </div>
                    <div className="shrink-0 border-b border-slate-300 bg-slate-100 px-3 py-2 dark:border-slate-700 dark:bg-slate-900/80">
                        <Input
                            className="h-8 w-full rounded-sm border-slate-600 bg-background text-sm"
                            placeholder={t(
                                'side_panel.tables_section.table.no_comments'
                            )}
                            value={tableComments}
                            onChange={(e) =>
                                handleTableCommentsChange(e.target.value)
                            }
                        />
                    </div>

                    <ScrollArea
                        ref={scrollAreaRef}
                        className="min-h-0 flex-1 px-3 py-2"
                    >
                        {table.fields.map((field) => (
                            <div key={field.id} ref={setFieldRef(field.id)}>
                                <TableEditModeField
                                    table={table}
                                    field={field}
                                    focused={focusFieldId === field.id}
                                    databaseType={databaseType}
                                />
                            </div>
                        ))}
                    </ScrollArea>

                    <Separator />
                    <div className="flex shrink-0 items-center justify-between p-3">
                        <div className="flex items-center gap-2">
                            {!table.isView ? (
                                <ColorPicker
                                    color={color}
                                    onChange={handleColorChange}
                                    popoverOnMouseDown={(e) =>
                                        e.stopPropagation()
                                    }
                                    popoverOnClick={(e) => e.stopPropagation()}
                                />
                            ) : (
                                <div />
                            )}
                            <Button
                                variant="outline"
                                className="h-8 p-2 text-xs"
                                onClick={handleAddField}
                            >
                                <FileType2 className="mr-1 h-4" />
                                {t('side_panel.tables_section.table.add_field')}
                            </Button>
                        </div>
                        <span className="text-xs font-medium text-muted-foreground">
                            {table.fields.length}{' '}
                            {t('side_panel.tables_section.table.fields')}
                        </span>
                    </div>
                </DialogContent>
            </Dialog>
        );
    }
);

TableEditMode.displayName = 'TableEditMode';
