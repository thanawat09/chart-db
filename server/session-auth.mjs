import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const ATTEMPT_WINDOW_MS = 60_000;
const BLOCK_DURATION_MS = 60_000;
const MAX_FAILED_ATTEMPTS = 5;
const SESSION_DURATION_MS = 12 * 60 * 60 * 1000;

const digest = (value) => createHash('sha256').update(value).digest();

export class SessionAuth {
    constructor(password, now = () => Date.now()) {
        this.passwordDigest = digest(password);
        this.now = now;
        this.failures = new Map();
        this.sessions = new Map();
    }

    login(password, address) {
        const now = this.now();
        const failure = this.failures.get(address) ?? {
            attempts: [],
            blockedUntil: 0,
        };

        if (failure.blockedUntil > now) {
            return { ok: false, status: 429 };
        }

        failure.attempts = failure.attempts.filter(
            (attempt) => now - attempt < ATTEMPT_WINDOW_MS
        );

        const passwordMatches = timingSafeEqual(
            this.passwordDigest,
            digest(password)
        );
        if (!passwordMatches) {
            failure.attempts.push(now);
            if (failure.attempts.length >= MAX_FAILED_ATTEMPTS) {
                failure.blockedUntil = now + BLOCK_DURATION_MS;
            }
            this.failures.set(address, failure);
            return {
                ok: false,
                status: failure.blockedUntil > now ? 429 : 401,
            };
        }

        this.failures.delete(address);
        const token = randomBytes(32).toString('base64url');
        this.sessions.set(token, now + SESSION_DURATION_MS);
        return {
            ok: true,
            status: 200,
            token,
            expiresAt: new Date(now + SESSION_DURATION_MS).toISOString(),
        };
    }

    verify(authorizationHeader) {
        const token = authorizationHeader?.startsWith('Bearer ')
            ? authorizationHeader.slice('Bearer '.length)
            : '';
        const expiresAt = this.sessions.get(token);

        if (!expiresAt || expiresAt <= this.now()) {
            if (token) {
                this.sessions.delete(token);
            }
            return false;
        }

        return true;
    }
}
