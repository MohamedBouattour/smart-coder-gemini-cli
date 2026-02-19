/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  Candidate,
  Content,
  CountTokensParameters,
  CountTokensResponse,
  EmbedContentParameters,
  EmbedContentResponse,
  GenerateContentConfig,
  GenerateContentParameters,
  GenerateContentResponseUsageMetadata,
  GenerateContentResponse,
} from '@google/genai';
import type { ServerDetails } from '../telemetry/types.js';
import {
  ApiRequestEvent,
  ApiResponseEvent,
  ApiErrorEvent,
} from '../telemetry/types.js';
import { coreEvents } from '../utils/events.js';
import type { Config } from '../config/config.js';
import type { UserTierId } from '../code_assist/types.js';
import {
  logApiError,
  logApiRequest,
  logApiResponse,
} from '../telemetry/loggers.js';
import type { ContentGenerator } from './contentGenerator.js';
import { CodeAssistServer } from '../code_assist/server.js';
import { toContents } from '../code_assist/converter.js';
import { isStructuredError } from '../utils/quotaErrorDetection.js';
import { runInDevTraceSpan, type SpanMetadata } from '../telemetry/trace.js';
import { debugLogger } from '../utils/debugLogger.js';
import type { BenchmarkLog } from './benchmarkLogger.js';
import { BenchmarkLogger } from './benchmarkLogger.js';
import { ideContextStore } from '../ide/ideContext.js';

interface StructuredError {
  status: number;
}

/**
 * A decorator that wraps a ContentGenerator to add logging to API calls.
 */
export class LoggingContentGenerator implements ContentGenerator {
  constructor(
    private readonly wrapped: ContentGenerator,
    private readonly config: Config,
  ) {}

  getWrapped(): ContentGenerator {
    return this.wrapped;
  }

  get userTier(): UserTierId | undefined {
    return this.wrapped.userTier;
  }

  get userTierName(): string | undefined {
    return this.wrapped.userTierName;
  }

  private logApiRequest(
    contents: Content[],
    model: string,
    promptId: string,
    generationConfig?: GenerateContentConfig,
    serverDetails?: ServerDetails,
  ): void {
    const requestText = JSON.stringify(contents);
    logApiRequest(
      this.config,
      new ApiRequestEvent(
        model,
        {
          prompt_id: promptId,
          contents,
          generate_content_config: generationConfig,
          server: serverDetails,
        },
        requestText,
      ),
    );
  }

  private _getEndpointUrl(
    req: GenerateContentParameters,
    method: 'generateContent' | 'generateContentStream',
  ): ServerDetails {
    // Case 1: Authenticated with a Google account (`gcloud auth login`).
    // Requests are routed through the internal CodeAssistServer.
    if (this.wrapped instanceof CodeAssistServer) {
      const url = new URL(this.wrapped.getMethodUrl(method));
      const port = url.port
        ? parseInt(url.port, 10)
        : url.protocol === 'https:'
          ? 443
          : 80;
      return { address: url.hostname, port };
    }

    const genConfig = this.config.getContentGeneratorConfig();

    // Case 2: Using an API key for Vertex AI.
    if (genConfig?.vertexai) {
      const location = process.env['GOOGLE_CLOUD_LOCATION'];
      if (location) {
        return { address: `${location}-aiplatform.googleapis.com`, port: 443 };
      } else {
        return { address: 'unknown', port: 0 };
      }
    }

    // Case 3: Default to the public Gemini API endpoint.
    // This is used when an API key is provided but not for Vertex AI.
    return { address: `generativelanguage.googleapis.com`, port: 443 };
  }

  private _logApiResponse(
    requestContents: Content[],
    durationMs: number,
    model: string,
    prompt_id: string,
    responseId: string | undefined,
    responseCandidates?: Candidate[],
    usageMetadata?: GenerateContentResponseUsageMetadata,
    responseText?: string,
    generationConfig?: GenerateContentConfig,
    serverDetails?: ServerDetails,
  ): void {
    logApiResponse(
      this.config,
      new ApiResponseEvent(
        model,
        durationMs,
        {
          prompt_id,
          contents: requestContents,
          generate_content_config: generationConfig,
          server: serverDetails,
        },
        {
          candidates: responseCandidates,
          response_id: responseId,
        },
        this.config.getContentGeneratorConfig()?.authType,
        usageMetadata,
        responseText,
      ),
    );

    if (usageMetadata) {
      coreEvents.emitConsoleLog(
        'info',
        `Token Usage: Input=${usageMetadata.promptTokenCount ?? 0}, Output=${usageMetadata.candidatesTokenCount ?? 0}, Total=${usageMetadata.totalTokenCount ?? 0}`,
      );
    }
  }

  private _logApiError(
    durationMs: number,
    error: unknown,
    model: string,
    prompt_id: string,
    requestContents: Content[],
    generationConfig?: GenerateContentConfig,
    serverDetails?: ServerDetails,
  ): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorType = error instanceof Error ? error.name : 'unknown';

    logApiError(
      this.config,
      new ApiErrorEvent(
        model,
        errorMessage,
        durationMs,
        {
          prompt_id,
          contents: requestContents,
          generate_content_config: generationConfig,
          server: serverDetails,
        },
        this.config.getContentGeneratorConfig()?.authType,
        errorType,
        isStructuredError(error)
          ? // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
            (error as StructuredError).status
          : undefined,
      ),
    );
  }

  /**
   * Gathers context data for benchmark logging by inspecting
   * the current state of system prompt, file tree, memory, chat history, and IDE context.
   */
  private gatherContextData(
    contents: Content[],
  ): BenchmarkLog['contextBreakdown'] & {
    memoryFiles: BenchmarkLog['memoryFiles'];
    contextFiles: string[];
    toolCount: number;
    compressionTriggered: boolean;
    ideConnected: boolean;
  } {
    const contextManager = this.config.getContextManager();

    // Memory file details
    const memoryFiles = contextManager?.getMemoryFileDetails()
      ? [...contextManager.getMemoryFileDetails()]
      : [];

    // Context files (loaded paths)
    const contextFiles = contextManager
      ? Array.from(contextManager.getLoadedPaths())
      : (this.config.getGeminiMdFilePaths?.() ?? []);

    // Memory size breakdown
    const memoryBreakdown = contextManager?.getMemorySizeBreakdown();
    const memoryChars = memoryBreakdown?.totalChars ?? 0;

    // System prompt (approximate from config)
    // The system instruction is built fresh each call, we estimate from memory sizes
    const systemPromptChars = memoryChars; // memo portion

    // Chat history analysis
    let chatHistoryChars = 0;
    let chatHistoryTurns = 0;
    for (const content of contents) {
      chatHistoryTurns++;
      for (const part of content.parts ?? []) {
        if ('text' in part && typeof part.text === 'string') {
          chatHistoryChars += part.text.length;
        }
        if ('functionCall' in part) {
          chatHistoryChars += JSON.stringify(part.functionCall).length;
        }
        if ('functionResponse' in part) {
          chatHistoryChars += JSON.stringify(part.functionResponse).length;
        }
      }
    }

    // File tree: the first user message typically contains <session_context> with the tree
    let fileTreeChars = 0;
    let environmentContextChars = 0;
    if (contents.length > 0 && contents[0].role === 'user') {
      const firstMsgText = contents[0].parts
        ?.map((p) => ('text' in p ? (p.text ?? '') : ''))
        .join('');
      if (firstMsgText) {
        environmentContextChars = firstMsgText.length;
        const treeMatch = firstMsgText.match(
          /- \*\*Directory Structure:\*\*[\s\S]*?(?=<\/session_context>|$)/,
        );
        if (treeMatch) {
          fileTreeChars = treeMatch[0].length;
        }
      }
    }

    // IDE context
    const ideContext = ideContextStore.get();
    const ideConnected = !!ideContext?.workspaceState;
    const ideContextChars = ideContext ? JSON.stringify(ideContext).length : 0;

    // Tool count
    let toolCount = 0;
    try {
      toolCount = this.config.getToolRegistry()?.getAllToolNames()?.length ?? 0;
    } catch {
      // Tool registry may not be available in all contexts
    }

    return {
      systemPromptChars,
      fileTreeChars,
      memoryChars,
      environmentContextChars,
      chatHistoryChars,
      chatHistoryTurns,
      ideContextChars,
      memoryFiles,
      contextFiles,
      toolCount,
      compressionTriggered: false, // Will be set by caller if applicable
      ideConnected,
    };
  }

  /**
   * Emits a detailed context summary to the console log.
   */
  private emitContextSummary(
    promptId: string,
    model: string,
    payloadSize: number,
    contextData: ReturnType<typeof this.gatherContextData>,
  ): void {
    const lines = [
      `┌─ Generation Request ─────────────────────────`,
      `│ Prompt ID:     ${promptId}`,
      `│ Model:         ${model}`,
      `│ Payload:       ${payloadSize.toLocaleString()} chars`,
      `│ ┌─ Context Breakdown ───`,
      `│ │ Environment:  ${contextData.environmentContextChars.toLocaleString()} chars`,
      `│ │ File Tree:    ${contextData.fileTreeChars.toLocaleString()} chars`,
      `│ │ Memory:       ${contextData.memoryChars.toLocaleString()} chars (${contextData.memoryFiles.length} files)`,
      `│ │ Chat History: ${contextData.chatHistoryChars.toLocaleString()} chars (${contextData.chatHistoryTurns} turns)`,
      `│ │ IDE Context:  ${contextData.ideConnected ? `${contextData.ideContextChars.toLocaleString()} chars` : 'not connected'}`,
      `│ └─ Tools: ${contextData.toolCount}`,
      `└──────────────────────────────────────────────`,
    ];
    coreEvents.emitConsoleLog('info', lines.join('\n'));
  }

  async generateContent(
    req: GenerateContentParameters,
    userPromptId: string,
  ): Promise<GenerateContentResponse> {
    return runInDevTraceSpan(
      {
        name: 'generateContent',
      },
      async ({ metadata: spanMetadata }) => {
        spanMetadata.input = { request: req, userPromptId, model: req.model };

        const startTime = Date.now();
        const contents: Content[] = toContents(req.contents);
        const serverDetails = this._getEndpointUrl(req, 'generateContent');
        this.logApiRequest(
          contents,
          req.model,
          userPromptId,
          req.config,
          serverDetails,
        );

        const payloadSize = JSON.stringify(contents).length;
        const contextData = this.gatherContextData(contents);
        this.emitContextSummary(
          userPromptId,
          req.model,
          payloadSize,
          contextData,
        );

        try {
          const response = await this.wrapped.generateContent(
            req,
            userPromptId,
          );
          spanMetadata.output = {
            response,
            usageMetadata: response.usageMetadata,
          };
          const durationMs = Date.now() - startTime;
          this._logApiResponse(
            contents,
            durationMs,
            response.modelVersion || req.model,
            userPromptId,
            response.responseId,
            response.candidates,
            response.usageMetadata,
            JSON.stringify({
              candidates: response.candidates,
              usageMetadata: response.usageMetadata,
              responseId: response.responseId,
              modelVersion: response.modelVersion,
              promptFeedback: response.promptFeedback,
            }),
            req.config,
            serverDetails,
          );

          const benchmarkLogger = new BenchmarkLogger(
            this.config.getProjectRoot(),
          );
          const benchmarkEntry: BenchmarkLog = {
            timestamp: new Date().toISOString(),
            promptId: userPromptId,
            contextFiles: contextData.contextFiles,
            memoryFiles: contextData.memoryFiles,
            tokens: {
              input: response.usageMetadata?.promptTokenCount ?? 0,
              output: response.usageMetadata?.candidatesTokenCount ?? 0,
              total: response.usageMetadata?.totalTokenCount ?? 0,
              cached: response.usageMetadata?.cachedContentTokenCount,
            },
            contextBreakdown: {
              systemPromptChars: contextData.systemPromptChars,
              fileTreeChars: contextData.fileTreeChars,
              memoryChars: contextData.memoryChars,
              environmentContextChars: contextData.environmentContextChars,
              chatHistoryChars: contextData.chatHistoryChars,
              chatHistoryTurns: contextData.chatHistoryTurns,
              ideContextChars: contextData.ideContextChars,
            },
            model: response.modelVersion || req.model,
            durationMs,
            requestPayloadSize: payloadSize,
            toolCount: contextData.toolCount,
            status: 'success',
            compressionTriggered: contextData.compressionTriggered,
            ideConnected: contextData.ideConnected,
            platform: process.platform,
          };
          benchmarkLogger
            .log(benchmarkEntry)
            .catch((err: unknown) =>
              debugLogger.debug('Failed to log benchmark result', err),
            );

          this.config
            .refreshUserQuotaIfStale()
            .catch((e) => debugLogger.debug('quota refresh failed', e));
          return response;
        } catch (error) {
          const durationMs = Date.now() - startTime;
          this._logApiError(
            durationMs,
            error,
            req.model,
            userPromptId,
            contents,
            req.config,
            serverDetails,
          );

          // Also log errors to benchmark
          const benchmarkLogger = new BenchmarkLogger(
            this.config.getProjectRoot(),
          );
          const benchmarkEntry: BenchmarkLog = {
            timestamp: new Date().toISOString(),
            promptId: userPromptId,
            contextFiles: contextData.contextFiles,
            memoryFiles: contextData.memoryFiles,
            tokens: {},
            contextBreakdown: {
              systemPromptChars: contextData.systemPromptChars,
              fileTreeChars: contextData.fileTreeChars,
              memoryChars: contextData.memoryChars,
              environmentContextChars: contextData.environmentContextChars,
              chatHistoryChars: contextData.chatHistoryChars,
              chatHistoryTurns: contextData.chatHistoryTurns,
              ideContextChars: contextData.ideContextChars,
            },
            model: req.model,
            durationMs,
            requestPayloadSize: payloadSize,
            toolCount: contextData.toolCount,
            status: 'error',
            errorMessage:
              error instanceof Error ? error.message : String(error),
            compressionTriggered: contextData.compressionTriggered,
            ideConnected: contextData.ideConnected,
            platform: process.platform,
          };
          benchmarkLogger
            .log(benchmarkEntry)
            .catch((err: unknown) =>
              debugLogger.debug('Failed to log benchmark error', err),
            );

          throw error;
        }
      },
    );
  }

  async generateContentStream(
    req: GenerateContentParameters,
    userPromptId: string,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    return runInDevTraceSpan(
      {
        name: 'generateContentStream',
        noAutoEnd: true,
      },
      async ({ metadata: spanMetadata, endSpan }) => {
        spanMetadata.input = { request: req, userPromptId, model: req.model };
        const startTime = Date.now();
        const serverDetails = this._getEndpointUrl(
          req,
          'generateContentStream',
        );

        // For debugging: Capture the latest main agent request payload.
        // Main agent prompt IDs end with exactly 8 hashes and a turn counter (e.g. "...########1")
        if (/########\d+$/.test(userPromptId)) {
          this.config.setLatestApiRequest(req);
        }

        const contents = toContents(req.contents);
        this.logApiRequest(
          contents,
          req.model,
          userPromptId,
          req.config,
          serverDetails,
        );

        const payloadSize = JSON.stringify(contents).length;
        const contextData = this.gatherContextData(contents);
        this.emitContextSummary(
          userPromptId,
          req.model,
          payloadSize,
          contextData,
        );

        let stream: AsyncGenerator<GenerateContentResponse>;
        try {
          stream = await this.wrapped.generateContentStream(req, userPromptId);
        } catch (error) {
          const durationMs = Date.now() - startTime;
          this._logApiError(
            durationMs,
            error,
            req.model,
            userPromptId,
            toContents(req.contents),
            req.config,
            serverDetails,
          );
          throw error;
        }

        return this.loggingStreamWrapper(
          req,
          stream,
          startTime,
          userPromptId,
          spanMetadata,
          endSpan,
        );
      },
    );
  }

  private async *loggingStreamWrapper(
    req: GenerateContentParameters,
    stream: AsyncGenerator<GenerateContentResponse>,
    startTime: number,
    userPromptId: string,
    spanMetadata: SpanMetadata,
    endSpan: () => void,
  ): AsyncGenerator<GenerateContentResponse> {
    const responses: GenerateContentResponse[] = [];

    let lastUsageMetadata: GenerateContentResponseUsageMetadata | undefined;
    const serverDetails = this._getEndpointUrl(req, 'generateContentStream');
    const requestContents: Content[] = toContents(req.contents);
    try {
      for await (const response of stream) {
        responses.push(response);
        if (response.usageMetadata) {
          lastUsageMetadata = response.usageMetadata;
        }
        yield response;
      }
      // Only log successful API response if no error occurred
      const durationMs = Date.now() - startTime;
      this._logApiResponse(
        requestContents,
        durationMs,
        responses[0]?.modelVersion || req.model,
        userPromptId,
        responses[0]?.responseId,
        responses.flatMap((response) => response.candidates || []),
        lastUsageMetadata,
        JSON.stringify(
          responses.map((r) => ({
            candidates: r.candidates,
            usageMetadata: r.usageMetadata,
            responseId: r.responseId,
            modelVersion: r.modelVersion,
            promptFeedback: r.promptFeedback,
          })),
        ),
        req.config,
        serverDetails,
      );
      this.config
        .refreshUserQuotaIfStale()
        .catch((e) => debugLogger.debug('quota refresh failed', e));

      const benchmarkLogger = new BenchmarkLogger(this.config.getProjectRoot());
      const contextData = this.gatherContextData(requestContents);
      const benchmarkEntry: BenchmarkLog = {
        timestamp: new Date().toISOString(),
        promptId: userPromptId,
        contextFiles: contextData.contextFiles,
        memoryFiles: contextData.memoryFiles,
        tokens: {
          input: lastUsageMetadata?.promptTokenCount ?? 0,
          output: lastUsageMetadata?.candidatesTokenCount ?? 0,
          total: lastUsageMetadata?.totalTokenCount ?? 0,
          cached: lastUsageMetadata?.cachedContentTokenCount,
        },
        contextBreakdown: {
          systemPromptChars: contextData.systemPromptChars,
          fileTreeChars: contextData.fileTreeChars,
          memoryChars: contextData.memoryChars,
          environmentContextChars: contextData.environmentContextChars,
          chatHistoryChars: contextData.chatHistoryChars,
          chatHistoryTurns: contextData.chatHistoryTurns,
          ideContextChars: contextData.ideContextChars,
        },
        model: responses[0]?.modelVersion || req.model,
        durationMs,
        requestPayloadSize: JSON.stringify(requestContents).length,
        toolCount: contextData.toolCount,
        status: 'success',
        compressionTriggered: contextData.compressionTriggered,
        ideConnected: contextData.ideConnected,
        platform: process.platform,
      };
      benchmarkLogger
        .log(benchmarkEntry)
        .catch((err: unknown) =>
          debugLogger.debug('Failed to log benchmark result', err),
        );

      spanMetadata.output = {
        streamChunks: responses.map((r) => ({
          content: r.candidates?.[0]?.content ?? null,
        })),
        usageMetadata: lastUsageMetadata,
        durationMs,
      };
    } catch (error) {
      spanMetadata.error = error;
      const durationMs = Date.now() - startTime;
      const benchmarkLogger = new BenchmarkLogger(this.config.getProjectRoot());
      const contextData = this.gatherContextData(requestContents);
      const benchmarkEntry: BenchmarkLog = {
        timestamp: new Date().toISOString(),
        promptId: userPromptId,
        contextFiles: contextData.contextFiles,
        memoryFiles: contextData.memoryFiles,
        tokens: {},
        contextBreakdown: {
          systemPromptChars: contextData.systemPromptChars,
          fileTreeChars: contextData.fileTreeChars,
          memoryChars: contextData.memoryChars,
          environmentContextChars: contextData.environmentContextChars,
          chatHistoryChars: contextData.chatHistoryChars,
          chatHistoryTurns: contextData.chatHistoryTurns,
          ideContextChars: contextData.ideContextChars,
        },
        model: responses[0]?.modelVersion || req.model,
        durationMs: Date.now() - startTime,
        requestPayloadSize: JSON.stringify(requestContents).length,
        toolCount: contextData.toolCount,
        status: 'error',
        errorMessage: String(error),
        compressionTriggered: contextData.compressionTriggered,
        ideConnected: contextData.ideConnected,
        platform: process.platform,
      };
      benchmarkLogger
        .log(benchmarkEntry)
        .catch((err: unknown) =>
          debugLogger.debug('Failed to log benchmark result', err),
        );

      this._logApiError(
        durationMs,
        error,
        responses[0]?.modelVersion || req.model,
        userPromptId,
        requestContents,
        req.config,
        serverDetails,
      );
      throw error;
    } finally {
      endSpan();
    }
  }

  async countTokens(req: CountTokensParameters): Promise<CountTokensResponse> {
    return this.wrapped.countTokens(req);
  }

  async embedContent(
    req: EmbedContentParameters,
  ): Promise<EmbedContentResponse> {
    return runInDevTraceSpan(
      {
        name: 'embedContent',
      },
      async ({ metadata: spanMetadata }) => {
        spanMetadata.input = { request: req };
        const output = await this.wrapped.embedContent(req);
        spanMetadata.output = output;
        return output;
      },
    );
  }
}
