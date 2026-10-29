import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ChatPanel } from "./ChatPanel";

type ChatPanelProps = Parameters<typeof ChatPanel>[0];

function renderPanel(overrides: Partial<ChatPanelProps> = {}) {
  const props: ChatPanelProps = {
    messages: [],
    pendingAnswer: null,
    isHistoryLoading: false,
    historyError: null,
    onReloadHistory: vi.fn(),
    isStreaming: false,
    notice: null,
    onDismissNotice: vi.fn(),
    onSend: vi.fn(async () => true),
    onCancel: vi.fn(),
    onCitationClick: vi.fn(),
    disabled: false,
    blockedReason: null,
    ...overrides,
  };
  const { container } = render(<ChatPanel {...props} />);
  return { ...props, container };
}

describe("ChatPanel", () => {
  it("shows the empty state", () => {
    renderPanel();

    expect(screen.getByText(/ask a question about your uploaded documents/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  });

  it("sends the question with the button and clears the input", async () => {
    const user = userEvent.setup();
    const props = renderPanel();
    const input = screen.getByLabelText("Your question");

    await user.type(input, "What is the total?");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(props.onSend).toHaveBeenCalledWith("What is the total?");
    expect(input).toHaveValue("");
  });

  it("sends with Enter and inserts a new line with Shift+Enter", async () => {
    const user = userEvent.setup();
    const props = renderPanel();
    const input = screen.getByLabelText("Your question");

    await user.type(input, "Line one{Shift>}{Enter}{/Shift}line two");
    expect(props.onSend).not.toHaveBeenCalled();

    await user.keyboard("{Enter}");
    expect(props.onSend).toHaveBeenCalledWith("Line one\nline two");
  });

  it("gives the question back when it was not accepted", async () => {
    const user = userEvent.setup();
    renderPanel({ onSend: vi.fn(async () => false) });
    const input = screen.getByLabelText("Your question");

    await user.type(input, "Question{Enter}");

    expect(input).toHaveValue("Question");
  });

  it("disables sending and offers cancel while an answer is streaming", async () => {
    const user = userEvent.setup();
    const props = renderPanel({ isStreaming: true, pendingAnswer: { draft: "The total", status: "Calculating…" } });

    await user.type(screen.getByLabelText("Your question"), "Next question{Enter}");
    expect(props.onSend).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    expect(screen.getByText("Calculating…")).toBeInTheDocument();
    expect(screen.getByText("The total")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(props.onCancel).toHaveBeenCalledTimes(1);
  });

  it("shows the streamed draft as plain text", () => {
    const { container } = renderPanel({ isStreaming: true, pendingAnswer: { draft: "<b>partial</b> [E1]", status: null } });

    expect(container.querySelector("b")).toBeNull();
    expect(screen.getByText("<b>partial</b> [E1]")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /open source/i })).not.toBeInTheDocument();
  });

  it("shows a loading state while the history loads", () => {
    renderPanel({ isHistoryLoading: true });

    expect(screen.getByRole("status")).toHaveTextContent("Loading conversation…");
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  });

  it("shows a history error with a retry button", async () => {
    const user = userEvent.setup();
    const props = renderPanel({ historyError: "Could not reach the server." });

    expect(screen.getByRole("alert")).toHaveTextContent("Could not reach the server.");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(props.onReloadHistory).toHaveBeenCalledTimes(1);
  });

  it("shows chat notices", () => {
    renderPanel({ notice: { variant: "error", message: "Too many requests. Please wait a moment and try again." } });

    expect(screen.getByRole("alert")).toHaveTextContent("Too many requests.");
  });

  it("blocks asking and explains why while documents are processing, then re-enables", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn(async () => true);
    const baseProps: Parameters<typeof ChatPanel>[0] = {
      messages: [],
      pendingAnswer: null,
      isHistoryLoading: false,
      historyError: null,
      onReloadHistory: vi.fn(),
      isStreaming: false,
      notice: null,
      onDismissNotice: vi.fn(),
      onSend,
      onCancel: vi.fn(),
      onCitationClick: vi.fn(),
      disabled: false,
      blockedReason: "Processing 2 files… you can ask once processing finishes.",
    };
    const { rerender } = render(<ChatPanel {...baseProps} />);
    const input = screen.getByLabelText("Your question");

    expect(screen.getByText("Processing 2 files… you can ask once processing finishes.")).toBeInTheDocument();
    expect(input).toBeDisabled();
    expect(input).toHaveAccessibleDescription("Processing 2 files… you can ask once processing finishes.");
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();

    rerender(<ChatPanel {...baseProps} blockedReason={null} />);

    expect(input).toBeEnabled();
    expect(screen.queryByText(/you can ask once processing finishes/)).not.toBeInTheDocument();
    await user.type(input, "What is the total?{Enter}");
    expect(onSend).toHaveBeenCalledWith("What is the total?");
  });

  it("explains that a readable document is needed before asking", () => {
    renderPanel({ blockedReason: "Upload at least one readable PDF or Excel file to start asking." });

    expect(screen.getByText("Upload at least one readable PDF or Excel file to start asking.")).toBeInTheDocument();
    expect(screen.getByLabelText("Your question")).toBeDisabled();
  });
});
