// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, isAbortError, uploadDocument } from "./client";
import type { DocumentSummary } from "./types";

const SESSION_ID = "a".repeat(43);

/** Minimal XMLHttpRequest stand-in that lets each test drive the request lifecycle. */
class FakeXhr {
  static instances: FakeXhr[] = [];

  method = "";
  url = "";
  headers: Record<string, string> = {};
  body: unknown = null;
  status = 0;
  responseText = "";
  aborted = false;
  upload: { onprogress: ((event: ProgressEvent) => void) | null; onload: (() => void) | null } = {
    onprogress: null,
    onload: null,
  };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  onabort: (() => void) | null = null;
  onloadend: (() => void) | null = null;

  constructor() {
    FakeXhr.instances.push(this);
  }

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }

  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }

  send(body: unknown) {
    this.body = body;
  }

  abort() {
    this.aborted = true;
    this.onabort?.();
    this.onloadend?.();
  }

  // Test helpers -----------------------------------------------------------

  progress(loaded: number, total: number) {
    this.upload.onprogress?.({ lengthComputable: true, loaded, total } as ProgressEvent);
  }

  finishUpload() {
    this.upload.onload?.();
  }

  respond(status: number, body: string) {
    this.status = status;
    this.responseText = body;
    this.onload?.();
    this.onloadend?.();
  }

  failNetwork() {
    this.onerror?.();
    this.onloadend?.();
  }
}

const summary: DocumentSummary = {
  id: "doc-1",
  fileName: "contract.pdf",
  fileType: "pdf",
  sizeBytes: 8,
  status: "indexed",
  uploadedAt: "2026-10-28T12:00:00Z",
  pageCount: 2,
  sheets: null,
  tableCount: 0,
  chunkCount: 3,
  warnings: [],
};

const pdf = () => new File(["%PDF-1.7"], "contract.pdf", { type: "application/pdf" });

function latestRequest(): FakeXhr {
  return FakeXhr.instances[FakeXhr.instances.length - 1];
}

async function captureError(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("Expected the promise to reject.");
}

beforeEach(() => {
  FakeXhr.instances = [];
  vi.stubGlobal("XMLHttpRequest", FakeXhr);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("uploadDocument", () => {
  it("posts one file as a single 'files' part with the session header", async () => {
    const promise = uploadDocument(SESSION_ID, pdf());
    const request = latestRequest();

    expect(request.method).toBe("POST");
    expect(request.url).toBe("/api/documents");
    expect(request.headers["X-Session-Id"]).toBe(SESSION_ID);
    expect(Object.keys(request.headers)).not.toContain("Content-Type");
    const body = request.body as FormData;
    expect((body.getAll("files") as File[]).map((file) => file.name)).toEqual(["contract.pdf"]);

    request.respond(200, JSON.stringify({ documents: [summary] }));
    await expect(promise).resolves.toEqual(summary);
  });

  it("reports upload progress as a fraction and 1 once all bytes are sent", async () => {
    const onUploadProgress = vi.fn();
    const promise = uploadDocument(SESSION_ID, pdf(), { onUploadProgress });
    const request = latestRequest();

    request.progress(25, 100);
    request.progress(80, 100);
    request.finishUpload();
    request.respond(200, JSON.stringify({ documents: [summary] }));
    await promise;

    expect(onUploadProgress.mock.calls.map(([fraction]) => fraction)).toEqual([0.25, 0.8, 1]);
  });

  it("maps a contract error body like the fetch path", async () => {
    const promise = uploadDocument(SESSION_ID, pdf());
    latestRequest().respond(
      413,
      JSON.stringify({ code: "payload_too_large", message: "The file is too large.", traceId: "t1" }),
    );

    const error = (await captureError(promise)) as ApiError;

    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe("payload_too_large");
    expect(error.status).toBe(413);
    expect(error.message).toBe("The file is too large.");
    expect(error.traceId).toBe("t1");
  });

  it("recognises session_not_found", async () => {
    const promise = uploadDocument(SESSION_ID, pdf());
    latestRequest().respond(
      404,
      JSON.stringify({ code: "session_not_found", message: "Session not found.", traceId: "t" }),
    );

    expect(((await captureError(promise)) as ApiError).code).toBe("session_not_found");
  });

  it("uses a generic message for non-JSON error bodies", async () => {
    const promise = uploadDocument(SESSION_ID, pdf());
    latestRequest().respond(500, "<html>System.Exception at C:\\server\\Program.cs</html>");

    const error = (await captureError(promise)) as ApiError;

    expect(error.code).toBe("unexpected_response");
    expect(error.message).not.toContain("Exception");
  });

  it("uses the rate-limit message for 429 without a contract body", async () => {
    const promise = uploadDocument(SESSION_ID, pdf());
    latestRequest().respond(429, "");

    expect(((await captureError(promise)) as ApiError).message).toMatch(/too many requests/i);
  });

  it("rejects a success response that does not contain exactly one document", async () => {
    const promise = uploadDocument(SESSION_ID, pdf());
    latestRequest().respond(200, JSON.stringify({ documents: [] }));

    expect(((await captureError(promise)) as ApiError).code).toBe("unexpected_response");
  });

  it("reports network failures as network_error", async () => {
    const promise = uploadDocument(SESSION_ID, pdf());
    latestRequest().failNetwork();

    const error = (await captureError(promise)) as ApiError;

    expect(error.code).toBe("network_error");
    expect(error.status).toBe(0);
  });

  it("aborts the request when the signal is aborted", async () => {
    const controller = new AbortController();
    const promise = uploadDocument(SESSION_ID, pdf(), { signal: controller.signal });

    controller.abort();

    expect(isAbortError(await captureError(promise))).toBe(true);
    expect(latestRequest().aborted).toBe(true);
  });

  it("does not start a request when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    const error = await captureError(uploadDocument(SESSION_ID, pdf(), { signal: controller.signal }));

    expect(isAbortError(error)).toBe(true);
    expect(FakeXhr.instances).toHaveLength(0);
  });
});
