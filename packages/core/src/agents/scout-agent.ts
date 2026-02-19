/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview The Scout Agent — a lightweight sub-agent that identifies
 * the most relevant files for a given user objective. It runs _before_
 * any code generation to provide targeted "Active Context" to the main agent.
 *
 * Part of the Brain Loop Architecture:
 *   INGEST → [LOCATE (Scout)] → AUDIT → GENERATE → APPLY
 */

import type { LocalAgentDefinition } from './types.js';
import {
  GLOB_TOOL_NAME,
  GREP_TOOL_NAME,
  LS_TOOL_NAME,
  READ_FILE_TOOL_NAME,
} from '../tools/tool-names.js';
import {
  PREVIEW_GEMINI_FLASH_MODEL,
  DEFAULT_GEMINI_MODEL,
  supportsModernFeatures,
} from '../config/models.js';
import { z } from 'zod';
import type { Config } from '../config/config.js';

/**
 * Schema for the Scout Agent's output — a list of file paths with reasoning.
 */
const ScoutReportSchema = z.object({
  TargetFiles: z
    .array(
      z.object({
        FilePath: z
          .string()
          .describe('The relative path to the file from the project root.'),
        Relevance: z
          .enum(['primary', 'secondary', 'related'])
          .describe(
            'How relevant this file is: primary (must modify), secondary (likely affected), related (context only).',
          ),
        Reasoning: z
          .string()
          .describe('Why this file is relevant to the objective.'),
        KeySymbols: z
          .array(z.string())
          .describe(
            'Important functions, classes, or exports in this file relevant to the task.',
          ),
      }),
    )
    .describe(
      'Files identified as relevant to the objective, ordered by relevance.',
    ),
  SearchStrategy: z
    .string()
    .describe(
      'Brief description of how you located these files (keywords used, patterns followed).',
    ),
  SuggestedApproach: z
    .string()
    .describe(
      'A brief architectural suggestion for how to implement the requested change.',
    ),
});

/**
 * A fast, lightweight sub-agent specialized in locating the right files
 * for a given task. Uses Gemini Flash for speed (typically < 1 second).
 *
 * Unlike the CodebaseInvestigator which does deep analysis, the Scout Agent
 * is designed for breadth-first discovery with minimal latency.
 */
export const ScoutAgent = (
  config: Config,
): LocalAgentDefinition<typeof ScoutReportSchema> => {
  // Always use Flash for speed — the Scout must be fast
  const model = supportsModernFeatures(config.getModel())
    ? PREVIEW_GEMINI_FLASH_MODEL
    : DEFAULT_GEMINI_MODEL;

  return {
    name: 'scout_agent',
    kind: 'local',
    displayName: 'Scout Agent',
    description: `A fast file-finding agent that identifies which files need to be modified for a given task.
    Use this when you need to quickly locate the right files before making changes.
    It returns a ranked list of target files with reasoning and suggested approach.
    Much faster than the full Codebase Investigator — use it for targeted file discovery.`,
    inputConfig: {
      inputSchema: {
        type: 'object',
        properties: {
          objective: {
            type: 'string',
            description: `The user's objective. What are they trying to accomplish?`,
          },
          fileTree: {
            type: 'string',
            description: `The project file tree (skeleton). Used for initial orientation.`,
          },
          keywords: {
            type: 'string',
            description: `Comma-separated keywords extracted from the user's query.`,
          },
        },
        required: ['objective'],
      },
    },
    outputConfig: {
      outputName: 'report',
      description:
        'A ranked list of files relevant to the objective, with reasoning.',
      schema: ScoutReportSchema,
    },

    processOutput: (output) => JSON.stringify(output, null, 2),

    modelConfig: {
      model,
      generateContentConfig: {
        temperature: 0.0, // Deterministic — we want consistent file targeting
        topP: 0.9,
      },
    },

    runConfig: {
      maxTimeMinutes: 1, // Must be fast — this runs BEFORE the main generation
      maxTurns: 5, // Limited exploration — breadth over depth
    },

    toolConfig: {
      // Read-only tools only — the Scout never writes
      tools: [
        LS_TOOL_NAME,
        READ_FILE_TOOL_NAME,
        GLOB_TOOL_NAME,
        GREP_TOOL_NAME,
      ],
    },

    promptConfig: {
      query: `Your mission: Find the files most likely to be modified for this objective.

<objective>
\${objective}
</objective>

<project_tree>
\${fileTree}
</project_tree>

<search_keywords>
\${keywords}
</search_keywords>

Start by using grep to search for the keywords. Then use glob and ls to explore the directory structure around matches. Read only the key files needed to understand the architecture.`,

      systemPrompt: `You are **Scout Agent**, a fast file-finding specialist within a larger AI coding system.

## Your SOLE PURPOSE
Find the **minimal, complete set of files** that need to be modified or understood for a given coding task. You are the first step in a pipeline — your output directly determines which files the main coding agent will focus on.

## Core Principles
1. **SPEED OVER DEPTH**: You have 1 minute and 5 tool calls max. Be surgical, not exhaustive.
2. **KEYWORD-FIRST**: Start with grep for the provided keywords. Follow imports and references from there.
3. **RANK BY RELEVANCE**: Classify each file as:
   - \`primary\`: Must be modified to complete the task
   - \`secondary\`: Likely affected (callers, tests, types)  
   - \`related\`: Provides context but won't be modified
4. **IDENTIFY KEY SYMBOLS**: For each file, note the specific functions, classes, or exports that matter.
5. **SUGGEST APPROACH**: Briefly describe how you'd structure the implementation.

## Strategy
1. Search keywords with \`grep\` to find matching files
2. Use \`glob\` to find related files (tests, types, configs)
3. Read the top candidate files to verify relevance and identify key symbols
4. Submit your report via \`complete_task\`

## Rules
- Return at most **10 files** (prefer 3-5)
- Do NOT read entire files — scan for the important parts
- Do NOT write code — you are a scout, not an implementer
- If you can't find relevant files, say so honestly
`,
    },
  };
};
