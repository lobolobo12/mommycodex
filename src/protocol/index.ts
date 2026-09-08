/**
 * Hand-picked re-exports from the generated Codex app-server protocol
 * (`pnpm gen:protocol`), plus the message envelope the Rust bridge emits.
 */
export type { ThreadStartParams } from "./generated/v2/ThreadStartParams";
export type { ThreadStartResponse } from "./generated/v2/ThreadStartResponse";
export type { ThreadResumeParams } from "./generated/v2/ThreadResumeParams";
export type { ThreadResumeResponse } from "./generated/v2/ThreadResumeResponse";
export type { ThreadInjectItemsParams } from "./generated/v2/ThreadInjectItemsParams";

export type { ThreadListResponse } from "./generated/v2/ThreadListResponse";

export type { Thread } from "./generated/v2/Thread";
export type { ThreadItem } from "./generated/v2/ThreadItem";
export type { ThreadStatus } from "./generated/v2/ThreadStatus";
export type { Turn } from "./generated/v2/Turn";
export type { TurnStatus } from "./generated/v2/TurnStatus";

export type { TurnStartParams } from "./generated/v2/TurnStartParams";
export type { TurnStartResponse } from "./generated/v2/TurnStartResponse";
export type { TurnSteerParams } from "./generated/v2/TurnSteerParams";
export type { ReviewStartParams } from "./generated/v2/ReviewStartParams";
export type { ReviewStartResponse } from "./generated/v2/ReviewStartResponse";
export type { TurnPlanStep } from "./generated/v2/TurnPlanStep";
export type { ThreadTokenUsage } from "./generated/v2/ThreadTokenUsage";

export type { UserInput } from "./generated/v2/UserInput";
export type { Model } from "./generated/v2/Model";
export type { ModelListResponse } from "./generated/v2/ModelListResponse";

export type { CommandExecutionRequestApprovalParams } from "./generated/v2/CommandExecutionRequestApprovalParams";

export type { FileChangeRequestApprovalParams } from "./generated/v2/FileChangeRequestApprovalParams";

export type { PermissionsRequestApprovalParams } from "./generated/v2/PermissionsRequestApprovalParams";

export type { ToolRequestUserInputParams } from "./generated/v2/ToolRequestUserInputParams";

export type { McpServerElicitationRequestParams } from "./generated/v2/McpServerElicitationRequestParams";

export type { InitializeParams } from "./generated/InitializeParams";

export type { RequestId } from "./generated/RequestId";

import type { RequestId } from "./generated/RequestId";

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
