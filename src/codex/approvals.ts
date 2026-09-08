/**
 * Routes server→client requests. Every request MUST be answered, otherwise
 * the app-server blocks forever, so unknown methods get a JSON-RPC error.
 */
import { INTERACTIVE_SERVER_REQUESTS, type InteractiveServerRequestMethod } from "../protocol";

export type RequestRoute =
  | { kind: "queue"; method: InteractiveServerRequestMethod }
  | { kind: "auto"; result: unknown }
  | { kind: "error"; code: number; message: string };

const INTERACTIVE = new Set<string>(INTERACTIVE_SERVER_REQUESTS);

export function routeServerRequest(method: string, now: () => number = Date.now): RequestRoute {
  if (INTERACTIVE.has(method)) {
    return { kind: "queue", method: method as InteractiveServerRequestMethod };
  }
  if (method === "currentTime/read") {
    return { kind: "auto", result: { currentTimeAt: Math.floor(now() / 1000) } };
  }
  return {
    kind: "error",
    code: -32601,
    message: `MommyCodex does not support the client request \`${method}\``,
  };
}
