import { describe, it, expect } from 'vitest';
import {
    normalizeExampleValue,
    encodeFieldNote,
    decodeFieldNote,
} from '../field-note';

describe('field-note', () => {
    it('normalizes whitespace in example', () => {
        expect(normalizeExampleValue('a\nb\tc')).toBe('a b c');
        expect(normalizeExampleValue('  ')).toBeNull();
        expect(normalizeExampleValue(null)).toBeNull();
    });

    it('encodes comments + example inline', () => {
        expect(encodeFieldNote('ชื่อพนักงาน', 'สมชาย')).toBe(
            'ชื่อพนักงาน @example: สมชาย'
        );
        expect(encodeFieldNote(null, 'สมชาย')).toBe('@example: สมชาย');
        expect(encodeFieldNote('ชื่อพนักงาน', null)).toBe('ชื่อพนักงาน');
        expect(encodeFieldNote(null, null)).toBeUndefined();
        expect(encodeFieldNote('', '')).toBeUndefined();
    });

    it('decodes marker from end of note', () => {
        expect(decodeFieldNote('ชื่อพนักงาน @example: สมชาย')).toEqual({
            comments: 'ชื่อพนักงาน',
            example: 'สมชาย',
        });
        expect(decodeFieldNote('@example: สมชาย')).toEqual({
            example: 'สมชาย',
        });
        expect(decodeFieldNote('ชื่อพนักงาน')).toEqual({
            comments: 'ชื่อพนักงาน',
        });
        expect(decodeFieldNote(undefined)).toEqual({});
    });

    it('round-trips encode → decode', () => {
        const note = encodeFieldNote('cmt', 'ex');
        expect(decodeFieldNote(note)).toEqual({
            comments: 'cmt',
            example: 'ex',
        });
    });
});
