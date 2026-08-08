/**
 * Local Embeddings — F3IL v3
 *
 * Turns text into meaning-coordinates (384-dim vectors) using a small
 * sentence-embedding model (all-MiniLM-L6-v2) running entirely on this
 * machine via transformers.js (ONNX/WASM — no Python, no API calls).
 *
 * Privacy property: the model downloads ONCE from the Hugging Face CDN on
 * first use (~25 MB, cached locally), after which everything — including
 * the meaning-extraction itself — runs offline. Memory content never
 * leaves this machine.
 *
 * Degradation property: if the model can't load (e.g. first run while
 * offline), embedText() returns null and callers fall back to keyword
 * search. Memory storage never blocks on the model.
 *
 * The vectors are an INDEX, never the record: the canonical, human-readable
 * memory text stays in the `content` column. Deleting the embedding column
 * loses nothing but recall quality.
 */

const MODEL_ID = 'Xenova/all-MiniLM-L6-v2';

let _pipelinePromise = null;   // lazy singleton
let _loadFailedOnce = false;
let _testEmbedder = null;      // injected in tests

async function _getPipeline() {
    if (_testEmbedder) return null; // test mode bypasses the real model
    if (!_pipelinePromise) {
        _pipelinePromise = (async () => {
            const { pipeline, env } = await import('@xenova/transformers');
            if (process.env.F3IL_CACHE_DIR) {
                // Container mode: cache the model on the bind-mounted host
                // folder so the one-time download survives container restarts
                // and stays inspectable on the user's disk.
                env.cacheDir = process.env.F3IL_CACHE_DIR;
            }
            console.error(`🧭 Loading local embedding model (${MODEL_ID}) — first run downloads ~25 MB, then cached...`);
            const p = await pipeline('feature-extraction', MODEL_ID);
            console.error('🧭 Embedding model ready (local inference)');
            return p;
        })().catch((err) => {
            _pipelinePromise = null; // allow retry on a later call
            if (!_loadFailedOnce) {
                _loadFailedOnce = true;
                console.error(`⚠️  Embedding model unavailable (${err.message}). ` +
                    `Falling back to keyword-only recall. Semantic recall will ` +
                    `activate automatically once the model can download.`);
            }
            throw err;
        });
    }
    return _pipelinePromise;
}

/**
 * Embed text → plain number[] (L2-normalized), or null if the model is
 * unavailable. Never throws.
 */
export async function embedText(text) {
    if (_testEmbedder) {
        return _testEmbedder(text);
    }
    try {
        const pipe = await _getPipeline();
        const out = await pipe(text, { pooling: 'mean', normalize: true });
        return Array.from(out.data);
    } catch {
        return null;
    }
}

/**
 * Cosine similarity. Inputs are normalized, so this is a dot product.
 * Returns 0 when either vector is missing.
 */
export function cosineSim(a, b) {
    if (!a || !b || a.length !== b.length) return 0;
    let dot = 0;
    for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
    return dot;
}

/** Test hook: inject a deterministic embedder (text) => number[] | null. */
export function _setEmbedderForTesting(fn) {
    _testEmbedder = fn;
}
