/**
 * Hand-picked re-exports from the generated Codex app-server protocol
 * (`pnpm gen:protocol`), plus the message envelope the Rust bridge emits.
 */
export type {
  ThreadStartParams,
  ThreadStartResponse,
  ThreadResumeParams,
  ThreadResumeResponse,
  ThreadInjectItemsParams,
  ThreadListParams,
  ThreadListResponse,
  ThreadSetNameParams,
  ThreadArchiveParams,
  Thread,
  ThreadItem,
  ThreadStatus,
  Turn,
  TurnStatus,
  TurnError,
  TurnStartParams,
  TurnStartResponse,
  TurnSteerParams,
  ReviewStartParams,
  ReviewStartResponse,
  TurnPlanStep,
  ThreadTokenUsage,
  TurnInterruptParams,
  UserInput,
  Model,
  ModelListResponse,
  AskForApproval,
  SandboxMode,
  ApprovalsReviewer,
  ThreadStartedNotification,
  ThreadStatusChangedNotification,
  TurnStartedNotification,
  TurnCompletedNotification,
  ItemStartedNotification,
  ItemCompletedNotification,
  AgentMessageDeltaNotification,
  CommandExecutionOutputDeltaNotification,
  ReasoningSummaryTextDeltaNotification,
  ServerRequestResolvedNotification,
  ErrorNotification,
  CommandExecutionRequestApprovalParams,
  CommandExecutionRequestApprovalResponse,
  FileChangeRequestApprovalParams,
  FileChangeRequestApprovalResponse,
  PermissionsRequestApprovalParams,
  PermissionsRequestApprovalResponse,
  ToolRequestUserInputParams,
  ToolRequestUserInputResponse,
  McpServerElicitationRequestParams,
  McpServerElicitationRequestResponse,
  FileUpdateChange,
} from "./generated/v2";
export type { InitializeParams, InitializeResponse, Personality, ReasoningEffort, RequestId, ServerRequest } from "./generated";

import type { RequestId } from "./generated";

/** Messages the Rust `CodexClient` pushes through the Tauri channel. */
export type BridgeMessage =
  | { type: "request"; id: RequestId; method: string; params: unknown }
  | { type: "notification"; method: string; params: unknown }
  | { type: "exited"; generation: number; code: number | null; stderrTail: string[] }
  | { type: "stderr"; line: string }
  | { type: "stdout"; line: string }
  | { type: "orphanResponse"; message: unknown };

/** Server→client requests the UI answers interactively. */
export const INTERACTIVE_SERVER_REQUESTS = [
  "item/commandExecution/requestApproval",
  "item/fileChange/requestApproval",
  "item/tool/requestUserInput",
  "mcpServer/elicitation/request",
  "item/permissions/requestApproval",
] as const;
export type InteractiveServerRequestMethod = (typeof INTERACTIVE_SERVER_REQUESTS)[number];

/** Every server→client request method known to the stable protocol. */
export const ALL_SERVER_REQUESTS = [
  ...INTERACTIVE_SERVER_REQUESTS,
  "item/tool/call",
  "account/chatgptAuthTokens/refresh",
  "attestation/generate",
  "applyPatchApproval",
  "execCommandApproval",
] as const;
export type { DynamicToolSpec } from './generated/v2/DynamicToolSpec';
export type { DynamicToolCallParams } from './generated/v2/DynamicToolCallParams';
export type { DynamicToolCallResponse } from './generated/v2/DynamicToolCallResponse';
