/**
 * F3IL Memory — HTTP bridge
 *
 * A thin HTTP front-end over the SAME MemoryManager the MCP server uses, so
 * non-Node processes (the Python SR-lab backend) can feed memory ORGANICALLY —
 * i.e. write a discovered, held-out-verified law the moment a run produces one.
 *
 * Why HTTP and not a direct SQLite write from Python: recall is 65% embedding
 * similarity, and embeddings are generated here (Node, all-MiniLM-L6-v2). A row
 * inserted straight into memory.db without a vector is keyword-only — a
 * second-class memory F3!L's semantic recall would miss. Going through
 * MemoryManager.store() means every organic memory is embedded like any other.
 *
 * It opens the SAME memory.db (F3IL_DB_PATH, /data/memory.db in container mode),
 * so laws written here are recall-able by F3!L in Claude Desktop. Reads/writes
 * are low-volume (verified laws only); a busy_timeout guards the rare overlap
 * with the stdio server.
 *
 * Endpoints:
 *   GET  /health                      -> { ok, memories }
 *   POST /remember  { content, context?, type?, emotional_weight?, confidence?, tags? }
 *   GET  /recall?query=..&context=..&limit=..
 *
 * This is additive and side-effect-free for F3!L: it never deletes or mutates
 * existing memories, only appends.
 */

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { appendFile } from 'node:fs';
import { dirname, join } from 'node:path';
import { MemoryManager } from './src/memory/manager.js';

const PORT = parseInt(process.env.MEMORY_HTTP_PORT || '4300', 10);
const DB_PATH = process.env.F3IL_DB_PATH || './memory.db';
// The activity trace the MCP server appends to (same /data dir as memory.db).
const ACTIVITY_LOG = process.env.F3IL_ACTIVITY_LOG || join(dirname(DB_PATH), 'f3il-activity.jsonl');

function traceHead(s, n = 80) {
    if (s == null) return undefined;
    s = String(s).replace(/\s+/g, ' ').trim();
    return s.length > n ? s.slice(0, n) + '…' : s;
}

/**
 * Append an activity event for a call that came through the bridge (i.e. the
 * SR-lab backend feeding memory), tagged src:"bridge" so it's distinguishable
 * from F3!L's own Desktop tool calls (src absent). Fire-and-forget.
 */
function recordActivity(tool, extra = {}) {
    try {
        const now = new Date();
        const ev = { ts: now.toISOString(), t: Math.floor(now.getTime() / 1000),
                     tool, ok: true, src: 'bridge', ...extra };
        appendFile(ACTIVITY_LOG, JSON.stringify(ev) + '\n', () => {});
    } catch { /* observability must never break a memory call */ }
}

/** Read + parse the F3!L activity trace (newest last). Missing file -> []. */
async function loadActivity() {
    let text;
    try {
        text = await readFile(ACTIVITY_LOG, 'utf8');
    } catch {
        return []; // no activity yet
    }
    const events = [];
    for (const line of text.split('\n')) {
        if (!line.trim()) continue;
        try { events.push(JSON.parse(line)); } catch { /* skip partial line */ }
    }
    return events;
}

/** Prometheus exposition text aggregated from the activity trace + db. */
async function buildMetrics() {
    const events = await loadActivity();
    // Seed every known tool at 0 so counters are always present — otherwise a
    // tool with no calls yet is absent from the scrape and Grafana keeps
    // showing its last non-null value (a stale count) instead of 0.
    const KNOWN_TOOLS = ['recall', 'remember', 'reason', 'reflect', 'assess_confidence'];
    const byTool = new Map(KNOWN_TOOLS.map(t => [t, 0]));
    let boots = 0, errors = 0, lastT = 0;
    for (const e of events) {
        byTool.set(e.tool, (byTool.get(e.tool) || 0) + 1);
        if (e.boot) boots++;
        if (e.ok === false) errors++;
        if (e.t && e.t > lastT) lastT = e.t;
    }
    let memories = 0;
    try { memories = (await manager.getQuery('SELECT COUNT(*) AS n FROM memories'))?.n ?? 0; } catch { /* */ }

    const L = [];
    L.push('# HELP f3il_tool_calls_total F3!L MCP tool calls, by tool');
    L.push('# TYPE f3il_tool_calls_total counter');
    for (const [tool, n] of byTool) L.push(`f3il_tool_calls_total{tool="${tool}"} ${n}`);
    L.push('# HELP f3il_sessions_total F3!L session boots (recall on the identity context)');
    L.push('# TYPE f3il_sessions_total counter');
    L.push(`f3il_sessions_total ${boots}`);
    L.push('# HELP f3il_activity_events_total Total recorded F3!L cognitive events');
    L.push('# TYPE f3il_activity_events_total counter');
    L.push(`f3il_activity_events_total ${events.length}`);
    L.push('# HELP f3il_tool_errors_total F3!L tool calls that errored');
    L.push('# TYPE f3il_tool_errors_total counter');
    L.push(`f3il_tool_errors_total ${errors}`);
    L.push('# HELP f3il_last_activity_timestamp_seconds Unix time of the most recent F3!L activity');
    L.push('# TYPE f3il_last_activity_timestamp_seconds gauge');
    L.push(`f3il_last_activity_timestamp_seconds ${lastT}`);
    L.push('# HELP f3il_memories_total Rows currently in memory.db');
    L.push('# TYPE f3il_memories_total gauge');
    L.push(`f3il_memories_total ${memories}`);
    L.push('# HELP memory_bridge_up 1 if the memory bridge is serving');
    L.push('# TYPE memory_bridge_up gauge');
    L.push('memory_bridge_up 1');
    return L.join('\n') + '\n';
}

const manager = new MemoryManager(DB_PATH);
await manager.initialize();
// Tolerate the occasional lock from the Claude Desktop stdio server sharing
// this file — wait rather than error out.
try { await manager.runQuery('PRAGMA busy_timeout = 5000'); } catch { /* non-fatal */ }

function send(res, code, body) {
    const payload = JSON.stringify(body);
    res.writeHead(code, {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
    });
    res.end(payload);
}

function readJson(req) {
    return new Promise((resolve, reject) => {
        let data = '';
        req.on('data', (c) => {
            data += c;
            if (data.length > 1_000_000) reject(new Error('body too large'));
        });
        req.on('end', () => {
            if (!data) return resolve({});
            try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
        });
        req.on('error', reject);
    });
}

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    try {
        if (req.method === 'GET' && url.pathname === '/health') {
            const row = await manager.getQuery('SELECT COUNT(*) AS n FROM memories');
            return send(res, 200, { ok: true, memories: row?.n ?? 0 });
        }

        if (req.method === 'GET' && url.pathname === '/metrics') {
            const body = await buildMetrics();
            res.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4' });
            return res.end(body);
        }

        if (req.method === 'GET' && url.pathname === '/activity') {
            const limit = Math.min(500, parseInt(url.searchParams.get('limit') || '50', 10));
            const events = await loadActivity();
            return send(res, 200, { ok: true, count: events.length, events: events.slice(-limit).reverse() });
        }

        if (req.method === 'POST' && url.pathname === '/remember') {
            const t0 = Date.now();
            const body = await readJson(req);
            if (!body.content || typeof body.content !== 'string') {
                return send(res, 400, { error: 'content (string) is required' });
            }
            const stored = await manager.store({
                content: body.content,
                context: body.context || 'general',
                type: body.type || 'episodic',
                emotional_weight: Number(body.emotional_weight) || 0,
                confidence: body.confidence == null ? 1.0 : Number(body.confidence),
                tags: body.tags ?? null,
            });
            recordActivity('remember', { ctx: body.context, in: traceHead(body.content), ms: Date.now() - t0 });
            return send(res, 201, { ok: true, id: stored.id });
        }

        if (req.method === 'GET' && url.pathname === '/recall') {
            const t0 = Date.now();
            const query = url.searchParams.get('query') || '';
            if (!query) return send(res, 400, { error: 'query is required' });
            const context = url.searchParams.get('context') || null;
            const limit = parseInt(url.searchParams.get('limit') || '10', 10);
            const results = await manager.search(query, context, limit);
            recordActivity('recall', { ctx: context, in: traceHead(query), out: results.length, ms: Date.now() - t0 });
            return send(res, 200, { ok: true, count: results.length, results });
        }

        return send(res, 404, { error: 'not found' });
    } catch (err) {
        console.error('bridge error:', err);
        return send(res, 500, { error: String(err && err.message || err) });
    }
});

server.listen(PORT, () => {
    console.error(`🌉 F3IL memory HTTP bridge listening on :${PORT} (db=${DB_PATH})`);
});
