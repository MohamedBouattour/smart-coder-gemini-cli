# Smart Mode: Context Optimization & Architecture Plan

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

### Critical Bottlenecks

1.  **Static Noise**: The file tree
    (`packages/core/src/utils/environmentContext.ts`) dumps a BFS list of up to
    200 files. This includes irrelevant deep files while missing important ones
    if the project is large.
2.  **Eager Memory**: `contextManager.ts` loads _every_ `GEMINI.md` file found.
    In large monorepos, this can consume 10k+ tokens before the first user
    question.
3.  **Reactive Compression**: `chatCompressionService.ts` only wakes up when the
    context is 50% full. by then, the model may already be "distracted" by the
    noise, and the compression step is expensive (latency-wise).
4.  **Blind State**: The model has no idea what file you are actually looking at
    (Active File) unless you copy-paste it.

---

## 2. Smart Mode Architecture

**Objective**: Maximize **Relevance Density**. Shift from "Everything at once"
to **"Skeleton + Active Focus + JIT Retrieval"**.

### Proposed Data Flow (The "Smart" Loop)

```mermaid
graph TD
    A[Start Session] --> B{Light Discovery}
    B --> C[Skeleton Tree (Depth 1)]
    B --> D[Global Rules (Lint/Test)]

    E[User Query] --> F{Intent Analysis}

    F -->|Focus| G[Active File Content]
    F -->|Search| H[JIT Retrieval (Grep/Vector)]
    F -->|Memory| I[Lazy Memory Search]

    C & D & G & H & I --> J[Dynamic Context Block]

    J --> K[LLM Context Window]

    K --> L[Proactive Rolling Window]
    L --> M[Generate Response]
```

---

## 3. Implementation Details

### A. Context Gathering Improvements

#### 1. The "Skeleton" File Tree

**Problem**: Listing 200 files is wasteful. **Solution**:

- **Depth-Limited**: Show only the root level and Level 1 directories.
- **Active Path Integration**: Always expand the path to the `cwd` (Current
  Working Directory).
- **Prompt Instruction**: "I see the root directories. Usage `ls` to explore
  deeper."

#### 2. Active File Injection ("Focus Mode")

**Problem**: Users ask "Fix this function" referring to their open editor, but
the CLI doesn't see it. **Solution**:

- **Mechanism**:
  - **IDE Companion**: If connected, receive `activeFileUri` and
    `cursorPosition`.
  - **Heuristic**: If not connected, assume the last edited file or `cwd` is the
    focus.
- **Injection**: Read the content of the active file (up to 2k tokens) and place
  it in a `<active_context>` block in the prompt.

#### 3. JIT (Just-In-Time) Retrieval

**Problem**: Finding relevant code in a large codebase without dumping
everything. **Solution**:

- **Keyword Extraction**: Extract keywords from User Query (e.g., "auth", "login
  button").
- **Local Search**: Run `ripgrep` (or standard `grep`) for these keywords.
- **Snippet Selection**: detailed selection logic:
  1.  Rank matches by "density" (unique matches per line).
  2.  Expand matches to include surrounding lines (context window).
  3.  Inject top 5-10 snippets into `<retrieved_context>`.

### B. Token Optimization Strategies

#### 1. Lazy Memory Loading

- **Current**: Load `doc/GEMINI.md`, `src/GEMINI.md`, `tests/GEMINI.md`...
- **Smart Mode**:
  - Load **Global Memory** (Constitution).
  - Create an **Index** of Project Memory: "Memory available for: Testing,
    Deployment, API".
  - **Load on Demand**: If user asks about "deployment", _then_ load
    `deploy/GEMINI.md`.

#### 2. Proactive Rolling Window

- **Current**: Compress at 50% usage.
- **Smart Mode**:
  - Keep a **Strict Window** of the last ~10 turns.
  - Summarize anything older than 10 turns _immediately_ into a specific
    `<conversation_summary>` block.
  - Prevents the "sudden amnesia" effect of massive compression events.

### C. Project Awareness & Rules

#### 1. The "Constitution" (Code Quality Rules)

We need a set of non-negotiable rules that persist across all contexts.
**Mechanism**:

- Create a `GlobalConfig` or `Constitution` block that is **pinned** to the
  system prompt.
- **Content**:
  - **Linting**: "All code MUST pass standard linting."
  - **Tests**: "New logic MUST includes unit tests. Code coverage target:
    **80%**."
  - **Style**: "Follow existing patterns (DRY, SOLID)."

#### 2. "Critic" Agent (Architecture Awareness)

**Problem**: The model creates code that breaks the architecture because it
doesn't see the big picture. **Solution**:

- **Pre-Response Check**: Before showing code to the user, run a lightweight
  "Critic" pass:
  - _Input_: Proposed Code + Architecture Rules.
  - _Prompt_: "Does this code violate the Layered Architecture? Does it import
    restricted modules?"
  - _Action_: If violation, Rewrite.

---

## 4. Execution Roadmap

| Phase  | Task                  | Description                                                    | Difficulty |
| :----- | :-------------------- | :------------------------------------------------------------- | :--------- |
| **P1** | **Config & Skeleton** | Add `smartMode` flag. Implement Depth-1 File Tree.             | Low        |
| **P2** | **Active Context**    | implement `ActiveFileService` to read and inject current file. | Medium     |
| **P3** | **The Constitution**  | Create specific memory slot for Linter/Test/Coverage rules.    | Low        |
| **P4** | **JIT Retrieval**     | Implement `GrepService` and Keyword Extractor.                 | High       |
| **P5** | **Lazy Memory**       | Refactor `ContextManager` to serve an Index, not full content. | High       |

## 5. Specific Rules to Enforce (The "Constitution")

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
</constitution>
```
