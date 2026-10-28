import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, listDocuments, uploadDocument, type UploadDocumentOptions } from "../api/client";
import type { DocumentSummary } from "../api/types";
import { useDocuments } from "./useDocuments";

vi.mock("../api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/client")>();
  return { ...actual, listDocuments: vi.fn(), uploadDocument: vi.fn() };
});

const SESSION_ID = "s".repeat(43);

interface PendingUpload {
  file: File;
  options: UploadDocumentOptions;
  resolve: (document: DocumentSummary) => void;
  reject: (error: unknown) => void;
}

let pendingUploads: PendingUpload[];

function makeDocument(overrides: Partial<DocumentSummary>): DocumentSummary {
  return {
    id: "doc",
    fileName: "file.pdf",
    fileType: "pdf",
    sizeBytes: 10,
    status: "indexed",
    uploadedAt: "2026-10-28T12:00:00Z",
    pageCount: 1,
    sheets: null,
    tableCount: 0,
    chunkCount: 1,
    warnings: [],
    ...overrides,
  };
}

beforeEach(() => {
  pendingUploads = [];
  vi.mocked(listDocuments).mockReset().mockResolvedValue({ documents: [] });
  vi.mocked(uploadDocument)
    .mockReset()
    .mockImplementation(
      (_sessionId, file, options = {}) =>
        new Promise<DocumentSummary>((resolve, reject) => {
          pendingUploads.push({ file, options, resolve, reject });
        }),
    );
});

async function renderDocuments(onSessionNotFound = vi.fn()) {
  const hook = renderHook(() => useDocuments(SESSION_ID, onSessionNotFound));
  await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
  return hook;
}

const pdf = (name: string) => new File(["%PDF-1.7"], name, { type: "application/pdf" });

describe("useDocuments uploads", () => {
  it("sends one request per file, in parallel, and tracks each file's progress", async () => {
    const { result } = await renderDocuments();

    act(() => {
      result.current.upload([pdf("a.pdf"), pdf("b.pdf")]);
    });

    expect(uploadDocument).toHaveBeenCalledTimes(2);
    expect(pendingUploads.map((upload) => upload.file.name)).toEqual(["a.pdf", "b.pdf"]);
    expect(result.current.uploads.map((upload) => [upload.fileName, upload.phase])).toEqual([
      ["a.pdf", "uploading"],
      ["b.pdf", "uploading"],
    ]);
    expect(result.current.processingCount).toBe(2);

    act(() => {
      pendingUploads[0].options.onUploadProgress?.(0.5);
      pendingUploads[1].options.onUploadProgress?.(1);
    });

    expect(result.current.uploads[0]).toMatchObject({ phase: "uploading", progress: 0.5 });
    expect(result.current.uploads[1]).toMatchObject({ phase: "processing", progress: 1 });
  });

  it("replaces a finished row with its document and updates readability", async () => {
    const { result } = await renderDocuments();
    act(() => {
      result.current.upload([pdf("a.pdf"), pdf("scan.pdf")]);
    });
    expect(result.current.hasReadableDocuments).toBe(false);

    await act(async () => {
      pendingUploads[1].resolve(makeDocument({ id: "d2", fileName: "scan.pdf", status: "noTextExtracted" }));
    });
    expect(result.current.uploads.map((upload) => upload.fileName)).toEqual(["a.pdf"]);
    expect(result.current.documents.map((document) => document.id)).toEqual(["d2"]);
    expect(result.current.hasReadableDocuments).toBe(false);
    expect(result.current.processingCount).toBe(1);

    await act(async () => {
      pendingUploads[0].resolve(makeDocument({ id: "d1", fileName: "a.pdf", status: "partiallyIndexed" }));
    });
    expect(result.current.uploads).toEqual([]);
    expect(result.current.processingCount).toBe(0);
    expect(result.current.hasReadableDocuments).toBe(true);
  });

  it("allows more uploads while earlier ones are still running", async () => {
    const { result } = await renderDocuments();
    act(() => {
      result.current.upload([pdf("first.pdf")]);
    });
    act(() => {
      result.current.upload([pdf("second.pdf")]);
    });

    expect(uploadDocument).toHaveBeenCalledTimes(2);
    expect(result.current.processingCount).toBe(2);
  });

  it("marks a failed file with a safe message and lets it be dismissed", async () => {
    const { result } = await renderDocuments();
    act(() => {
      result.current.upload([pdf("big.pdf"), pdf("ok.pdf")]);
    });

    await act(async () => {
      pendingUploads[0].reject(
        new ApiError({ code: "payload_too_large", status: 413, message: "The file is too large." }),
      );
    });

    const failed = result.current.uploads[0];
    expect(failed).toMatchObject({ fileName: "big.pdf", phase: "failed", error: "The file is too large." });
    expect(result.current.processingCount).toBe(1);

    act(() => {
      result.current.dismissUpload(failed.id);
    });
    expect(result.current.uploads.map((upload) => upload.fileName)).toEqual(["ok.pdf"]);
  });

  it("reports session_not_found from an upload to the session owner", async () => {
    const onSessionNotFound = vi.fn();
    const { result } = await renderDocuments(onSessionNotFound);
    act(() => {
      result.current.upload([pdf("a.pdf")]);
    });

    await act(async () => {
      pendingUploads[0].reject(new ApiError({ code: "session_not_found", status: 404, message: "Gone." }));
    });

    expect(onSessionNotFound).toHaveBeenCalledWith(SESSION_ID);
  });

  it("aborts running uploads and clears rows when the session changes", async () => {
    const { result, rerender } = renderHook(({ sessionId }) => useDocuments(sessionId, vi.fn()), {
      initialProps: { sessionId: SESSION_ID },
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    act(() => {
      result.current.upload([pdf("a.pdf")]);
    });

    rerender({ sessionId: "t".repeat(43) });

    expect(pendingUploads[0].options.signal?.aborted).toBe(true);
    expect(result.current.uploads).toEqual([]);
  });
});
