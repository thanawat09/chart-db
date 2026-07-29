import { describe, expect, it } from 'vitest';
import { SessionAuth } from './session-auth.mjs';

describe('SessionAuth', () => {
    it('creates and verifies a session without exposing the password', () => {
        const auth = new SessionAuth('secret', () => 0);
        const login = auth.login('secret', '127.0.0.1');

        expect(login.ok).toBe(true);
        expect(login.token).not.toContain('secret');
        expect(auth.verify(`Bearer ${login.token}`)).toBe(true);
    });

    it('expires sessions after twelve hours', () => {
        let now = 0;
        const auth = new SessionAuth('secret', () => now);
        const login = auth.login('secret', '127.0.0.1');
        now = 12 * 60 * 60 * 1000;

        expect(auth.verify(`Bearer ${login.token}`)).toBe(false);
    });

    it('blocks an address after five failed attempts', () => {
        const auth = new SessionAuth('secret', () => 0);
        let result;

        for (let attempt = 0; attempt < 5; attempt += 1) {
            result = auth.login('wrong', '203.0.113.1');
        }

        expect(result.status).toBe(429);
        expect(auth.login('secret', '203.0.113.1').status).toBe(429);
        expect(auth.login('secret', '203.0.113.2').ok).toBe(true);
    });
});
