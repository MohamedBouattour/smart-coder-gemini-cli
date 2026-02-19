/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { extractKeywords } from './keywordExtractor.js';

describe('extractKeywords', () => {
  it('should extract quoted strings with highest priority', () => {
    const result = extractKeywords('Fix the "login button" color');
    expect(result.quotedStrings).toContain('login button');
    expect(result.keywords[0]).toBe('login button');
  });

  it('should extract file paths', () => {
    const result = extractKeywords('Update the src/utils/validators.ts file');
    expect(result.filePaths).toContain('src/utils/validators.ts');
  });

  it('should extract and split camelCase identifiers', () => {
    const result = extractKeywords(
      'The validateEmailAddress function is broken',
    );
    expect(result.identifiers).toContain('validateEmailAddress');
    // Should also contain split parts
    expect(result.identifiers).toContain('validate');
    expect(result.identifiers).toContain('Email');
    expect(result.identifiers).toContain('Address');
  });

  it('should extract and split snake_case identifiers', () => {
    const result = extractKeywords(
      'Check the user_authentication_service module',
    );
    expect(result.identifiers).toContain('user_authentication_service');
    expect(result.identifiers).toContain('authentication');
    expect(result.identifiers).toContain('service');
  });

  it('should remove stop words from general terms', () => {
    const result = extractKeywords('I want to add a new feature');
    expect(result.generalTerms).not.toContain('want');
    expect(result.generalTerms).not.toContain('add');
    expect(result.generalTerms).toContain('feature');
  });

  it('should deduplicate keywords', () => {
    const result = extractKeywords(
      '"validators" found in src/utils/validators.ts',
    );
    const lowered = result.keywords.map((k) => k.toLowerCase());
    const unique = new Set(lowered);
    expect(unique.size).toBe(lowered.length);
  });

  it('should filter out single-character keywords', () => {
    const result = extractKeywords('a b c function');
    for (const keyword of result.keywords) {
      expect(keyword.length).toBeGreaterThan(1);
    }
  });

  it('should handle empty input', () => {
    const result = extractKeywords('');
    expect(result.keywords).toHaveLength(0);
  });

  it('should handle a complex real-world query', () => {
    const result = extractKeywords(
      'Fix the login button color in src/components/AuthForm.tsx. The "primary-button" class needs updating.',
    );
    expect(result.quotedStrings).toContain('primary-button');
    expect(result.filePaths).toContain('src/components/AuthForm.tsx');
    expect(result.keywords.length).toBeGreaterThan(0);
    // First keyword should be the quoted string (highest priority)
    expect(result.keywords[0]).toBe('primary-button');
  });

  it('should extract PascalCase identifiers', () => {
    const result = extractKeywords(
      'The UserAuthenticationService needs a new method',
    );
    expect(result.identifiers).toContain('UserAuthenticationService');
  });

  it('should maintain priority order: quoted > paths > identifiers > general', () => {
    const result = extractKeywords(
      '"error handler" in src/utils/errors.ts has validateInput issues',
    );
    // Quoted strings first
    expect(result.keywords.indexOf('error handler')).toBeLessThan(
      result.keywords.indexOf('src/utils/errors.ts'),
    );
  });
});
