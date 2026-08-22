const EXAMPLE_MARKER_RE = /\s*@example:\s*(.*)$/;

export function normalizeExampleValue(
    value: string | null | undefined
): string | null {
    if (value == null) return null;
    const normalized = value.replace(/\s+/g, ' ').trim();
    return normalized.length > 0 ? normalized : null;
}

export function encodeFieldNote(
    comments: string | null | undefined,
    example: string | null | undefined
): string | undefined {
    const commentPart = comments?.trim() ?? '';
    const examplePart = normalizeExampleValue(example) ?? '';
    if (!commentPart && !examplePart) return undefined;
    if (!examplePart) return commentPart;
    if (!commentPart) return `@example: ${examplePart}`;
    return `${commentPart} @example: ${examplePart}`;
}

export function decodeFieldNote(
    note: string | null | undefined
): { comments?: string; example?: string } {
    if (note == null || note === '') return {};
    const match = note.match(EXAMPLE_MARKER_RE);
    if (!match || match.index === undefined) {
        return { comments: note };
    }
    const example = match[1]?.trim() || undefined;
    const comments = note.slice(0, match.index).trim() || undefined;
    return {
        ...(comments ? { comments } : {}),
        ...(example ? { example } : {}),
    };
}
