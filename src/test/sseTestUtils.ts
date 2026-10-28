// Helpers for tests that need a streaming `POST /api/chat` response.

export interface ControlledSseStream {
  response: Response;
  /** Sends one SSE event (`event:` + single-line `data:` + blank line). */
  sendEvent: (event: string, data: unknown) => void;
  /** Sends raw text exactly as given. */
  sendRaw: (text: string) => void;
  close: () => void;
}

export function createControlledSseStream(): ControlledSseStream {
  const encoder = new TextEncoder();
  let streamController!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      streamController = controller;
    },
  });

  const sendRaw = (text: string) => {
    try {
      streamController.enqueue(encoder.encode(text));
    } catch {
      // The reader cancelled the stream (for example after an abort).
    }
  };

  return {
    response: new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream; charset=utf-8" } }),
    sendEvent: (event, data) => sendRaw(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
    sendRaw,
    close: () => {
      try {
        streamController.close();
      } catch {
        // Already closed or cancelled.
      }
    },
  };
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
