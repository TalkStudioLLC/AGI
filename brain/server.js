/**
 * F3!L brain view — read-only aggregator.
 *
 * Serves the live brain view and the data behind it on ONE origin, so the page
 * needs no CORS headers from the memory bridge (which ships none, and is baked
 * into the container image — adding them would mean a 1.4GB rebuild).
 *
 * Two data paths, deliberately separated:
 *
 *   HTTP  -> the bridge on :4300 for anything live (health, metrics, activity,
 *            recall). This is the service's own contract.
 *   SQLite -> memory.db opened READ-ONLY for the aggregate composition the HTTP
 *            API does not expose (type split, context spread, embedding
 *            coverage, corruption count). Opened per request and closed, so no
 *            handle is held against the file F3!L is writing.
 *
 * Side-effect rule, from reading memory-http.js: /recall and /remember both call
 * recordActivity(), so probing recall APPENDS to the activity trace this page
 * displays. Polling it would make the dashboard its own loudest contributor.
 * Hence: /api/state and /api/activity are safe to poll; /api/recall is wired to
 * an explicit user action only, and says so in the UI.
 *
 * Nothing here writes. There is no route that can.
 *
 * Run:  node brain/server.js
 *       F3IL_DB_PATH=/path/to/memory.db PORT=4310 node brain/server.js
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const HERE = import.meta.dirname;

const PORT = parseInt(process.env.PORT || '4310', 10);
const BRIDGE = process.env.F3IL_BRIDGE_URL || 'http://localhost:4300';

/**
 * memory.db lives at the repo root. Walk up to find it rather than assuming
 * `../`: run from a git worktree (.claude/worktrees/<name>/brain) and the real
 * file is several levels further up, in the main checkout.
 */
function findDb() {
  if (process.env.F3IL_DB_PATH) return process.env.F3IL_DB_PATH;
  let dir = HERE;
  for (let i = 0; i < 8; i++) {
    const candidate = path.join(dir, 'memory.db');
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.join(HERE, '..', 'memory.db');
}
const DB_PATH = findDb();

const send = (res, code, body, type = 'application/json') => {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
};

async function bridge(pathname) {
  const r = await fetch(`${BRIDGE}${pathname}`, { signal: AbortSignal.timeout(20000) });
  const text = await r.text();
  if (!r.ok) throw new Error(`bridge ${pathname} -> ${r.status}`);
  return { text, json: () => JSON.parse(text) };
}

/** Parse the Prometheus exposition text into {name, labels, value} rows. */
function parsePrometheus(text) {
  const out = [];
  for (const line of text.split('\n')) {
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^([a-zA-Z_:][a-zA-Z0-9_:]*)(\{[^}]*\})?\s+(.+)$/);
    if (!m) continue;
    const labels = {};
    if (m[2]) {
      for (const pair of m[2].slice(1, -1).split(',')) {
        const kv = pair.match(/^([a-zA-Z_][a-zA-Z0-9_]*)="(.*)"$/);
        if (kv) labels[kv[1]] = kv[2];
      }
    }
    const value = Number(m[3]);
    if (Number.isFinite(value)) out.push({ name: m[1], labels, value });
  }
  return out;
}

/**
 * Aggregate composition, read-only. Everything the HTTP API cannot answer.
 * `damaged` counts the reflections that were stored as "[object Object]" before
 * src/integration/layer.js started serializing them — unrecoverable rows, so the
 * view reports them as damage rather than pretending the semantic tier is whole.
 */
function composition() {
  if (!fs.existsSync(DB_PATH)) return { available: false, reason: `no memory.db at ${DB_PATH}` };
  let db;
  try {
    db = new DatabaseSync(DB_PATH, { readOnly: true });
    const all = (sql) => db.prepare(sql).all();
    const one = (sql) => db.prepare(sql).get();
    return {
      available: true,
      byType: all(`SELECT type, COUNT(*) n FROM memories GROUP BY type ORDER BY n DESC`),
      byContext: all(`SELECT COALESCE(context,'(none)') context, COUNT(*) n
                      FROM memories GROUP BY context ORDER BY n DESC LIMIT 10`),
      coverage: one(`SELECT SUM(embedding IS NOT NULL) embedded, COUNT(*) total FROM memories`),
      damaged: one(`SELECT COUNT(*) n FROM memories WHERE content LIKE '%[object Object]%'`).n,
      gradedConfidence: one(`SELECT SUM(confidence < 1) graded, COUNT(*) total FROM memories`),
      gradedEmotion: one(`SELECT SUM(emotional_weight <> 0.4) graded, COUNT(*) total FROM memories`),
      span: one(`SELECT MIN(timestamp) first, MAX(timestamp) last FROM memories`),
      sideTables: {
        reasoning_history: one(`SELECT COUNT(*) n FROM reasoning_history`).n,
        relationships: one(`SELECT COUNT(*) n FROM relationships`).n,
      },
    };
  } catch (err) {
    return { available: false, reason: String(err.message || err) };
  } finally {
    try { db?.close(); } catch { /* already closed */ }
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (req.method !== 'GET') return send(res, 405, { error: 'read-only server' });

  try {
    if (url.pathname === '/' || url.pathname === '/index.html') {
      return send(res, 200, fs.readFileSync(path.join(HERE, 'index.html'), 'utf8'),
        'text/html; charset=utf-8');
    }

    // Safe to poll: neither endpoint records activity.
    if (url.pathname === '/api/state') {
      const [health, metrics] = await Promise.all([bridge('/health'), bridge('/metrics')]);
      return send(res, 200, {
        ok: true,
        at: new Date().toISOString(),
        health: health.json(),
        metrics: parsePrometheus(metrics.text),
        composition: composition(),
      });
    }

    if (url.pathname === '/api/activity') {
      return send(res, 200, (await bridge('/activity')).json());
    }

    // NOT safe to poll — appends to the activity trace. User-triggered only.
    if (url.pathname === '/api/recall') {
      const q = url.searchParams.get('query');
      if (!q) return send(res, 400, { error: 'query is required' });
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '8', 10) || 8, 25);
      const r = await bridge(`/recall?query=${encodeURIComponent(q)}&limit=${limit}`);
      return send(res, 200, r.json());
    }

    return send(res, 404, { error: 'not found' });
  } catch (err) {
    return send(res, 502, { error: String(err.message || err) });
  }
});

server.listen(PORT, () => {
  console.log(`F3!L brain view on http://localhost:${PORT}`);
  console.log(`  bridge : ${BRIDGE}`);
  console.log(`  db     : ${DB_PATH} (read-only)`);
});
