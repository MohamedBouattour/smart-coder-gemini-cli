/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Extracts meaningful keywords from user queries for use in
 * JIT context retrieval and the Scout Agent. Handles identifier splitting
 * (camelCase, snake_case), quoted strings, file paths, and stop-word removal.
 */

/** Common English stop words that don't carry meaningful search intent. */
const STOP_WORDS = new Set([
  'a',
  'an',
  'the',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'have',
  'has',
  'had',
  'do',
  'does',
  'did',
  'will',
  'would',
  'could',
  'should',
  'may',
  'might',
  'shall',
  'can',
  'need',
  'to',
  'of',
  'in',
  'for',
  'on',
  'with',
  'at',
  'by',
  'from',
  'as',
  'into',
  'about',
  'like',
  'through',
  'after',
  'before',
  'between',
  'out',
  'above',
  'below',
  'up',
  'down',
  'and',
  'but',
  'or',
  'not',
  'no',
  'nor',
  'so',
  'yet',
  'both',
  'if',
  'then',
  'else',
  'when',
  'while',
  'where',
  'how',
  'what',
  'which',
  'who',
  'whom',
  'why',
  'this',
  'that',
  'these',
  'those',
  'it',
  'its',
  'i',
  'me',
  'my',
  'we',
  'us',
  'our',
  'you',
  'your',
  'he',
  'him',
  'his',
  'she',
  'her',
  'they',
  'them',
  'their',
  'all',
  'each',
  'every',
  'any',
  'some',
  'such',
  'more',
  'most',
  'other',
  'than',
  'too',
  'very',
  'just',
  'also',
  'now',
  'here',
  'there',
  'only',
  // Common coding-related stop words
  'please',
  'help',
  'want',
  'make',
  'create',
  'add',
  'change',
  'update',
  'modify',
  'fix',
  'implement',
  'write',
  'code',
  'file',
  'function',
  'class',
  'method',
  'new',
  'use',
  'using',
]);

/**
 * Result of keyword extraction, with keywords ranked by specificity.
 */
export interface ExtractedKeywords {
  /** All extracted keywords, ordered by specificity (most specific first). */
  keywords: string[];
  /** Quoted strings found in the query (highest priority). */
  quotedStrings: string[];
  /** File paths found in the query (high priority). */
  filePaths: string[];
  /** Identifiers (camelCase/snake_case split) found in the query. */
  identifiers: string[];
  /** General words remaining after stop-word removal. */
  generalTerms: string[];
}

/**
 * Extracts and ranks keywords from a user query for use in codebase search.
 *
 * Priority order:
 *   1. Quoted strings (exact matches)
 *   2. File paths
 *   3. Identifiers (camelCase and snake_case patterns)
 *   4. General terms (after stop-word removal)
 */
export function extractKeywords(query: string): ExtractedKeywords {
  const quotedStrings = extractQuotedStrings(query);
  const filePaths = extractFilePaths(query);
  const identifiers = extractIdentifiers(query);
  const generalTerms = extractGeneralTerms(query);

  // Combine all keywords in priority order, deduplicating
  const seen = new Set<string>();
  const keywords: string[] = [];

  const addUnique = (terms: string[]) => {
    for (const term of terms) {
      const lower = term.toLowerCase();
      if (!seen.has(lower) && lower.length > 1) {
        seen.add(lower);
        keywords.push(term);
      }
    }
  };

  addUnique(quotedStrings);
  addUnique(filePaths);
  addUnique(identifiers);
  addUnique(generalTerms);

  return {
    keywords,
    quotedStrings,
    filePaths,
    identifiers,
    generalTerms,
  };
}

/**
 * Extracts quoted strings from the query.
 * Supports both single and double quotes.
 */
function extractQuotedStrings(query: string): string[] {
  const matches: string[] = [];
  const regex = /["']([^"']+)["']/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(query)) !== null) {
    const content = match[1].trim();
    if (content.length > 0) {
      matches.push(content);
    }
  }
  return matches;
}

/**
 * Extracts file paths from the query.
 * Matches patterns like `src/utils/file.ts`, `./config.json`, or `packages/core`.
 */
function extractFilePaths(query: string): string[] {
  const matches: string[] = [];
  // Match Unix-style paths and Windows-style paths
  // Use a word boundary or whitespace lookahead to avoid capturing trailing punctuation
  const regex = /(?:\.{0,2}\/)?(?:[\w.-]+\/)+[\w.-]+(?:\.\w+)?/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(query)) !== null) {
    let filePath = match[0];
    // Strip trailing punctuation that isn't part of a file extension
    // e.g., "file.ts." at end of sentence → "file.ts"
    filePath = filePath.replace(/\.$/, '');
    if (filePath.length > 0) {
      matches.push(filePath);
    }
  }
  return matches;
}

/**
 * Extracts and splits identifiers from the query.
 * Handles camelCase, PascalCase, snake_case, and kebab-case.
 */
function extractIdentifiers(query: string): string[] {
  const results: string[] = [];

  // Find camelCase/PascalCase identifiers (2+ uppercase transitions)
  const camelRegex =
    /\b[a-z]+(?:[A-Z][a-z]+)+\b|\b[A-Z][a-z]+(?:[A-Z][a-z]+)+\b/g;
  let match: RegExpExecArray | null;
  while ((match = camelRegex.exec(query)) !== null) {
    const word = match[0];
    results.push(word); // Keep the full identifier
    // Split into component words
    const parts = word.replace(/([a-z])([A-Z])/g, '$1 $2').split(' ');
    for (const part of parts) {
      if (part.length > 2 && !STOP_WORDS.has(part.toLowerCase())) {
        results.push(part);
      }
    }
  }

  // Find snake_case identifiers
  const snakeRegex = /\b\w+(?:_\w+)+\b/g;
  while ((match = snakeRegex.exec(query)) !== null) {
    const word = match[0];
    results.push(word); // Keep the full identifier
    const parts = word.split('_');
    for (const part of parts) {
      if (part.length > 2 && !STOP_WORDS.has(part.toLowerCase())) {
        results.push(part);
      }
    }
  }

  return results;
}

/**
 * Extracts general terms from the query after removing stop words.
 * These are the lowest-priority keywords.
 */
function extractGeneralTerms(query: string): string[] {
  // Remove quoted strings and file paths, then tokenize
  const cleaned = query
    .replace(/["'][^"']*["']/g, '') // Remove quoted strings
    .replace(/(?:\.{0,2}\/)?(?:[\w.-]+\/)+[\w.-]+(?:\.\w+)?/g, '') // Remove file paths
    .replace(/[^a-zA-Z0-9_\s-]/g, ' ') // Replace punctuation with spaces
    .split(/\s+/)
    .filter((word) => word.length > 2)
    .filter((word) => !STOP_WORDS.has(word.toLowerCase()));

  return [...new Set(cleaned)];
}
