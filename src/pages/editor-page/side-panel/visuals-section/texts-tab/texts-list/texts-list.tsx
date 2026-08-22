import React, { useCallback, useMemo } from 'react';
import { TextListItem } from './text-list-item/text-list-item';
import type { Text } from '@/lib/domain/text';
import { useLayout } from '@/hooks/use-layout';
import {
    closestCenter,
    DndContext,
    type DragEndEvent,
    PointerSensor,
    useSensor,
    useSensors,
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useChartDB } from '@/hooks/use-chartdb.ts';

export interface TextsListProps {
    texts: Text[];
}

export const TextsList: React.FC<TextsListProps> = ({ texts }) => {
    const { updateText } = useChartDB();

    const { openedTextInSidebar } = useLayout();
    const lastSelectedText = React.useRef<string | null>(null);
    const refs = useMemo(
        () =>
            texts.reduce(
                (acc, text) => {
                    acc[text.id] = React.createRef();
                    return acc;
                },
                {} as Record<string, React.RefObject<HTMLDivElement>>
            ),
        [texts]
    );

    const scrollToText = useCallback(
        (id: string) =>
            refs[id]?.current?.scrollIntoView({
                behavior: 'smooth',
                block: 'start',
            }),
        [refs]
    );

    const sensors = useSensors(useSensor(PointerSensor));

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;

        if (active?.id !== over?.id && !!over && !!active) {
            const oldIndex = texts.findIndex((text) => text.id === active.id);
            const newIndex = texts.findIndex((text) => text.id === over.id);

            const newTextsOrder = arrayMove<Text>(texts, oldIndex, newIndex);

            newTextsOrder.forEach((text, index) => {
                updateText(text.id, { order: index });
            });
        }
    };

    const handleScrollToText = useCallback(() => {
        if (
            openedTextInSidebar &&
            lastSelectedText.current !== openedTextInSidebar
        ) {
            lastSelectedText.current = openedTextInSidebar;
            scrollToText(openedTextInSidebar);
        }
    }, [scrollToText, openedTextInSidebar]);

    React.useEffect(() => {
        handleScrollToText();
    }, [openedTextInSidebar, handleScrollToText]);

    return (
        <div className="flex w-full flex-col gap-1">
            <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
            >
                <SortableContext
                    items={texts}
                    strategy={verticalListSortingStrategy}
                >
                    {texts
                        .sort((text1: Text, text2: Text) => {
                            if (text1.order && text2.order === undefined) {
                                return -1;
                            }

                            if (text1.order === undefined && text2.order) {
                                return 1;
                            }

                            if (
                                text1.order !== undefined &&
                                text2.order !== undefined
                            ) {
                                return text1.order - text2.order;
                            }

                            return text1.content.localeCompare(text2.content);
                        })
                        .map((text) => (
                            <TextListItem
                                key={text.id}
                                text={text}
                                ref={refs[text.id]}
                            />
                        ))}
                </SortableContext>
            </DndContext>
        </div>
    );
};
