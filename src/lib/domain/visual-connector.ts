import { z } from 'zod';

export const visualConnectorEndpointTypes = ['text', 'note', 'area'] as const;
export type VisualConnectorEndpointType =
    (typeof visualConnectorEndpointTypes)[number];

export const VISUAL_CONNECTOR_HANDLE_IDS = [
    'visual-top',
    'visual-right',
    'visual-bottom',
    'visual-left',
] as const;

export type VisualConnectorHandleId =
    (typeof VISUAL_CONNECTOR_HANDLE_IDS)[number];

export const visualConnectorStrokeStyles = [
    'solid',
    'dashed',
    'dotted',
] as const;
export type VisualConnectorStrokeStyle =
    (typeof visualConnectorStrokeStyles)[number];

export const visualConnectorArrowDirections = [
    'none',
    'forward',
    'both',
] as const;
export type VisualConnectorArrowDirection =
    (typeof visualConnectorArrowDirections)[number];

export const DEFAULT_VISUAL_CONNECTOR_COLOR = '#94a3b8';

export interface VisualConnector {
    id: string;
    sourceType: VisualConnectorEndpointType;
    sourceId: string;
    targetType: VisualConnectorEndpointType;
    targetId: string;
    sourceHandle?: string | null;
    targetHandle?: string | null;
    strokeColor?: string | null;
    strokeStyle?: VisualConnectorStrokeStyle | null;
    arrowDirection?: VisualConnectorArrowDirection | null;
}

export const visualConnectorSchema: z.ZodType<VisualConnector> = z.object({
    id: z.string(),
    sourceType: z.enum(visualConnectorEndpointTypes),
    sourceId: z.string(),
    targetType: z.enum(visualConnectorEndpointTypes),
    targetId: z.string(),
    sourceHandle: z.string().or(z.null()).optional(),
    targetHandle: z.string().or(z.null()).optional(),
    strokeColor: z.string().or(z.null()).optional(),
    strokeStyle: z.enum(visualConnectorStrokeStyles).or(z.null()).optional(),
    arrowDirection: z
        .enum(visualConnectorArrowDirections)
        .or(z.null())
        .optional(),
});

export const isVisualConnectorEndpointType = (
    value: string
): value is VisualConnectorEndpointType =>
    (visualConnectorEndpointTypes as readonly string[]).includes(value);

export const canConnectVisualEndpoints = (
    sourceType: string,
    sourceId: string,
    targetType: string,
    targetId: string
): boolean => {
    if (sourceId === targetId) {
        return false;
    }

    return (
        isVisualConnectorEndpointType(sourceType) &&
        isVisualConnectorEndpointType(targetType)
    );
};

export const getConnectorIdsForEndpoint = (
    connectors: VisualConnector[],
    type: VisualConnectorEndpointType,
    id: string
): string[] =>
    connectors
        .filter(
            (connector) =>
                (connector.sourceType === type &&
                    connector.sourceId === id) ||
                (connector.targetType === type && connector.targetId === id)
        )
        .map((connector) => connector.id);

export const getVisualConnectorStrokeDasharray = (
    strokeStyle?: VisualConnectorStrokeStyle | null
): string | undefined => {
    switch (strokeStyle) {
        case 'dashed':
            return '8 6';
        case 'dotted':
            return '2 4';
        case 'solid':
        default:
            return undefined;
    }
};
