import { z } from 'zod';

export const textAlignValues = ['left', 'center', 'right'] as const;
export type TextAlign = (typeof textAlignValues)[number];

export interface Text {
    id: string;
    content: string;
    x: number;
    y: number;
    width: number;
    height: number;
    textColor: string;
    fontSize: number;
    textAlign: TextAlign;
    parentAreaId?: string | null;
    order?: number;
}

export const textSchema: z.ZodType<Text> = z.object({
    id: z.string(),
    content: z.string(),
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
    textColor: z.string(),
    fontSize: z.number(),
    textAlign: z.enum(textAlignValues),
    parentAreaId: z.string().or(z.null()).optional(),
    order: z.number().optional(),
});

export const createDefaultText = (partial: Partial<Text> & { id: string }): Text => ({
    content: '',
    x: 0,
    y: 0,
    width: 200,
    height: 80,
    textColor: '#111827',
    fontSize: 16,
    textAlign: 'left',
    parentAreaId: null,
    ...partial,
});
