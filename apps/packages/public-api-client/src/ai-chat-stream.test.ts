import { describe, expect, test } from "bun:test";
import { createControlPlaneGraphQLClient } from ".";

describe("AI Chat stream client", () => {
  test("posts to the BFF stream endpoint derived from the GraphQL endpoint and yields SSE events", async () => {
    const fetchCalls: Request[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input, init) => {
      const request = input instanceof Request ? input : new Request(input, init);
      fetchCalls.push(request);
      return new Response(
        [
          `data: ${JSON.stringify(streamEvent("run.started", 1))}\n\n`,
          `data: ${JSON.stringify(streamEvent("text.delta", 2, { text: "hello" }))}\n\n`,
          `data: ${JSON.stringify(streamEvent("run.completed", 3))}\n\n`,
        ].join(""),
        { headers: { "content-type": "text/event-stream" } },
      );
    }) as typeof fetch;

    try {
      const client = createControlPlaneGraphQLClient("https://cloudgrid.test/graphql");
      const events = [];
      for await (const event of client.streamAiChatRun({
        conversationId: "chat-1",
        projectId: "project-1",
        userMessageClientId: "client-message-1",
        idempotencyKey: "idempotency-key-0001",
        parts: [{ type: "text", text: "hello" }],
      })) {
        events.push(event);
      }

      expect(fetchCalls).toHaveLength(1);
      expect(fetchCalls.at(0)?.url).toBe("https://cloudgrid.test/api/ai-chat/stream");
      expect(fetchCalls.at(0)?.method).toBe("POST");
      expect(events.map((event) => event.type)).toEqual([
        "run.started",
        "text.delta",
        "run.completed",
      ]);
      expect(events.at(1)?.payload).toEqual({ text: "hello" });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

function streamEvent(type: string, sequence: number, payload: Record<string, unknown> = {}) {
  return {
    type,
    conversationId: "chat-1",
    runId: "run-1",
    sequence,
    createdAt: "2026-05-18T00:00:00.000Z",
    payload,
  };
}
