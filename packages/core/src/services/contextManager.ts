/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  loadJitSubdirectoryMemory,
  concatenateInstructions,
  getGlobalMemoryPaths,
  getExtensionMemoryPaths,
  getEnvironmentMemoryPaths,
  readGeminiMdFiles,
  categorizeAndConcatenate,
  type GeminiFileContent,
} from '../utils/memoryDiscovery.js';
import type { Config } from '../config/config.js';
import { coreEvents, CoreEvent } from '../utils/events.js';
import type { MemoryFileDetail } from '../core/benchmarkLogger.js';

export class ContextManager {
  private readonly loadedPaths: Set<string> = new Set();
  private readonly config: Config;
  private globalMemory: string = '';
  private extensionMemory: string = '';
  private projectMemory: string = '';
  private memoryFileDetails: MemoryFileDetail[] = [];

  constructor(config: Config) {
    this.config = config;
  }

  /**
   * Refreshes the memory by reloading global, extension, and project memory.
   */
  async refresh(): Promise<void> {
    this.loadedPaths.clear();
    this.memoryFileDetails = [];
    const debugMode = this.config.getDebugMode();

    const paths = await this.discoverMemoryPaths(debugMode);
    const contentsMap = await this.loadMemoryContents(paths, debugMode);

    this.buildMemoryFileDetails(paths, contentsMap);
    this.categorizeMemoryContents(paths, contentsMap);
    this.emitMemoryChanged();
  }

  private async discoverMemoryPaths(debugMode: boolean) {
    const [global, extension, project] = await Promise.all([
      getGlobalMemoryPaths(debugMode),
      Promise.resolve(
        getExtensionMemoryPaths(this.config.getExtensionLoader()),
      ),
      this.config.isTrustedFolder()
        ? getEnvironmentMemoryPaths(
            [...this.config.getWorkspaceContext().getDirectories()],
            debugMode,
          )
        : Promise.resolve([]),
    ]);

    return { global, extension, project };
  }

  private async loadMemoryContents(
    paths: { global: string[]; extension: string[]; project: string[] },
    debugMode: boolean,
  ) {
    const allPaths = Array.from(
      new Set([...paths.global, ...paths.extension, ...paths.project]),
    );

    const allContents = await readGeminiMdFiles(
      allPaths,
      debugMode,
      this.config.getImportFormat(),
    );

    const loadedFiles = allContents.filter((c) => c.content !== null);
    const filePaths = loadedFiles.map((c) => c.filePath);

    if (filePaths.length > 0) {
      const fileDetails = loadedFiles.map(
        (c) =>
          `  ${c.filePath} (${(c.content?.length ?? 0).toLocaleString()} chars)`,
      );
      const totalChars = loadedFiles.reduce(
        (sum, c) => sum + (c.content?.length ?? 0),
        0,
      );
      coreEvents.emitConsoleLog(
        'info',
        `Context gathering: Loaded ${filePaths.length} memory files (${totalChars.toLocaleString()} chars total):\n${fileDetails.join('\n')}`,
      );
    } else {
      coreEvents.emitConsoleLog(
        'info',
        'Context gathering: No memory files loaded.',
      );
    }

    this.markAsLoaded(filePaths);

    return new Map(allContents.map((c) => [c.filePath, c]));
  }

  private categorizeMemoryContents(
    paths: { global: string[]; extension: string[]; project: string[] },
    contentsMap: Map<string, GeminiFileContent>,
  ) {
    const workingDir = this.config.getWorkingDir();
    const hierarchicalMemory = categorizeAndConcatenate(
      paths,
      contentsMap,
      workingDir,
    );

    this.globalMemory = hierarchicalMemory.global || '';
    this.extensionMemory = hierarchicalMemory.extension || '';

    const mcpInstructions =
      this.config.getMcpClientManager()?.getMcpInstructions() || '';
    const projectMemoryWithMcp = [
      hierarchicalMemory.project,
      mcpInstructions.trimStart(),
    ]
      .filter(Boolean)
      .join('\n\n');

    this.projectMemory = this.config.isTrustedFolder()
      ? projectMemoryWithMcp
      : '';
  }

  /**
   * Discovers and loads context for a specific accessed path (Tier 3 - JIT).
   * Traverses upwards from the accessed path to the project root.
   */
  async discoverContext(
    accessedPath: string,
    trustedRoots: string[],
  ): Promise<string> {
    if (!this.config.isTrustedFolder()) {
      return '';
    }
    const result = await loadJitSubdirectoryMemory(
      accessedPath,
      trustedRoots,
      this.loadedPaths,
      this.config.getDebugMode(),
    );

    if (result.files.length === 0) {
      return '';
    }

    this.markAsLoaded(result.files.map((f) => f.path));
    return concatenateInstructions(
      result.files.map((f) => ({ filePath: f.path, content: f.content })),
      this.config.getWorkingDir(),
    );
  }

  private emitMemoryChanged(): void {
    coreEvents.emit(CoreEvent.MemoryChanged, {
      fileCount: this.loadedPaths.size,
    });
  }

  getGlobalMemory(): string {
    return this.globalMemory;
  }

  getExtensionMemory(): string {
    return this.extensionMemory;
  }

  getEnvironmentMemory(): string {
    return this.projectMemory;
  }

  private markAsLoaded(paths: string[]): void {
    paths.forEach((p) => this.loadedPaths.add(p));
  }

  getLoadedPaths(): ReadonlySet<string> {
    return this.loadedPaths;
  }

  /**
   * Returns detailed information about each loaded memory file,
   * including its tier and character count.
   */
  getMemoryFileDetails(): readonly MemoryFileDetail[] {
    return this.memoryFileDetails;
  }

  /**
   * Returns a summary of memory sizes by tier.
   */
  getMemorySizeBreakdown(): {
    globalChars: number;
    extensionChars: number;
    projectChars: number;
    totalChars: number;
    fileCount: number;
  } {
    const globalChars = this.globalMemory.length;
    const extensionChars = this.extensionMemory.length;
    const projectChars = this.projectMemory.length;
    return {
      globalChars,
      extensionChars,
      projectChars,
      totalChars: globalChars + extensionChars + projectChars,
      fileCount: this.loadedPaths.size,
    };
  }

  /**
   * Builds the detailed file list with tier classification and size.
   */
  private buildMemoryFileDetails(
    paths: { global: string[]; extension: string[]; project: string[] },
    contentsMap: Map<string, GeminiFileContent>,
  ): void {
    const globalSet = new Set(paths.global);
    const extensionSet = new Set(paths.extension);

    this.memoryFileDetails = [];
    for (const [filePath, content] of contentsMap) {
      if (content.content === null) continue;

      let tier: 'global' | 'extension' | 'project' = 'project';
      if (globalSet.has(filePath)) {
        tier = 'global';
      } else if (extensionSet.has(filePath)) {
        tier = 'extension';
      }

      this.memoryFileDetails.push({
        path: filePath,
        tier,
        chars: content.content.length,
      });
    }
  }
}
