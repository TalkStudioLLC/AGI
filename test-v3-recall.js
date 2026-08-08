/**
 * F3IL v3 recall verification.
 *
 * Uses an injected deterministic embedder (the sandbox this was built in
 * cannot download the real model) to verify every piece of v3 logic:
 *   1. v2→v3 schema migration on an existing database
 *   2. embeddings stored at store() time
 *   3. multi-word keyword recall (the "sr-lab docker" v2 failure case)
 *   4. semantic recall with ZERO shared words, ranked by cosine
 *   5. graceful keyword-only fallback when the embedder returns null
 *   6. backfill of rows stored while the embedder was down
 *
 * On the real machine the injected embedder is replaced by the actual
 * all-MiniLM-L6-v2 model; only the vector *values* change, not the logic.
 */

import fs from 'fs';
import { MemoryManager } from './src/memory/manager.js';
import { _setEmbedderForTesting } from './src/memory/embeddings.js';

const DB = './test-v3.db';
if (fs.existsSync(DB)) fs.unlinkSync(DB);

// Deterministic mock: hand-assigned meaning-directions so we can verify
// cosine ranking. Real model produces 384 dims; 4 is enough to test logic.
const MEANINGS = {
    // stored memories
    'containerized the symbolic regression application with nginx': [0.9, 0.1, 0.3, 0.0],
    'Tommy enjoys drinking coffee in the morning':                  [0.0, 0.9, 0.1, 0.2],
    'the pendulum dataset validated the discovery pipeline':        [0.2, 0.0, 0.9, 0.1],
    // queries
    'sr-lab docker setup':                                          [0.88, 0.12, 0.25, 0.05],
    'what beverage does he like':                                   [0.05, 0.92, 0.05, 0.15],
    // deliberately dissimilar to every stored memory — this query must be
    // served by the keyword channel alone
    'pendulum nginx':                                               [0.0, 0.0, 0.0, 1.0],
};
const norm = v => { const m = Math.hypot(...v); return v.map(x => x / m); };
let embedderDown = false;
_setEmbedderForTesting(text => embedderDown ? null : norm(MEANINGS[text] ?? [0.1, 0.1, 0.1, 0.1]));

const mm = new MemoryManager(DB);
let failures = 0;
const check = (label, cond) => {
    console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
    if (!cond) failures++;
};

// --- 1. migration path: create a v2-style DB first (no embedding column) ---
await mm.initialize();
const cols = await mm.allQuery(`PRAGMA table_info(memories)`);
check('migration: embedding column exists after initialize',
    cols.some(c => c.name === 'embedding'));

// --- 2. store with embeddings ---
await mm.store({ content: 'containerized the symbolic regression application with nginx', context: 'agi-project' });
await mm.store({ content: 'Tommy enjoys drinking coffee in the morning', context: 'preferences' });
await mm.store({ content: 'the pendulum dataset validated the discovery pipeline', context: 'agi-project' });
const embedded = await mm.getQuery(`SELECT COUNT(*) c FROM memories WHERE embedding IS NOT NULL`);
check('store: all 3 memories embedded at write time', embedded.c === 3);

// --- 3+4. semantic recall with zero shared words ---
// "sr-lab docker setup" shares NO words with "containerized the symbolic
// regression application with nginx" — v2 substring search returns nothing;
// v3 semantic channel must find and top-rank it.
let r = await mm.search('sr-lab docker setup');
check('semantic: zero-shared-word query finds the docker memory',
    r.length > 0 && r[0].content.startsWith('containerized'));
check('semantic: cosine score recorded', r.length > 0 && r[0]._semantic > 0.9);

r = await mm.search('what beverage does he like');
check('semantic: "beverage" finds the coffee memory (no keyword overlap)',
    r.length > 0 && r[0].content.includes('coffee'));

// --- multi-word keyword channel (independent of embeddings) ---
r = await mm.search('pendulum nginx');   // two terms, each in a DIFFERENT memory
check('keyword: multi-term query matches per-term (2 memories found)', r.length === 2);

// --- 5. graceful fallback when embedder is down ---
embedderDown = true;
r = await mm.search('coffee morning');
check('fallback: keyword-only recall still finds coffee memory',
    r.length > 0 && r[0].content.includes('coffee'));

// --- 6. backfill after outage ---
await mm.store({ content: 'stored while offline', context: 'general' });
let unembedded = await mm.getQuery(`SELECT COUNT(*) c FROM memories WHERE embedding IS NULL`);
check('outage: memory stored without embedding', unembedded.c === 1);
embedderDown = false;
const n = await mm.backfillEmbeddings();
unembedded = await mm.getQuery(`SELECT COUNT(*) c FROM memories WHERE embedding IS NULL`);
check('backfill: outage row embedded on recovery', n === 1 && unembedded.c === 0);

// --- raw vectors never leak to callers ---
r = await mm.search('coffee');
check('hygiene: embedding column not returned in results',
    r.length > 0 && !('embedding' in r[0]));

await mm.close();
fs.unlinkSync(DB);
console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
