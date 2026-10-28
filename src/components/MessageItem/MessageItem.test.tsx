import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ChatMessage, Citation } from "../../api/types";
import { MessageItem } from "./MessageItem";

const citation: Citation = {
  evidenceId: "E7",
  documentId: "doc-1",
  fileName: "boq.xlsx",
  source: { type: "excelRange", sheet: "Summary", range: "B2:D2" },
  snippet: "Grand total | 50,000 | USD",
};

function makeMessage(overrides: Partial<ChatMessage>): ChatMessage {
  return {
    id: "m1",
    role: "assistant",
    content: "",
    createdAt: "2026-10-28T12:00:00Z",
    citations: [],
    incomplete: false,
    ...overrides,
  };
}

describe("MessageItem", () => {
  it("opens the source when an inline citation is clicked", async () => {
    const user = userEvent.setup();
    const onCitationClick = vi.fn();
    render(
      <MessageItem
        message={makeMessage({ content: "The grand total is 50,000 USD [E7].", citations: [citation] })}
        onCitationClick={onCitationClick}
      />,
    );

    const [inlineChip] = screen.getAllByRole("button", { name: /open source E7/i });
    await user.click(inlineChip);

    expect(onCitationClick).toHaveBeenCalledWith(citation);
  });

  it("lists each cited source once under the answer", () => {
    render(
      <MessageItem
        message={makeMessage({ content: "Total [E7], confirmed [E7].", citations: [citation, citation] })}
        onCitationClick={vi.fn()}
      />,
    );

    expect(screen.getByText("Sources:")).toBeInTheDocument();
    // Two inline chips plus one entry in the sources row.
    expect(screen.getAllByRole("button", { name: /open source E7/i })).toHaveLength(3);
    expect(screen.getByText("boq.xlsx, Sheet Summary, range B2:D2")).toBeInTheDocument();
  });

  it("marks incomplete answers", () => {
    render(<MessageItem message={makeMessage({ content: "Partial", incomplete: true })} onCitationClick={vi.fn()} />);

    expect(screen.getByRole("note")).toHaveTextContent(/may be incomplete/i);
  });

  it("renders user questions as plain text", () => {
    const { container } = render(
      <MessageItem
        message={makeMessage({ role: "user", content: "<img src=x onerror=alert(1)> **not bold**" })}
        onCitationClick={vi.fn()}
      />,
    );

    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("strong")).toBeNull();
    expect(screen.getByText("<img src=x onerror=alert(1)> **not bold**")).toBeInTheDocument();
  });
});
