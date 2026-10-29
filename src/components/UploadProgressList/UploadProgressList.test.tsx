import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { FileUpload } from "../../hooks/useDocuments";
import { UploadProgressList } from "./UploadProgressList";

const uploads: FileUpload[] = [
  { id: "u1", fileName: "contract.pdf", sizeBytes: 2048, phase: "uploading", progress: 0.42, error: null },
  { id: "u2", fileName: "boq.xlsx", sizeBytes: 4096, phase: "processing", progress: 1, error: null },
  {
    id: "u3",
    fileName: "old.xls",
    sizeBytes: 1024,
    phase: "failed",
    progress: 0.1,
    error: "Could not reach the server. Check your connection and try again.",
  },
];

describe("UploadProgressList", () => {
  it("renders nothing without uploads", () => {
    const { container } = render(<UploadProgressList uploads={[]} onDismiss={vi.fn()} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("shows a determinate bar with the percentage while bytes are sent", () => {
    render(<UploadProgressList uploads={uploads} onDismiss={vi.fn()} />);

    const bar = screen.getByRole("progressbar", { name: "Uploading contract.pdf" });
    expect(bar).toHaveAttribute("aria-valuenow", "42");
    expect(bar).toHaveAttribute("aria-valuemin", "0");
    expect(bar).toHaveAttribute("aria-valuemax", "100");
    expect(screen.getByText("Uploading… 42%")).toBeInTheDocument();
  });

  it("shows an indeterminate busy bar while the server parses the file", () => {
    render(<UploadProgressList uploads={uploads} onDismiss={vi.fn()} />);

    const bar = screen.getByRole("progressbar", { name: "Parsing boq.xlsx" });
    expect(bar).toHaveAttribute("aria-busy", "true");
    expect(bar).not.toHaveAttribute("aria-valuenow");
    expect(screen.getByText("Parsing…")).toBeInTheDocument();
  });

  it("shows a failed file's message with a dismiss button", async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    render(<UploadProgressList uploads={uploads} onDismiss={onDismiss} />);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Upload failed. Could not reach the server. Check your connection and try again.",
    );
    await user.click(screen.getByRole("button", { name: "Dismiss failed upload of old.xls" }));
    expect(onDismiss).toHaveBeenCalledWith("u3");
  });
});
