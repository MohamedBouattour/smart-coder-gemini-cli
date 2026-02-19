# Smart Mode: Context Optimization & Architecture Plan

## 0. Executive Summary

**Goal**: Transform the Gemini CLI fork into a **"Smart Coder"** — a
terminal-first AI coding agent that rivals Antigravity, Cursor, and Cline in
context intelligence, while keeping the lightweight, open-source, terminal-first
DNA that makes it unique.

**Key Insight**: The current Gemini CLI treats context as a "dump everything"
strategy. Every competitor that wins benchmarks does the opposite: they build a
**relevance engine** that feeds the model _only_ what it needs, _when_ it needs
it. Our fork must do the same — but from the terminal, without a full IDE.

---

## 1. Current Architecture Analysis

The current Gemini CLI uses a **"Brute Force" Context Strategy**. It attempts to
load as much static information as possible into the context window at the start
of a session, and then relies on reactive compression when limits are reached.

### Current Data Flow (The "Brute Force" Loop)

```mermaid
graph TD
    A[Start Session] --> B{Discovery Phase}
    B -->|Scan| C[Environment Context]
    B -->|Recursive Find| D[GEMINI.md Memory Files]

    C --> E[Full File Tree (BFS, ~200 items)]
    D --> F[Load ALL Project Memory]

    E & F --> G[System Prompt]

    H[User Query] --> I[Chat History]
    G & I --> J[LLM Context Window]

    J --> K{Token Limit > 50%?}
    K -- Yes --> L[Trigger Compression]
    L --> M[Summarize Old History]
    M --> I
    K -- No --> N[Generate Response]
```

### Critical Bottlenecks (Mapped to Code)

| #   | Problem                  | Where in Code                                          | Impact                                             |
| --- | ------------------------ | ------------------------------------------------------ | -------------------------------------------------- |
| 1   | **Static File Tree**     | `getFolderStructure.ts` → BFS with `MAX_ITEMS = 200`   | Dumps irrelevant deep files, misses important ones |
| 2   | **Eager Memory Load**    | `contextManager.ts` → `refresh()` loads ALL GEMINI.md  | 10k+ tokens consumed before first question         |
| 3   | **Reactive Compression** | `chatCompressionService.ts` → triggers at 50% capacity | Expensive latency spike, "sudden amnesia"          |
| 4   | **Blind State**          | `environmentContext.ts` → no active file awareness     | Model doesn't know what user is looking at         |
| 5   | **No Semantic Search**   | Only `ripGrep.ts` for text search, no vector index     | Can't find conceptually related code               |
| 6   | **No Self-Critique**     | Single-pass generation                                 | Architecture violations not caught before output   |

---

## 2. Competitive Analysis: What Rivals Do Better

### 2.1 Antigravity (Google's IDE)

| Feature                                                  | Antigravity Has |  Gemini CLI Has  | Gap                                  |
| -------------------------------------------------------- | :-------------: | :--------------: | :----------------------------------- |
| Agent-first parallel execution                           |       ✅        |        ❌        | No parallel agent support            |
| Multisurface (editor+terminal+browser)                   |       ✅        | ⚠️ Terminal only | No browser/editor orchestration      |
| Artifact-based delivery (plans, screenshots, recordings) |       ✅        |        ❌        | No verifiable artifacts              |
| MCP integration                                          |       ✅        |        ✅        | Parity                               |
| 1M token context window                                  |       ✅        |        ✅        | Parity (same Gemini models)          |
| Knowledge base / self-learning                           |       ✅        |        ❌        | No persistent learning               |
| Manager View (Mission Control)                           |       ✅        |        ❌        | Single agent only                    |
| Secure Mode (permission system)                          |       ✅        |        ⚠️        | Has approval modes but less granular |

**Key takeaway**: Antigravity wins on _orchestration_ and _transparency_. We
need **Artifact generation**, **parallel agent support**, and a **persistent
knowledge base**.

### 2.2 Cursor

| Feature                          | Cursor Has | Gemini CLI Has | Gap                                |
| -------------------------------- | :--------: | :------------: | :--------------------------------- |
| Codebase embedding/indexing      |     ✅     |       ❌       | No vector index at all             |
| `@` symbol context referencing   |     ✅     |       ❌       | No user-directed context targeting |
| Automatic linter error injection |     ✅     |       ❌       | Doesn't see IDE errors             |
| Recent edit history tracking     |     ✅     |       ❌       | No edit awareness                  |
| Multi-agent parallel (8 agents)  |     ✅     |       ❌       | Single sequential agent            |
| Plan mode with review            |     ✅     |       ✅       | Parity (existing plan mode)        |
| `.cursorrules` project rules     |     ✅     |       ✅       | Parity (GEMINI.md)                 |

**Key takeaway**: Cursor wins on **codebase indexing** (RAG) and **intelligent
context selection**. We need a **local embedding index** and **user-directed
context** (`@` references).

### 2.3 Cline

| Feature                     | Cline Has | Gemini CLI Has | Gap                                    |
| --------------------------- | :-------: | :------------: | :------------------------------------- |
| Memory bank (cross-session) |    ✅     |       ⚠️       | GEMINI.md is static, no learned memory |
| AST-aware code analysis     |    ✅     |       ❌       | Text-only understanding                |
| Plan → Act mode             |    ✅     |       ✅       | Parity                                 |
| MCP Marketplace             |    ✅     |       ⚠️       | Has MCP but no marketplace             |
| Proactive error monitoring  |    ✅     |       ❌       | Doesn't watch for compiler errors      |
| `.clinerules` project rules |    ✅     |       ✅       | Parity (GEMINI.md)                     |

**Key takeaway**: Cline wins on **semantic code understanding** (AST) and
**proactive error monitoring**. We need a **lightweight AST service** and
**error stream integration**.

---

## 3. Smart Mode Architecture

**Objective**: Maximize **Relevance Density**. Shift from "Everything at once"
to **"Skeleton + Active Focus + JIT Retrieval + Self-Critique"**.

### Proposed Data Flow (The "Smart" Loop)

```mermaid
graph TD
    A[Start Session] --> B{Light Discovery}
    B --> C[Skeleton Tree - Depth 1-2]
    B --> D[Constitution - Global Rules]
    B --> E[Build Local Index - embeddings]

    F[User Query] --> G{Intent Analysis}

    G -->|Focus| H[Active File Content - IDE or heuristic]
    G -->|Search| I[JIT Retrieval - Grep + Vector Search]
    G -->|Memory| J[Lazy Memory Search - indexed GEMINI.md]
    G -->|@ref| K[User-Directed Context]

    C & D & H & I & J & K --> L[Dynamic Context Block]

    L --> M[LLM Context Window]

    M --> N[Generate Response]
    N --> O{Critic Agent}
    O -->|Pass| P[Output to User]
    O -->|Violation| Q[Rewrite with Feedback]
    Q --> N

    M --> R[Proactive Rolling Window - 10 turns]
```

---

## 4. Implementation Details & Transformation Steps

### Phase 1: Foundation — Config & Skeleton Tree

**Difficulty**: Low | **Impact**: Medium | **Files to modify**: 4

#### 1A. Add `smartMode` Configuration Flag

**Target**: `packages/core/src/config/config.ts`

```typescript
// Add to Config interface and class
getSmartMode(): boolean;
// Read from: CLI flag --smart, env GEMINI_SMART_MODE, or settings.json
```

**Target**: `packages/cli/src/nonInteractiveCli.ts` (CLI arg parsing)

Add `--smart` flag to enable smart mode.

#### 1B. Implement Depth-Limited File Tree

**Target**: `packages/core/src/utils/getFolderStructure.ts`

**Current**: BFS with `MAX_ITEMS = 200`, no depth control. **Change**: When
`smartMode` is enabled:

- Set `maxDepth = 2` (root + 1 level of subdirectories)
- Always expand the path to `cwd`
- Add file count annotations per directory: `src/ (42 files)`
- Add prompt hint: `"Use the \`ls\` tool to explore deeper directories."`

```typescript
// New option in FolderStructureOptions
smartMode?: boolean;
maxDepth?: number;  // Default 2 in smart mode
```

**Estimated token savings**: ~60-70% of file tree tokens.

---

### Phase 2: Active File Injection ("Focus Mode")

**Difficulty**: Medium | **Impact**: High | **Files to modify**: 3

#### 2A. Leverage Existing IDE Context Store

The codebase already has `ideContextStore` in
`packages/core/src/ide/ideContext.ts` with full support for:

- `openFiles` with `path`, `isActive`, `cursor`, `selectedText`
- `IdeContextNotificationSchema` for real-time updates from VS Code companion

**Current problem**: This data exists but is **never injected into the prompt**.

**Target**: `packages/core/src/utils/environmentContext.ts`

```typescript
// In getEnvironmentContext(), add:
import { ideContextStore } from '../ide/ideContext.js';

const ideContext = ideContextStore.get();
if (ideContext?.workspaceState?.openFiles) {
  const activeFile = ideContext.workspaceState.openFiles.find(
    (f) => f.isActive,
  );
  if (activeFile) {
    // Read file content (up to 2k tokens) and inject as <active_context>
    context += `\n<active_context>
Active File: ${activeFile.path}
Cursor: Line ${activeFile.cursor?.line ?? 'unknown'}
${activeFile.selectedText ? `Selected Text:\n${activeFile.selectedText}` : ''}
</active_context>`;
  }
}
```

#### 2B. Heuristic Fallback (No IDE Connection)

When no IDE companion is connected, use heuristics:

- Watch `git diff --name-only` for recently modified files
- Track files accessed via `read_file` tool calls
- Prioritize files in `cwd`

**Target**: New file `packages/core/src/services/activeFileService.ts`

---

### Phase 3: The Constitution (Pinned Quality Rules)

**Difficulty**: Low | **Impact**: High | **Files to modify**: 2

#### 3A. Add Constitution Block to System Prompt

**Target**: `packages/core/src/prompts/snippets.ts`

Add a new section renderer:

```typescript
export function renderConstitution(rules?: ConstitutionRules): string {
  if (!rules) return '';
  return `
<constitution>
## Non-Negotiable Code Quality Rules
These rules MUST be followed for ALL generated code, regardless of context:

1. **Quality First**: All code must be robust, error-handled, and production-ready.
2. **Testing**: Generate unit tests for all new core logic. Target: **${rules.coverageTarget ?? 80}%** coverage.
3. **Linting**: Code must comply with project ESLint/Prettier rules. No unused variables.
4. **Architecture**:
   - Respect the existing folder structure and layering.
   - No circular dependencies.
   - Follow existing import conventions.
5. **Security**: Never hardcode secrets. Use environment variables.
${rules.custom?.map((r) => `6. ${r}`).join('\n') ?? ''}
</constitution>`;
}
```

**Target**: `packages/core/src/prompts/promptProvider.ts`

Add `constitution` to `SystemPromptOptions` and wire it into
`getCoreSystemPrompt()`.

#### 3B. Per-Project Constitution via GEMINI.md

Allow projects to define custom constitution rules in their `GEMINI.md`:

```markdown
<constitution>
- Use DDD (Domain-Driven Design) patterns
- All API endpoints must have OpenAPI documentation
- Database access only through repository pattern
</constitution>
```

---

### Phase 4: JIT (Just-In-Time) Context Retrieval

**Difficulty**: High | **Impact**: Very High | **Files to modify**: 5+

#### 4A. Keyword Extraction from User Query

**Target**: New file `packages/core/src/services/keywordExtractor.ts`

```typescript
export function extractKeywords(query: string): string[] {
  // 1. Remove stop words
  // 2. Extract identifiers (camelCase, snake_case splitting)
  // 3. Extract quoted strings
  // 4. Extract file paths and class/function names
  // 5. Deduplicate and rank by specificity
}
```

#### 4B. Enhanced Grep Service with Ranking

**Target**: Enhance existing `packages/core/src/tools/ripGrep.ts`

The existing ripgrep tool is powerful but used reactively (model calls it). In
Smart Mode, run it **proactively**:

```typescript
export async function jitSearch(
  keywords: string[],
  workingDir: string,
  options: { maxSnippets: number; contextLines: number },
): Promise<RetrievedSnippet[]> {
  // 1. Run ripgrep for each keyword
  // 2. Rank by "density" (unique keyword matches per file)
  // 3. Expand matches to include surrounding lines
  // 4. Deduplicate overlapping ranges
  // 5. Return top N snippets with file path + line range + content
}
```

#### 4C. Local Embedding Index (Stretch Goal)

**Target**: New module `packages/core/src/services/embeddingIndex/`

Use Gemini's `embedContent` API (already available via
`LoggingContentGenerator.embedContent()`) to build a local vector index:

```
embeddingIndex/
├── indexBuilder.ts    # Chunk files, compute embeddings, store in SQLite
├── indexSearcher.ts   # Query embeddings, find nearest neighbors
├── chunkStrategy.ts   # Smart chunking (function-level, class-level)
└── types.ts
```

**Storage**: SQLite via `better-sqlite3` (lightweight, no server needed)

This would give us **Cursor-level RAG** in a terminal tool.

---

### Phase 5: Lazy Memory Loading

**Difficulty**: High | **Impact**: High | **Files to modify**: 3

#### 5A. Memory Index Instead of Full Load

**Target**: `packages/core/src/services/contextManager.ts`

**Current**: `refresh()` loads ALL `GEMINI.md` files into memory. **Smart
Mode**:

```typescript
async refresh(): Promise<void> {
  if (this.config.getSmartMode()) {
    // Smart: Build index only
    const paths = await this.discoverMemoryPaths(debugMode);
    this.memoryIndex = await this.buildMemoryIndex(paths);
    // Load ONLY global memory (constitution)
    this.globalMemory = await this.loadGlobalMemoryOnly(paths.global);
  } else {
    // Legacy: Load everything
    // ... existing code ...
  }
}

private async buildMemoryIndex(paths): Promise<MemoryIndex> {
  // For each GEMINI.md, extract:
  // - File path
  // - Section headings
  // - Key topics (first 100 chars of each section)
  // Return as searchable index
}

async getMemoryForTopic(topic: string): Promise<string> {
  // Search the index, load only matching GEMINI.md files
  // This is called during JIT retrieval
}
```

---

### Phase 6: Proactive Rolling Window

**Difficulty**: Medium | **Impact**: Medium | **Files to modify**: 2

#### 6A. Turn-Based Compression

**Target**: `packages/core/src/services/chatCompressionService.ts`

**Current**: Compress when token count exceeds 50% of model limit. **Smart
Mode**: Keep a strict window of the last N turns.

```typescript
// In smart mode:
const SMART_MODE_MAX_TURNS = 10;
const SMART_MODE_SUMMARY_BUDGET = 2000; // tokens for summary

// After every turn:
if (smartMode && history.length > SMART_MODE_MAX_TURNS) {
  const oldTurns = history.slice(0, -SMART_MODE_MAX_TURNS);
  const summary = await summarize(oldTurns);
  // Replace old turns with <conversation_summary> block
  history = [
    {
      role: 'user',
      parts: [
        { text: `<conversation_summary>${summary}</conversation_summary>` },
      ],
    },
    ...history.slice(-SMART_MODE_MAX_TURNS),
  ];
}
```

**Benefit**: No more "sudden amnesia" from massive compression events.

---

### Phase 7: Critic Agent (Architecture Awareness)

**Difficulty**: Medium | **Impact**: Very High | **Files to modify**: 3

#### 7A. Lightweight Pre-Output Validation

**Target**: New file `packages/core/src/agents/critic-agent.ts`

Model after existing `codebase-investigator.ts` pattern:

```typescript
export const CriticAgent = (config: Config): LocalAgentDefinition => ({
  name: 'code_critic',
  kind: 'local',
  displayName: 'Code Critic Agent',
  description:
    'Validates generated code against architecture rules before output.',

  toolConfig: {
    tools: [READ_FILE_TOOL_NAME, GREP_TOOL_NAME],
  },

  modelConfig: {
    model: PREVIEW_GEMINI_FLASH_MODEL, // Use Flash for speed
    generateContentConfig: {
      temperature: 0.0, // Deterministic critique
    },
  },

  runConfig: {
    maxTimeMinutes: 1, // Must be fast
    maxTurns: 3,
  },

  promptConfig: {
    systemPrompt: `You are a Code Critic. Review the proposed code changes against:
1. The project's architecture rules (from <constitution>)
2. Import restrictions (no circular deps, layer violations)
3. Test coverage requirements
4. Security best practices

Output: { "approved": boolean, "violations": [...], "suggestions": [...] }`,
  },
});
```

---

### Phase 8: User-Directed Context (`@` References) — _NEW_

**Difficulty**: Medium | **Impact**: High | **Files to modify**: 4

#### 8A. `@` Symbol Parsing

**Target**: Input processing in `packages/cli/src/` (query parsing)

Support `@` references in user queries:

- `@file:path/to/file.ts` → inject file content
- `@dir:src/components/` → inject directory listing
- `@git:HEAD~3` → inject recent git diff
- `@error` → inject current terminal/build errors
- `@memory:testing` → inject testing-related GEMINI.md sections

#### 8B. Context Resolution Service

**Target**: New file `packages/core/src/services/contextResolver.ts`

```typescript
export class ContextResolver {
  async resolve(references: ParsedReference[]): Promise<ContextBlock[]> {
    return Promise.all(
      references.map((ref) => {
        switch (ref.type) {
          case 'file':
            return this.resolveFile(ref.path);
          case 'dir':
            return this.resolveDirectory(ref.path);
          case 'git':
            return this.resolveGitRef(ref.ref);
          case 'error':
            return this.resolveErrors();
          case 'memory':
            return this.resolveMemory(ref.topic);
        }
      }),
    );
  }
}
```

---

### Phase 9: Persistent Knowledge Base — _NEW_

**Difficulty**: High | **Impact**: Very High | **Files to modify**: 6+

#### 9A. Session Learning Store

**Target**: New module `packages/core/src/services/knowledgeBase/`

Unlike competitors that store knowledge server-side, we store everything
**locally** in the project:

```
.gemini/
├── knowledge/
│   ├── patterns.json       # Learned code patterns
│   ├── decisions.json      # Architecture decisions made
│   ├── errors.json         # Common errors and fixes
│   └── file-importance.json # File access frequency + relevance scores
```

**How it works**:

1. After each successful task, extract key patterns
2. After each error fix, record the error→fix mapping
3. Track which files are accessed most (file importance scoring)
4. Use file importance to prioritize JIT retrieval results

---

### Phase 10: Parallel Agent Orchestration — _NEW_

**Difficulty**: Very High | **Impact**: Very High | **Files to modify**: 8+

#### 10A. Agent Coordinator

**Target**: New file `packages/core/src/agents/agent-coordinator.ts`

Enable running multiple sub-agents in parallel for complex tasks:

```typescript
export class AgentCoordinator {
  async orchestrate(task: ComplexTask): Promise<OrchestratedResult> {
    // 1. Break task into subtasks via planning agent
    const plan = await this.planningAgent.decompose(task);

    // 2. Assign subtasks to specialist agents
    const assignments = plan.subtasks.map((st) => ({
      agent: this.selectAgent(st),
      subtask: st,
    }));

    // 3. Execute in parallel (with dependency ordering)
    const results = await this.executeParallel(assignments);

    // 4. Merge results and resolve conflicts
    return this.mergeResults(results);
  }
}
```

---

## 5. Execution Roadmap (Updated)

| Phase   | Task                      | Description                                                    | Difficulty | Priority    | Est. Effort |
| :------ | :------------------------ | :------------------------------------------------------------- | :--------- | :---------- | :---------- |
| **P1**  | **Config & Skeleton**     | Add `smartMode` flag. Implement Depth-limited File Tree.       | Low        | 🔴 Critical | 1-2 days    |
| **P2**  | **Active Context**        | Implement `ActiveFileService`, inject IDE context into prompt. | Medium     | 🔴 Critical | 2-3 days    |
| **P3**  | **The Constitution**      | Create pinned quality rules block in system prompt.            | Low        | 🔴 Critical | 1 day       |
| **P4**  | **JIT Retrieval**         | Implement `KeywordExtractor` + proactive grep search.          | High       | 🟠 High     | 3-5 days    |
| **P5**  | **Lazy Memory**           | Refactor `ContextManager` to build index, load on demand.      | High       | 🟠 High     | 3-4 days    |
| **P6**  | **Rolling Window**        | Turn-based proactive compression (10-turn window).             | Medium     | 🟡 Medium   | 2-3 days    |
| **P7**  | **Critic Agent**          | Pre-output architecture validation sub-agent.                  | Medium     | 🟡 Medium   | 2-3 days    |
| **P8**  | **`@` References**        | User-directed context injection via `@file:`, `@git:`, etc.    | Medium     | 🟠 High     | 3-4 days    |
| **P9**  | **Knowledge Base**        | Persistent local learning store for patterns and decisions.    | High       | 🟡 Medium   | 5-7 days    |
| **P10** | **Embedding Index (RAG)** | Local vector search using Gemini embeddings + SQLite.          | Very High  | 🟢 Future   | 7-10 days   |
| **P11** | **Parallel Agents**       | Multi-agent orchestration for complex tasks.                   | Very High  | 🟢 Future   | 10+ days    |

---

## 6. Specific Rules to Enforce (The "Constitution")

This block is injected into `systemInstruction` in Smart Mode:

```markdown
<constitution>
1. **Quality First**: All generated code must be robust, error-handled, and production-ready.
2. **Testing**: You MUST generate Unit Tests for all new core logic. Target **80% code coverage**.
3. **Linting**: Ensure code complies with standard ESLint/Prettier rules. No unused variables.
4. **Architecture**:
   - Respect the folder structure.
   - Do not create circular dependencies.
   - Use `packages/core` for logic and `packages/cli` for UI.
5. **Security**: Never hardcode credentials or secrets. Use environment variables.
6. **Documentation**: Update relevant documentation when code changes are significant.
</constitution>
```

---

## 7. Key Differentiators (Our Competitive Advantages)

While competitors are heavy GUI-based IDEs, our fork can win by being:

| Advantage                  | Why It Matters                                        |
| -------------------------- | ----------------------------------------------------- |
| **Terminal-first**         | Works in SSH, Docker, CI/CD, headless servers         |
| **Fully local knowledge**  | No cloud dependency for context/knowledge (privacy)   |
| **Open-source & forkable** | Teams can customize rules, agents, and tools          |
| **Lightweight**            | No Electron overhead, runs anywhere Node.js runs      |
| **Git-native**             | Deep git integration without IDE abstraction layers   |
| **MCP ecosystem**          | Same extensibility as Cline/Cursor but terminal-first |
| **Gemini-native**          | Best-in-class Gemini model support, no adapter layer  |

---

## 8. Success Metrics

| Metric                            | Current (Baseline) | Target (Smart Mode) |
| --------------------------------- | -----------------: | ------------------: |
| File tree tokens                  |             ~3,000 |                ~800 |
| Memory tokens (startup)           |           ~10,000+ |              ~2,000 |
| Context relevance (manual review) |               ~40% |                ~85% |
| Time to first useful response     |                ~5s |                 ~3s |
| Architecture violation rate       |            Unknown |                < 5% |
| Benchmark code quality score      |           Baseline |    +30% improvement |

---

## 9. Files Modified / Created Summary

### Modified Files

- `packages/core/src/config/config.ts` — Add `smartMode` flag
- `packages/core/src/utils/getFolderStructure.ts` — Depth-limited tree
- `packages/core/src/utils/environmentContext.ts` — Active file injection
- `packages/core/src/services/contextManager.ts` — Lazy memory loading
- `packages/core/src/services/chatCompressionService.ts` — Rolling window
- `packages/core/src/prompts/snippets.ts` — Constitution renderer
- `packages/core/src/prompts/promptProvider.ts` — Wire constitution + smart
  options
- `packages/core/src/tools/ripGrep.ts` — Proactive JIT search
- `packages/cli/src/nonInteractiveCli.ts` — `--smart` CLI flag

### New Files

- `packages/core/src/services/activeFileService.ts` — Heuristic active file
  detection
- `packages/core/src/services/keywordExtractor.ts` — Query keyword extraction
- `packages/core/src/services/contextResolver.ts` — `@` reference resolution
- `packages/core/src/agents/critic-agent.ts` — Architecture validation sub-agent
- `packages/core/src/services/knowledgeBase/` — Persistent learning store
- `packages/core/src/services/embeddingIndex/` — Local vector search (future)
- `packages/core/src/agents/agent-coordinator.ts` — Parallel orchestration
  (future)
