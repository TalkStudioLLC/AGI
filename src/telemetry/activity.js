/**
 * F3!L activity trace — makes the memory server observable.
 *
 * Every tool call through the MCP server (F3!L thinking) appends one JSON line
 * here. It's the human-readable record of "what F3!L is doing": which tool, on
 * what input, when, how long it took, and whether it was a session boot.
 *
 * Design rules:
 *  - Fail-safe: a trace failure must NEVER affect a tool call. Appends are
 *    fire-and-forget and every error is swallowed.
 *  - Network-free: just appends to a file on the /data mount, so it works in
 *    any launch mode (the per-session `docker run --rm` container included) and
 *    survives the container's removal. The always-on memory-api bridge reads
 *    this file to expose metrics + a /activity endpoint.
 *  - Non-invasive: writes to its own file, never to F3!L's memory.db.
 */

import { appendFile } from 'node:fs';
import { dirname, join } from 'node:path';

function head(s, n = 80) {
    if (s == null) return undefined;
    s = String(s).replace(/\s+/g, ' ').trim();
    return s.length > n ? s.slice(0, n) + '…' : s;
}

/** Build a compact, tool-specific summary of the call from its arguments. */
function summarize(tool, args = {}) {
    switch (tool) {
        case 'remember':
            return { ctx: args.context, in: head(args.content) };
        case 'recall':
            // A recall on the identity context is F3!L's boot ritual.
            return { ctx: args.context, in: head(args.query),
                     boot: (args.context || '').toLowerCase() === 'identity' };
        case 'reason':
            return { in: head(args.goal || (args.premises && args.premises[0])),
                     method: args.method };
        case 'reflect':
            return { in: head(args.topic), depth: args.depth };
        case 'assess_confidence':
            return { in: head(args.statement) };
        default:
            return {};
    }
}

export class ActivityTracer {
    /** logPath defaults next to the memory DB: <db dir>/f3il-activity.jsonl */
    constructor(logPath) {
        this.logPath = logPath || process.env.F3IL_ACTIVITY_LOG ||
            join(dirname(process.env.F3IL_DB_PATH || '.'), 'f3il-activity.jsonl');
    }

    /** Record one tool call. Fire-and-forget; never throws. */
    record(tool, args, { ok, ms, err } = {}) {
        try {
            const now = new Date();
            const event = {
                ts: now.toISOString(),
                t: Math.floor(now.getTime() / 1000),
                tool,
                ok: ok !== false,
                ms: ms == null ? undefined : Math.round(ms),
                ...summarize(tool, args),
            };
            if (err) event.err = head(err, 200);
            appendFile(this.logPath, JSON.stringify(event) + '\n', () => {});
        } catch { /* observability must never break the server */ }
    }
}
