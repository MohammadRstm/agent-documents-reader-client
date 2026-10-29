// @vitest-environment node
import { describe, expect, it } from "vitest";
import { getChatBlockedReason } from "./chatGating";

describe("getChatBlockedReason", () => {
  it("blocks while files are processing, with a count", () => {
    expect(getChatBlockedReason({ processingCount: 1, hasReadableDocuments: true, isLoadingDocuments: false })).toBe(
      "Processing 1 file… you can ask once processing finishes.",
    );
    expect(getChatBlockedReason({ processingCount: 3, hasReadableDocuments: false, isLoadingDocuments: false })).toBe(
      "Processing 3 files… you can ask once processing finishes.",
    );
  });

  it("blocks while the document list is loading", () => {
    expect(getChatBlockedReason({ processingCount: 0, hasReadableDocuments: false, isLoadingDocuments: true })).toBe(
      "Loading documents…",
    );
  });

  it("blocks when there is no readable document", () => {
    expect(getChatBlockedReason({ processingCount: 0, hasReadableDocuments: false, isLoadingDocuments: false })).toBe(
      "Upload at least one readable PDF or Excel file to start asking.",
    );
  });

  it("allows asking once processing is done and a readable document exists", () => {
    expect(
      getChatBlockedReason({ processingCount: 0, hasReadableDocuments: true, isLoadingDocuments: false }),
    ).toBeNull();
  });
});
