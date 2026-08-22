import ChartDBDarkLogo from '@/assets/logo-dark.png';
import ChartDBLogo from '@/assets/logo-light.png';
import { Separator } from '@/components/separator/separator';
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarGroup,
    SidebarGroupContent,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
} from '@/components/sidebar/sidebar';
import type { SidebarSection } from '@/context/layout-context/layout-context';
import { useBreakpoint } from '@/hooks/use-breakpoint';
import { useChartDB } from '@/hooks/use-chartdb';
import { useDialog } from '@/hooks/use-dialog';
import { useLayout } from '@/hooks/use-layout';
import { useTheme } from '@/hooks/use-theme';
import { supportsCustomTypes } from '@/lib/domain/database-capabilities';
import { DiscordLogoIcon, TwitterLogoIcon } from '@radix-ui/react-icons';
import {
    BookOpen,
    CodeXml,
    FileType,
    FolderOpen,
    Group,
    Plus,
    Table, Workflow,
} from 'lucide-react';
import React, { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

export interface SidebarItem {
    title: string;
    icon: React.FC;
    onClick: () => void;
    active: boolean;
    badge?: string;
}

export interface EditorSidebarProps {}

export const EditorSidebar: React.FC<EditorSidebarProps> = () => {
    const {
        selectSidebarSection,
        selectedSidebarSection,
        showSidePanel,
        toggleSidePanel,
        selectVisualsTab,
    } = useLayout();
    const { t } = useTranslation();
    const { isMd: isDesktop } = useBreakpoint('md');
    const { effectiveTheme } = useTheme();
    const { databaseType } = useChartDB();
    const { openCreateDiagramDialog, openOpenDiagramDialog } = useDialog();

    const handleSectionClick = useCallback(
        (section: SidebarSection) => {
            if (selectedSidebarSection === section) {
                toggleSidePanel();
                return;
            }
            showSidePanel();
            selectSidebarSection(section);
        },
        [
            selectedSidebarSection,
            toggleSidePanel,
            showSidePanel,
            selectSidebarSection,
        ]
    );

    const diagramItems: SidebarItem[] = useMemo(
        () => [
            {
                title: t('editor_sidebar.new_diagram'),
                icon: Plus,
                onClick: () => {
                    openCreateDiagramDialog();
                },
                active: false,
            },
            {
                title: t('editor_sidebar.browse'),
                icon: FolderOpen,
                onClick: () => {
                    openOpenDiagramDialog();
                },
                active: false,
            },
        ],
        [t, openCreateDiagramDialog, openOpenDiagramDialog]
    );

    const baseItems: SidebarItem[] = useMemo(
        () => [
            {
                title: t('editor_sidebar.tables'),
                icon: Table,
                onClick: () => handleSectionClick('tables'),
                active: selectedSidebarSection === 'tables',
            },
            {
                title: 'DBML',
                icon: CodeXml,
                onClick: () => handleSectionClick('dbml'),
                active: selectedSidebarSection === 'dbml',
            },
            {
                title: t('editor_sidebar.refs'),
                icon: Workflow,
                onClick: () => handleSectionClick('refs'),
                active: selectedSidebarSection === 'refs',
            },
            ...(supportsCustomTypes(databaseType)
                ? [
                      {
                          title: t('editor_sidebar.custom_types'),
                          icon: FileType,
                          onClick: () => handleSectionClick('customTypes'),
                          active: selectedSidebarSection === 'customTypes',
                      },
                  ]
                : []),
            {
                title: t('editor_sidebar.visuals'),
                icon: Group,
                onClick: () => {
                    if (selectedSidebarSection === 'visuals') {
                        toggleSidePanel();
                        return;
                    }
                    showSidePanel();
                    selectSidebarSection('visuals');
                    selectVisualsTab('areas');
                },
                active: selectedSidebarSection === 'visuals',
            },
        ],
        [
            handleSectionClick,
            selectedSidebarSection,
            t,
            showSidePanel,
            toggleSidePanel,
            selectSidebarSection,
            selectVisualsTab,
            databaseType,
        ]
    );

    const footerItems: SidebarItem[] = useMemo(
        () => [
            {
                title: 'Discord',
                icon: DiscordLogoIcon,
                onClick: () =>
                    window.open('https://discord.gg/QeFwyWSKwC', '_blank'),
                active: false,
            },
            {
                title: 'Twitter',
                icon: TwitterLogoIcon,
                onClick: () =>
                    window.open(
                        'https://x.com/intent/follow?screen_name=jonathanfishner',
                        '_blank'
                    ),
                active: false,
            },
            {
                title: 'Docs',
                icon: BookOpen,
                onClick: () => window.open('https://docs.chartdb.io', '_blank'),
                active: false,
            },
        ],
        []
    );

    return (
        <Sidebar
            side="left"
            collapsible="icon-extended"
            variant="sidebar"
            className="relative h-full"
        >
            {!isDesktop ? (
                <SidebarHeader>
                    <a
                        href="https://chartdb.io"
                        className="cursor-pointer"
                        rel="noreferrer"
                    >
                        <img
                            src={
                                effectiveTheme === 'light'
                                    ? ChartDBLogo
                                    : ChartDBDarkLogo
                            }
                            alt="chartDB"
                            className="h-4 max-w-fit"
                        />
                    </a>
                </SidebarHeader>
            ) : null}
            <SidebarContent>
                <SidebarGroup>
                    {/* <SidebarGroupLabel /> */}
                    <SidebarGroupContent>
                        <SidebarMenu>
                            {diagramItems.map((item) => (
                                <SidebarMenuItem key={item.title}>
                                    <SidebarMenuButton
                                        className="justify-center space-y-0.5 !px-0 hover:bg-gray-200 data-[active=true]:bg-gray-100 data-[active=true]:text-pink-600 data-[active=true]:hover:bg-pink-100 dark:hover:bg-gray-800 dark:data-[active=true]:bg-gray-900 dark:data-[active=true]:text-pink-400 dark:data-[active=true]:hover:bg-pink-950"
                                        isActive={item.active}
                                        asChild
                                    >
                                        <button onClick={item.onClick}>
                                            <item.icon />
                                            <span>
                                                {item.title
                                                    .split(' ')
                                                    .map((word, index) => (
                                                        <div key={index}>
                                                            {word}
                                                        </div>
                                                    ))}
                                            </span>
                                        </button>
                                    </SidebarMenuButton>
                                </SidebarMenuItem>
                            ))}
                        </SidebarMenu>
                        <Separator className="my-2" />
                        <SidebarMenu>
                            {baseItems.map((item) => (
                                <SidebarMenuItem key={item.title}>
                                    <SidebarMenuButton
                                        className="justify-center space-y-0.5 !px-0 hover:bg-gray-200 data-[active=true]:bg-gray-100 data-[active=true]:text-pink-600 data-[active=true]:hover:bg-pink-100 dark:hover:bg-gray-800 dark:data-[active=true]:bg-gray-900 dark:data-[active=true]:text-pink-400 dark:data-[active=true]:hover:bg-pink-950"
                                        isActive={item.active}
                                        asChild
                                    >
                                        <button onClick={item.onClick}>
                                            <item.icon />
                                            <span>
                                                {item.title
                                                    .split(' ')
                                                    .map((word, index) => (
                                                        <div key={index}>
                                                            {word}
                                                        </div>
                                                    ))}
                                            </span>
                                        </button>
                                    </SidebarMenuButton>
                                </SidebarMenuItem>
                            ))}
                        </SidebarMenu>
                    </SidebarGroupContent>
                </SidebarGroup>
            </SidebarContent>

            <SidebarFooter>
                <SidebarMenu>
                    {footerItems.map((item) => (
                        <SidebarMenuItem key={item.title}>
                            {item.badge && (
                                <span className="absolute -right-1 -top-1 rounded-full bg-pink-500 px-[3px] py-px text-[8px] font-semibold text-white">
                                    {item.badge}
                                </span>
                            )}
                            <SidebarMenuButton
                                className="justify-center space-y-0.5 !px-0 hover:bg-gray-200 data-[active=true]:bg-gray-100 data-[active=true]:text-pink-600 data-[active=true]:hover:bg-pink-100 dark:hover:bg-gray-800 dark:data-[active=true]:bg-gray-900 dark:data-[active=true]:text-pink-400 dark:data-[active=true]:hover:bg-pink-950"
                                isActive={item.active}
                                asChild
                            >
                                <button onClick={item.onClick}>
                                    <item.icon />
                                    <span>{item.title}</span>
                                </button>
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                    ))}
                </SidebarMenu>
            </SidebarFooter>
        </Sidebar>
    );
};
