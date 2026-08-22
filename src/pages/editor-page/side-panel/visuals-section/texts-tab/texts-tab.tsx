import { Button } from '@/components/button/button';
import { EmptyState } from '@/components/empty-state/empty-state';
import { Input } from '@/components/input/input';
import { ScrollArea } from '@/components/scroll-area/scroll-area';
import { useChartDB } from '@/hooks/use-chartdb';
import { useLayout } from '@/hooks/use-layout';
import { useTheme } from '@/hooks/use-theme';
import type { Text } from '@/lib/domain/text';
import { useViewport } from '@xyflow/react';
import { Type, X } from 'lucide-react';
import React, { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { TextsList } from './texts-list/texts-list';

export interface TextsTabProps {}

export const TextsTab: React.FC<TextsTabProps> = () => {
    const { createText, texts, readonly } = useChartDB();
    const viewport = useViewport();
    const { t } = useTranslation();
    const { openTextFromSidebar } = useLayout();
    const { effectiveTheme } = useTheme();
    const [filterText, setFilterText] = React.useState('');
    const filterInputRef = React.useRef<HTMLInputElement>(null);

    const filteredTexts = useMemo(() => {
        const filterTextContent: (text: Text) => boolean = (text) =>
            !filterText?.trim?.() ||
            text.content.toLowerCase().includes(filterText.toLowerCase());

        return texts.filter(filterTextContent);
    }, [texts, filterText]);

    const createTextWithLocation = useCallback(async () => {
        const padding = 80;
        const centerX = -viewport.x / viewport.zoom + padding / viewport.zoom;
        const centerY = -viewport.y / viewport.zoom + padding / viewport.zoom;
        const text = await createText({
            x: centerX,
            y: centerY,
            textColor: effectiveTheme === 'dark' ? '#f8f8f8' : '#111827',
        });
        if (openTextFromSidebar) {
            openTextFromSidebar(text.id);
        }
    }, [
        createText,
        effectiveTheme,
        openTextFromSidebar,
        viewport.x,
        viewport.y,
        viewport.zoom,
    ]);

    const handleCreateText = useCallback(async () => {
        setFilterText('');
        createTextWithLocation();
    }, [createTextWithLocation, setFilterText]);

    const handleClearFilter = useCallback(() => {
        setFilterText('');
    }, []);

    return (
        <div className="flex flex-1 flex-col overflow-hidden px-2">
            <div className="flex items-center justify-between gap-4 pb-1">
                <div className="flex-1">
                    <Input
                        ref={filterInputRef}
                        type="text"
                        placeholder={t('side_panel.texts_section.filter')}
                        className="h-8 w-full focus-visible:ring-0"
                        value={filterText}
                        onChange={(e) => setFilterText(e.target.value)}
                    />
                </div>
                {!readonly ? (
                    <Button
                        variant="secondary"
                        className="h-8 p-2 text-xs"
                        onClick={handleCreateText}
                    >
                        <Type className="h-4" />
                        {t('side_panel.texts_section.add_text')}
                    </Button>
                ) : null}
            </div>
            <div className="flex flex-1 flex-col overflow-hidden">
                <ScrollArea className="h-full">
                    {texts.length === 0 ? (
                        <EmptyState
                            title={t(
                                'side_panel.texts_section.empty_state.title'
                            )}
                            description={t(
                                'side_panel.texts_section.empty_state.description'
                            )}
                            className="mt-20"
                            secondaryAction={
                                !readonly
                                    ? {
                                          label: t(
                                              'side_panel.texts_section.add_text'
                                          ),
                                          onClick: handleCreateText,
                                      }
                                    : undefined
                            }
                        />
                    ) : filterText && filteredTexts.length === 0 ? (
                        <div className="mt-10 flex flex-col items-center gap-2">
                            <div className="text-sm text-muted-foreground">
                                {t('side_panel.texts_section.no_results')}
                            </div>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleClearFilter}
                                className="gap-1"
                            >
                                <X className="size-3.5" />
                                {t('side_panel.texts_section.clear')}
                            </Button>
                        </div>
                    ) : (
                        <TextsList texts={filteredTexts} />
                    )}
                </ScrollArea>
            </div>
        </div>
    );
};
