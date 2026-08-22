import {
    ResizableHandle,
    ResizablePanel,
    ResizablePanelGroup,
} from '@/components/resizable/resizable';
import { SidebarProvider } from '@/components/sidebar/sidebar';
import { useLayout } from '@/hooks/use-layout';
import type { Diagram } from '@/lib/domain/diagram';
import { cn } from '@/lib/utils';
import React from 'react';
import { Canvas } from './canvas/canvas';
import { EditorSidebar } from './editor-sidebar/editor-sidebar';
import { SidePanel } from './side-panel/side-panel';
import { TopNavbar } from './top-navbar/top-navbar';

export interface EditorDesktopLayoutProps {
    initialDiagram?: Diagram;
}
export const EditorDesktopLayout: React.FC<EditorDesktopLayoutProps> = ({
    initialDiagram,
}) => {
    const { isSidePanelShowed } = useLayout();

    return (
        <div className="flex size-full min-h-0 flex-col overflow-hidden">
            <TopNavbar />
            <SidebarProvider
                defaultOpen={false}
                open={false}
                className="flex min-h-0 flex-1 overflow-hidden"
            >
                <EditorSidebar />
                <ResizablePanelGroup
                    direction="horizontal"
                    className="min-h-0"
                >
                    <ResizablePanel
                        defaultSize={25}
                        minSize={25}
                        maxSize={isSidePanelShowed ? 99 : 0}
                        className={cn(
                            'min-h-0 overflow-hidden transition-[flex-grow] duration-200',
                            {
                                'min-w-[350px]': isSidePanelShowed,
                            }
                        )}
                    >
                        <SidePanel />
                    </ResizablePanel>
                    <ResizableHandle
                        disabled={!isSidePanelShowed}
                        className={!isSidePanelShowed ? 'hidden' : ''}
                    />
                    <ResizablePanel
                        defaultSize={75}
                        className="min-h-0 overflow-hidden"
                    >
                        <Canvas initialTables={initialDiagram?.tables ?? []} />
                    </ResizablePanel>
                </ResizablePanelGroup>
            </SidebarProvider>
        </div>
    );
};

export default EditorDesktopLayout;
