// ============================================================
//  Simple in-memory rate limiter — brute-force protection for
//  PIN / approval-code verification (5 and 6 digit numeric
//  secrets have a small keyspace, so repeated-guess protection
//  matters even though every attempt is already hashed+checked
//  server-side).
//
//  In-memory and per-process by design: this backend runs as a
//  single Bun process per deployment, so a Map is sufficient and
//  avoids adding a Redis dependency for this. If the backend is
//  ever horizontally scaled, this must move to a shared store.
// ============================================================

type Entry = { count: number; resetAt: number };

const attempts = new Map<string, Entry>();

/** Thrown when a key is over its limit; controllers map it to HTTP 429. */
export class RateLimitError extends Error {
    readonly status = 429;
}

export function checkRateLimit(key: string, maxAttempts: number, windowMs: number): void {
    const now = Date.now();
    const entry = attempts.get(key);

    if (!entry || now > entry.resetAt) {
        attempts.set(key, { count: 1, resetAt: now + windowMs });
        return;
    }

    entry.count++;
    if (entry.count > maxAttempts) {
        const waitSec = Math.ceil((entry.resetAt - now) / 1000);
        throw new RateLimitError(`Demasiados intentos. Intenta de nuevo en ${waitSec}s.`);
    }
}

export function resetRateLimit(key: string): void {
    attempts.delete(key);
}

/** Undo one counted attempt (call after a successful check so only failures accumulate). */
export function undoAttempt(key: string): void {
    const entry = attempts.get(key);
    if (entry && entry.count > 0) entry.count--;
}
