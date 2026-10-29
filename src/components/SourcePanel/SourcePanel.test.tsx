import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Citation } from "../../api/types";
import type { EvidenceState } from "../../hooks/useEvidence";
import { SourcePanel } from "./SourcePanel";

const excelCitation: Citation = {
  evidenceId: "E3",
  documentId: "doc-2",
  fileName: "boq.xlsx",
  source: { type: "excelRange", sheet: "BOQ", range: "A5:F5" },
  snippet: "Concrete | 120 | m3",
};

const pdfCitation: Citation = {
  evidenceId: "E4",
  documentId: "doc-1",
  fileName: "contract.pdf",
  source: { type: "pdfPage", page: 12 },
  snippet: "Completion date: 30 June 2027.",
};

function renderPanel(citation: Citation, evidence: EvidenceState) {
  const props = { onRetry: vi.fn(), onClose: vi.fn() };
  render(<SourcePanel citation={citation} evidence={evidence} {...props} />);
  return props;
}

describe("SourcePanel", () => {
  it("shows the file, Excel location and snippet while the full text loads", () => {
    renderPanel(excelCitation, { status: "loading" });

    expect(screen.getByRole("heading", { name: "Source E3" })).toBeInTheDocument();
    expect(screen.getByText("boq.xlsx")).toBeInTheDocument();
    expect(screen.getByText("Sheet BOQ, range A5:F5")).toBeInTheDocument();
    expect(screen.getByText("Concrete | 120 | m3")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Loading source text…");
  });

  it("shows the page number for PDF sources and the loaded full text", () => {
    renderPanel(pdfCitation, {
      status: "loaded",
      evidence: {
        evidenceId: "E4",
        documentId: "doc-1",
        fileName: "contract.pdf",
        kind: "textChunk",
        source: { type: "pdfPage", page: 12 },
        text: "Section 5. Completion date: 30 June 2027. Delays incur penalties.",
      },
    });

    expect(screen.getByText("Page 12")).toBeInTheDocument();
    expect(screen.getByText(/Delays incur penalties/)).toBeInTheDocument();
    expect(screen.getByText("Text passage")).toBeInTheDocument();
  });

  it("shows an error with a retry button", async () => {
    const user = userEvent.setup();
    const props = renderPanel(pdfCitation, { status: "error", message: "The source could not be found." });

    expect(screen.getByRole("alert")).toHaveTextContent("The source could not be found.");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(props.onRetry).toHaveBeenCalledTimes(1);
  });

  it("closes with the close button and the Escape key", async () => {
    const user = userEvent.setup();
    const props = renderPanel(pdfCitation, { status: "loading" });

    await user.click(screen.getByRole("button", { name: "Close source" }));
    fireEvent.keyDown(document, { key: "Escape" });

    expect(props.onClose).toHaveBeenCalledTimes(2);
  });
});
