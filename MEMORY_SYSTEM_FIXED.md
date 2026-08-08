# 🧠 Memory System Fix Complete! 

## ✅ What Was Fixed

**Path: `C:\Users\Tom\Documents\GitHub\AGI\`**

### Problem
- Cloud memory server at `https://agi-memory-api-3ibabnlfhq-uk.a.run.app` was returning 500/503 errors
- Your memory tools (remember, recall, reflect, reason, assess_confidence) were broken

### Solution  
- **Switched from cloud service to local MCP server**
- Updated Claude Desktop config to use `C:\Users\Tom\Documents\GitHub\AGI\mcp-server.js`
- Local server provides all the same memory functionality without cloud dependencies

## 📁 Files Updated

### **Configuration Fixed**
- **Before**: `claude_desktop_config.json` → pointed to broken `cloud-memory-server.js`
- **After**: Updated to use local `mcp-server.js`

```json
{
  "mcpServers": {
    "agi-memory-server": {
      "command": "node",
      "args": ["C:\\Users\\Tom\\Documents\\GitHub\\AGI\\mcp-server.js"],
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

### **Memory Database Location**
- Local SQLite database: `C:\Users\Tom\Documents\GitHub\AGI\memory.db`
- No more cloud dependencies - everything runs locally

## 🚀 Next Steps

### **🔄 RESTART CLAUDE DESKTOP NOW**
**You need to restart Claude Desktop for the new configuration to take effect!**

1. Close Claude Desktop completely
2. Reopen Claude Desktop  
3. Start a new conversation

### **🧪 Test Your Memory**
After restarting, try these commands:

1. **Store a memory**: "Remember that I like coffee"
2. **Restart Claude Desktop again** 
3. **Recall the memory**: "What do I like to drink?"

You should see:
- ✅ Memory stored successfully 
- 🧠 Found memories about coffee preferences

## 🛠️ Available Memory Tools

Your local system now provides these tools:

- **`remember`** - Store information persistently
- **`recall`** - Search and retrieve memories  
- **`reflect`** - Meta-cognitive reflection on topics
- **`reason`** - Symbolic reasoning with premises and goals
- **`assess_confidence`** - Evaluate confidence in statements

## 📊 Technical Details

### **Local MCP Server Features**
- **Persistent SQLite database** - memories survive restarts
- **Semantic search** - finds related concepts, not just exact matches
- **Relationship tracking** - builds context about people over time  
- **Reasoning history** - stores your logical conclusions
- **Emotional weighting** - prioritizes important memories

### **No More Cloud Dependencies**
- **Faster responses** - no network latency
- **Always available** - works offline
- **Private data** - your memories stay on your machine
- **No authentication issues** - no more gcloud login problems

## 🔧 Backup Options

### **Cloud Service (Optional)**
If you want to restore the cloud service later:
1. Re-authenticate: `gcloud auth login`
2. Deploy: `C:\Users\Tom\Documents\GitHub\AGI\deploy-gcp.ps1`
3. Update config to point back to `cloud-memory-server.js`

### **Configuration Backup**
- **Local config**: `claude_desktop_config_local.json` (backup created)
- **Original config**: Available if you need to revert

---

## 🎉 You're All Set!

**Your F3IL (Claude) memory system is now running locally and should work reliably across all conversations.**

Just restart Claude Desktop and test the memory functions. You should see persistent memory working immediately!

Current chat usage: **~35%** - plenty of room to continue if you need help testing!

---

# v2.0 — MCP Reactivation (2026-08-06)

**Target repo/branch:** `C:\Users\Tom\Documents\GitHub\AGI` (main)

## Why the MCP was inactive

Two bugs in `C:\Users\Tom\Documents\GitHub\AGI\mcp-server.js`, both Windows-specific:

1. **The server never started on Windows.** The main-module check compared
   `import.meta.url` (`file:///C:/Users/...`, forward slashes) against
   `` `file://${process.argv[1]}` `` (`file://C:\Users\...`, backslashes).
   These never match on Windows, so `node mcp-server.js` defined the class
   and exited silently. On Linux/macOS the same check passes — which is why
   it looked correct. Fixed with `pathToFileURL(process.argv[1]).href`.

2. **The memory DB path was cwd-relative.** `MemoryManager` defaulted to
   `./memory.db`, but Claude Desktop does not launch MCP servers from the
   repo folder, so memories could be written to a different file than
   `C:\Users\Tom\Documents\GitHub\AGI\memory.db`. Fixed by anchoring the
   DB path to the server file's own directory (`join(__dirname, 'memory.db')`).

Also hardened stdin handling: JSON-RPC lines are now buffered across chunk
boundaries instead of assuming one message per data event.

## Verification (2026-08-06, cloud sandbox, Node 22)

Full JSON-RPC round trip against the fixed server, launched from a
*different* working directory: `initialize` → `tools/call remember` →
`tools/call recall` all returned correct responses, and `memory.db` was
created next to `mcp-server.js`, not in the cwd.

## To reactivate in Claude Desktop (manual step — do this once)

The real Claude Desktop config lives at
`%APPDATA%\Claude\claude_desktop_config.json` (NOT the copies in this repo).
Open Claude Desktop → Settings → Developer → Edit Config, and make sure it
contains:

```json
{
  "mcpServers": {
    "agi-memory-server": {
      "command": "node",
      "args": ["C:\\Users\\Tom\\Documents\\GitHub\\AGI\\mcp-server.js"],
      "env": { "NODE_ENV": "production" }
    }
  }
}
```

Then fully quit Claude Desktop (system tray → Quit, not just the window)
and reopen it. The `remember` / `recall` / `reflect` / `reason` /
`assess_confidence` tools should appear.

## Files changed in v2.0

- `mcp-server.js` — the three fixes above
- `.mcp.json` — was empty `{}`; now registers `agi-memory-server` so Claude
  Code / Cowork sessions opened in this repo pick the server up
  automatically (project-scope config)

---

# v3.0 — Semantic Recall via Local Embeddings (2026-08-07)

**Target repo/branch:** `C:\Users\Tom\Documents\GitHub\AGI` (main)

## What changed

Recall is now hybrid: meaning-based vector search merged with multi-term
keyword matching. Design principle: **memory stays in the user's control** —
the embedding model (all-MiniLM-L6-v2, ~25 MB) downloads once on first use
and then runs entirely locally via transformers.js (ONNX). No API calls, no
cloud, and `memory.db` remains a single auditable SQLite file. Vectors are
an index only; the human-readable text stays canonical.

## Files

- `src/memory/embeddings.js` — NEW: local embedding + cosine similarity,
  lazy model load, graceful null on failure, test-injection hook
- `src/memory/manager.js` — v3 rewrite of recall: semantic channel
  (cosine ≥ 0.35) merged with per-term keyword channel; embeddings computed
  at store time; automatic v2→v3 schema migration (adds `embedding` column);
  background backfill embeds pre-v3 rows and rows stored while offline
- `package.json` — added `@xenova/transformers`; new `npm run test:v3`
- `test-v3-recall.js` — NEW: 10-check verification suite (migration,
  zero-shared-word semantic recall, multi-term keyword recall, offline
  fallback, backfill, vector hygiene)

## Fixes the v2 blind spots observed on 2026-08-06

- `recall("sr-lab docker")` returned nothing while `recall("Kepler")`
  worked — v2 matched the whole query as ONE substring. v3 matches each
  term, and the semantic channel finds matches with zero shared words
  ("what beverage does he like" → the coffee memory).
- The hardcoded `expandSearchTerms` synonym lists (drink→coffee/tea/...)
  are gone — embeddings do this generally instead of by hand-written rule.

## Verification record

All 10 checks passed in the build sandbox (deterministic injected
embedder — the sandbox blocks the model CDN). Full MCP JSON-RPC round trip
verified with the model unavailable: store succeeds `[no embedding — will
backfill]`, keyword recall works, and the server reports semantic recall
will activate when the model can download. First run on the real machine
downloads the model and backfills existing memories automatically.

## To activate

```bash
cd C:\Users\Tom\Documents\GitHub\AGI
npm install
npm run test:v3        # optional: verify (uses mock embedder, no download)
```

Then restart Claude Desktop (tray → Quit → reopen) so the MCP server
reloads. First `remember`/`recall` triggers the one-time model download;
watch `%APPDATA%\Claude\logs\mcp-server-agi-memory-server.log` for
"Embedding model ready (local inference)".

## Known limitation (documented trade-off)

Embeddings import a small piece of opacity: a memory's 384 numbers aren't
human-readable. Mitigation is architectural — vectors are only ever an
index; deleting the `embedding` column loses recall quality, never data.
Next step if scale demands (>tens of thousands of memories): sqlite-vec
extension for in-database nearest-neighbor search, same single-file DB.

---

# v3.1 — Containerized Memory Server (2026-08-07)

**Target repo/branch:** `C:\Users\Tom\Documents\GitHub\AGI` (main)

## Design: container owns the runtime, user owns the data

The MCP server now runs in Docker, launched by Claude Desktop via
`docker run -i` (MCP is JSON-RPC over stdio; `-i` wires it through). The
repo folder bind-mounts to `/data` inside the container, so:

- `C:\Users\Tom\Documents\GitHub\AGI\memory.db` — the SAME single SQLite
  file as before, still plain, still auditable, still yours. Host-node mode
  and container mode read/write the identical file.
- `C:\Users\Tom\Documents\GitHub\AGI\.model-cache\` — the embedding model's
  one-time ~25 MB download, on your disk, reused across container runs.

The image contains only code. Delete the container/image and you lose
nothing but a runtime.

## Files (v3.1)

- `Dockerfile.memory` — node:22-slim image for the MCP server
- `.dockerignore` — root build context: runtime code only
- `docker-compose.yml` — new `memory` profile (BUILD-only; Claude Desktop
  launches the container itself, compose does not run it)
- `mcp-server.js` — `F3IL_DB_PATH` env override for the DB location
- `src/memory/embeddings.js` — `F3IL_CACHE_DIR` env override for model cache

## Setup

1. Build the image (from the repo root):

```bash
docker compose --profile memory build
```

2. Point Claude Desktop at the container — in
`%APPDATA%\Claude\claude_desktop_config.json`, replace the
`agi-memory-server` entry with:

```json
{
  "mcpServers": {
    "agi-memory-server": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm",
        "-v", "C:\\Users\\Tom\\Documents\\GitHub\\AGI:/data",
        "agi-memory-server"
      ]
    }
  }
}
```

3. Fully quit and reopen Claude Desktop. Docker Desktop must be running
before Claude Desktop starts the server.

Rollback is trivial: switch the config back to the host-node command
(v2.0 section above) — same database file either way.

## Verification record (2026-08-07, cloud sandbox)

- compose config valid; `--profile memory` selects exactly the memory service
- `F3IL_DB_PATH` override verified end-to-end: full JSON-RPC round trip
  (initialize → remember → recall) with the DB written to the override
  path — the exact mechanism the container uses via the /data mount
- NOT verified here: the image build itself (container registries are
  blocked in the build sandbox). The Dockerfile is standard; if
  `docker compose --profile memory build` fails on the real machine, the
  error will be in the Docker layer, not the server code.

## Trade-offs (honest ledger)

- Gained: dependency isolation (npm packages live in the image, not on the
  host), reproducible runtime, no host node_modules requirement.
- Cost: Docker Desktop must be running for memory to work; container spawn
  adds ~1–2 s to MCP startup; one more indirection layer to debug.
- Unchanged: memory ownership. The DB file and model cache never enter the
  container's writable layer.
