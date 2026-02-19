# Todo List

## Current Status: Smart Mode Transformation

### ✅ Phase 0: Research & Planning (DONE)

- [x] Analyzed current architecture bottlenecks (file tree, context,
      compression)
- [x] Mapped all critical code paths (`contextManager.ts`,
      `environmentContext.ts`, `chatCompressionService.ts`,
      `getFolderStructure.ts`, `promptProvider.ts`)
- [x] Competitive analysis: Antigravity, Cursor, Cline
- [x] Created comprehensive `docs/SMART_MODE_PLAN.md` with 11 phases
- [x] Added benchmark logging (`benchmarkLogger.ts`,
      `loggingContentGenerator.ts`)
- [x] Created Angular DDD sandbox for testing

---

### ✅ Phase 1: Config & Skeleton Tree (DONE)

**Priority**: 🔴 Critical | **Effort**: 1-2 days

- [x] Add `smartMode` flag to `packages/core/src/config/config.ts`
      (ConfigParameters, Config class, getter)
- [x] Add `--smart` CLI flag to `packages/cli/src/config/config.ts` (yargs
      option, `isSmartMode()` helper)
- [x] Add `smartMode` to settings schema
      (`packages/cli/src/config/settingsSchema.ts`) under `experimental`
- [x] Modify `getFolderStructure.ts` to support `maxDepth` option (default 2 in
      smart mode)
- [x] Add `countFilesRecursively()` helper for directory file count annotations:
      `src/ (42 files)`
- [x] Add `isDepthLimited` flag to `FullFolderInfo` for depth-limited rendering
- [x] Wire smart mode into `environmentContext.ts` → depth-limited tree when
      `--smart` is active
- [x] Add prompt hint: "Use `ls` tool to explore deeper directories"
- [x] **Keyword Extractor**: `packages/core/src/services/keywordExtractor.ts`
      (11 tests passing)
- [x] **Scout Agent**: `packages/core/src/agents/scout-agent.ts` (Brain Loop
      LOCATE step)

### 🔲 Phase 2: Active File Injection

**Priority**: 🔴 Critical | **Effort**: 2-3 days

- [ ] Wire `ideContextStore.get()` into `environmentContext.ts` →
      `getEnvironmentContext()`
- [ ] Inject `<active_context>` block with active file path, cursor position,
      selected text
- [ ] Create `packages/core/src/services/activeFileService.ts` for heuristic
      fallback
- [ ] Track files accessed via `read_file` tool calls as "recently relevant"
- [ ] Write tests for active file injection

### 🔲 Phase 3: The Constitution

**Priority**: 🔴 Critical | **Effort**: 1 day

- [ ] Add `renderConstitution()` to `packages/core/src/prompts/snippets.ts`
- [ ] Wire into `promptProvider.ts` → `getCoreSystemPrompt()`
- [ ] Support per-project `<constitution>` blocks in GEMINI.md
- [ ] Write tests

### 🔲 Phase 4: JIT Retrieval

**Priority**: 🟠 High | **Effort**: 3-5 days

- [ ] Create `packages/core/src/services/keywordExtractor.ts`
- [ ] Implement proactive grep in `ripGrep.ts` (keyword search before model
      call)
- [ ] Rank results by density (unique keyword matches per file)
- [ ] Inject top 5-10 snippets as `<retrieved_context>` block
- [ ] Write tests

### 🔲 Phase 5: Lazy Memory Loading

**Priority**: 🟠 High | **Effort**: 3-4 days

- [ ] Refactor `contextManager.ts` to build memory index (headings + topics)
- [ ] Load only global memory on startup
- [ ] Implement `getMemoryForTopic()` for on-demand loading
- [ ] Write tests

### 🔲 Phase 6: Rolling Window Compression

**Priority**: 🟡 Medium | **Effort**: 2-3 days

- [ ] Add turn-based compression to `chatCompressionService.ts`
- [ ] Keep last 10 turns, summarize older turns proactively
- [ ] Prevent "sudden amnesia" from massive compression events
- [ ] Write tests

### 🔲 Phase 7: Critic Agent

**Priority**: 🟡 Medium | **Effort**: 2-3 days

- [ ] Create `packages/core/src/agents/critic-agent.ts`
- [ ] Pre-output validation against constitution rules
- [ ] Lightweight Flash model for speed
- [ ] Write tests

### 🔲 Phase 8: `@` References

**Priority**: 🟠 High | **Effort**: 3-4 days

- [ ] Parse `@file:`, `@dir:`, `@git:`, `@error`, `@memory:` in user input
- [ ] Create `packages/core/src/services/contextResolver.ts`
- [ ] Write tests

### 🔲 Phase 9: Knowledge Base

**Priority**: 🟡 Medium | **Effort**: 5-7 days

- [ ] Create `.gemini/knowledge/` directory structure
- [ ] Implement pattern extraction after successful tasks
- [ ] Implement error→fix mapping storage
- [ ] File importance scoring (access frequency)
- [ ] Write tests

### 🔲 Phase 10: Local Embedding Index (RAG)

**Priority**: 🟢 Future | **Effort**: 7-10 days

- [ ] Create `packages/core/src/services/embeddingIndex/`
- [ ] Smart file chunking (function-level, class-level)
- [ ] Use Gemini `embedContent` API for embeddings
- [ ] SQLite storage for vector index
- [ ] Nearest-neighbor search for semantic retrieval

### 🔲 Phase 11: Parallel Agent Orchestration

**Priority**: 🟢 Future | **Effort**: 10+ days

- [ ] Create `packages/core/src/agents/agent-coordinator.ts`
- [ ] Task decomposition via planning agent
- [ ] Parallel execution with dependency ordering
- [ ] Result merging and conflict resolution

---

## 🧠 Proposed: The "Brain" Loop Architecture

> **Goal**: Move away from the linear _Prompt → Response_ flow to a **5-step
> intelligence loop** that makes the CLI truly understand _how_ the project
> works, not just _what_ is in the text files.

### Pillar 1: Context Gathering & Architecture Awareness

**Relates to**: Phase 1 (Skeleton Tree), Phase 2 (Active File Injection) | **New
capability**: AST Analysis

Instead of dumping raw file content into the context window, the CLI should
build a **compressed, structural representation** of the project:

- [ ] **File Tree + Summary Tokenization**: Generate a visual directory
      structure paired with cached 1-sentence descriptions of each file (stored
      in `.gemini-cli/cache/`). This replaces the brute-force BFS tree with a
      semantically meaningful skeleton.
- [ ] **AST (Abstract Syntax Tree) Analysis**: Integrate `tree-sitter` (or
      similar parser) to extract **structural metadata** instead of relying on
      regex:
  - **Exported Symbols**: Which functions/classes are public?
  - **Dependency Graph**: Which file imports which? (enables impact analysis)
  - **Type Signatures**: What are the function parameter types and return types?
- [ ] **Impact Analysis on Prompt**: When the user asks to "add a feature," the
      CLI checks the dependency graph to identify which files will be affected,
      effectively **pre-fetching** relevant context before the LLM even starts
      generating.

### Pillar 2: Code Reusability — The "Don't Repeat Yourself" Engine

**Relates to**: Phase 10 (Embedding Index / RAG) | **New capability**: Semantic
Index + Symbol Table

To ensure the CLI **reuses existing logic** instead of reinventing the wheel:

- [ ] **Vector Embeddings (local)**: Implement a local vector database (ChromaDB
      or FAISS index). Chunk the codebase by functions or classes and generate
      embeddings for them.
- [ ] **Pre-Generation Semantic Search**: Before generating code, the CLI
      performs a semantic search against the codebase using the user's intent.
      Found functions are injected into the prompt:
  > _"User wants to validate emails. Found existing function `validateEmail` in
  > `utils/validators.ts`. Use this instead of writing a new one."_
- [ ] **Symbol Table Lookup**: Maintain a lightweight index of **all function
      signatures** in the project. If the LLM generates a function call like
      `calculate_tax()`, the CLI verifies:
  - Does `calculate_tax` exist?
  - What arguments does it accept?
  - Is the call-site type-compatible?

### Pillar 3: Smart Find & "Target Acquisition"

**Relates to**: Phase 4 (JIT Retrieval) | **New capability**: Scout Agent +
Hybrid Search

This solves the problem of _"Where do I make this edit?"_ by treating the prompt
as a **search query first**:

- [ ] **The "Scout" Agent**: Before any coding happens, run a lightweight
      "Scout" prompt:
  - **Input**: User Prompt + Project File Tree + List of Exported Symbols
  - **Task**: _"Identify the top 3 files most likely to be modified to satisfy
    this request. Return only the file paths."_
  - **Model**: Use Gemini Flash for speed (< 1 second).
- [ ] **Keyword & Semantic Hybrid Search**: Combine two search strategies and
      intersect results:
  - **Literal Search**: grep/ripgrep for `"login"`, `"button"`, `"color"` (text
    match).
  - **Semantic Search**: vector query for `"authentication"`, `"UI theme"`,
    `"styles"` (conceptual match).
  - **Intersection**: The file appearing in **both** result sets is the most
    likely target.

### The Brain Loop (Execution Cycle)

```
┌─────────────────────────────────────────────────────────┐
│                    THE BRAIN LOOP                       │
│                                                         │
│  1. INGEST    → Load file tree + symbol table           │
│  2. LOCATE    → Scout Agent finds target files          │
│                  (keyword + semantic hybrid search)      │
│  3. AUDIT     → Query vector DB: "Do we already have    │
│                  logic for [X]?" Retrieve matching       │
│                  function signatures.                    │
│  4. GENERATE  → LLM writes code using Active Context    │
│                  + Existing Logic (no duplication)       │
│  5. APPLY     → Diff is applied to the located file(s)  │
│                                                         │
│  ┌──────┐    ┌──────┐    ┌──────┐    ┌────────┐    ┌───┐│
│  │INGEST│───▶│LOCATE│───▶│AUDIT │───▶│GENERATE│───▶│APL││
│  └──────┘    └──────┘    └──────┘    └────────┘    └───┘│
│      ▲                                          │       │
│      └──────────── feedback loop ───────────────┘       │
└─────────────────────────────────────────────────────────┘
```

### Implementation Priority for Brain Loop

| Component                                 | New / Extends    | Effort    | Priority    |
| ----------------------------------------- | ---------------- | --------- | ----------- |
| File Summary Cache (`.gemini-cli/cache/`) | New              | 2-3 days  | 🟠 High     |
| AST Analysis via tree-sitter              | New              | 5-7 days  | 🟡 Medium   |
| Dependency Graph Builder                  | New              | 3-4 days  | 🟡 Medium   |
| Scout Agent (lightweight file finder)     | Extends Phase 4  | 2-3 days  | 🔴 Critical |
| Semantic Index (vector embeddings)        | Extends Phase 10 | 7-10 days | 🟠 High     |
| Symbol Table + Verification               | New              | 3-5 days  | 🟠 High     |
| Hybrid Search (keyword ∩ semantic)        | Extends Phase 4  | 2-3 days  | 🟠 High     |

---

## Recently Completed

### Commit: feat: Add benchmark prompts, a logger for benchmark results, and detailed API request/response logging.

**Hash:** `03a6fe5550847e6e021921e73b027aa9ceaeb970`

#### Logic & Changes

- **Benchmark Logger (`packages/core/src/core/benchmarkLogger.ts`)**:
  - Created a new `BenchmarkLogger` class.
  - Implemented logic to append benchmark results to `benchmark.result.json` in
    the project root.
  - Handles file existence checks and JSON parsing safely (resets to empty array
    on failure).
  - Logs detailed metrics: `timestamp`, `contextFiles` (list of active context),
    `tokens` (input/output/total), `model`, `durationMs`, `requestPayloadSize`,
    and `status`.
- **Logging Integration (`packages/core/src/core/loggingContentGenerator.ts`)**:
  - Integrated `BenchmarkLogger` into `generateContent` and
    `generateContentStream` methods.
  - Now logs API usage metrics immediately after a response or error.
  - Added `contextFiles` retrieval via
    `this.config.getContextManager()?.getLoadedPaths()`.
  - Enhanced console logging to show "Generation Request" details (Model, Prompt
    ID, Payload Size).
  - Added error handling to log "error" status benchmarks if the API call fails.
- **Configuration**:
  - Added `sandbox/angular-ddd/model.benchmark.json` for benchmark specific
    settings.

### Commit: feat add logging and sandbox

**Hash:** `2c2bbae3aca951990f6600464a11da5451b3a302`

#### Logic & Changes

- **Smart Mode Plan (`docs/SMART_MODE_PLAN.md`)**:
  - Added a comprehensive design document for "Smart Mode" to improve context
    management (Tree optimization, Dynamic injection, JIT retrieval).
- **Angular DDD Sandbox (`sandbox/angular-ddd/`)**:
  - **Initialization**: Created a full Angular application structure
    (`angular.json`, `package.json`, `tsconfig.json`, `src/`).
  - **Domain Driven Design (DDD) Setup**:
    - **Domain**: Defined `Product` model and `ProductId`.
    - **Ports**: Interfaces for `ProductRepository`, `CreateProductUseCase`, and
      `GetProductUseCase`.
    - **Application**: Implemented services `CreateProductService` and
      `GetProductService`.
    - **Infrastructure**:
      - **Persistence**: Added `InMemoryProductRepository`.
      - **Web**: Created `ProductComponent` (UI) with HTML/CSS/TS.
      - **Config**: Set up `product.providers.ts` for dependency injection.
- **Core Updates**:
  - Minor updates to `loggingContentGenerator.ts` and `contextManager.ts` to
    support the new logging requirements and context file retrieval.
