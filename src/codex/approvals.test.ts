import { describe, expect, it } from "vitest";
import { ALL_SERVER_REQUESTS, INTERACTIVE_SERVER_REQUESTS } from "../protocol";
import { routeServerRequest } from "./approvals";

describe("routeServerRequest", () => {
  it("queues every interactive approval method", () => {
    for (const m of INTERACTIVE_SERVER_REQUESTS) {
      expect(routeServerRequest(m)).toEqual({ kind: "queue", method: m });
    }
  });

  it("auto-answers currentTime/read with unix seconds", () => {
    const r = routeServerRequest("currentTime/read", () => 1_700_000_000_500);
    expect(r).toEqual({ kind: "auto", result: { currentTimeAt: 1_700_000_000 } });
  });

  it("errors (never silences) every other known server request", () => {
    const interactive = new Set<string>(INTERACTIVE_SERVER_REQUESTS);
    for (const m of ALL_SERVER_REQUESTS) {
      if (interactive.has(m)) continue;
      const r = routeServerRequest(m);
      expect(r.kind).toBe("error");
      if (r.kind === "error") expect(r.code).toBe(-32601);
    }
    expect(routeServerRequest("something/new").kind).toBe("error");
  });
});
