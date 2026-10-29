import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { DocumentSummary } from "../../api/types";
import { DocumentList } from "./DocumentList";

function makeDocument(overrides: Partial<DocumentSummary> = {}): DocumentSummary {
  return {
    id: "doc-1",
    fileName: "contract.pdf",
    fileType: "pdf",
    sizeBytes: 2048,
    status: "indexed",
    uploadedAt: "2026-10-28T12:00:00Z",
    pageCount: 12,
    sheets: null,
    tableCount: 0,
    chunkCount: 30,
    warnings: [],
    ...overrides,
  };
}

describe("DocumentList", () => {
  it("shows a loading state", () => {
    render(<DocumentList documents={[]} isLoading error={null} onRetry={vi.fn()} />);

    expect(screen.getByRole("status")).toHaveTextContent("Loading documents…");
  });

  it("shows an empty state", () => {
    render(<DocumentList documents={[]} isLoading={false} error={null} onRetry={vi.fn()} />);

    expect(screen.getByText("No documents uploaded yet.")).toBeInTheDocument();
  });

  it("shows an error with a retry button", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(<DocumentList documents={[]} isLoading={false} error="Could not reach the server." onRetry={onRetry} />);

    expect(screen.getByRole("alert")).toHaveTextContent("Could not reach the server.");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("shows status badges, contents and warnings for each document", () => {
    const documents = [
      makeDocument(),
      makeDocument({
        id: "doc-2",
        fileName: "scan.pdf",
        status: "noTextExtracted",
        pageCount: 3,
        warnings: ["No text could be extracted; the PDF is possibly scanned."],
      }),
      makeDocument({
        id: "doc-3",
        fileName: "boq.xlsx",
        fileType: "xlsx",
        pageCount: null,
        sheets: [
          { name: "Summary", tableCount: 1, rowCount: 10 },
          { name: "BOQ", tableCount: 2, rowCount: 200 },
        ],
      }),
    ];

    render(<DocumentList documents={documents} isLoading={false} error={null} onRetry={vi.fn()} />);

    const items = Array.from(screen.getByRole("list", { name: "Uploaded documents" }).children) as HTMLElement[];
    expect(items).toHaveLength(3);
    expect(within(items[0]).getByText("Indexed")).toBeInTheDocument();
    expect(within(items[0]).getByText(/12 pages/)).toBeInTheDocument();
    expect(within(items[1]).getByText("No text found")).toBeInTheDocument();
    expect(within(items[1]).getByText(/possibly scanned/)).toBeInTheDocument();
    expect(within(items[2]).getByText(/2 sheets: Summary, BOQ/)).toBeInTheDocument();
  });

  it("renders file names and warnings as text, not HTML", () => {
    const documents = [
      makeDocument({ fileName: "<img src=x onerror=alert(1)>.pdf", warnings: ["<b>bold</b>"] }),
    ];

    const { container } = render(
      <DocumentList documents={documents} isLoading={false} error={null} onRetry={vi.fn()} />,
    );

    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
    expect(screen.getByText("<b>bold</b>")).toBeInTheDocument();
  });
});
