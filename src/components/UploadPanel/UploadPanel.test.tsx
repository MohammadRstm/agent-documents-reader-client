import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { UploadPanel } from "./UploadPanel";

type UploadPanelProps = Parameters<typeof UploadPanel>[0];

function renderPanel(overrides: Partial<UploadPanelProps> = {}) {
  const props: UploadPanelProps = {
    onUpload: vi.fn(),
    disabled: false,
    uploads: [],
    onDismissUpload: vi.fn(),
    ...overrides,
  };
  render(<UploadPanel {...props} />);
  return props;
}

const pdf = () => new File(["%PDF-1.7"], "contract.pdf", { type: "application/pdf" });
const workbook = () => new File(["data"], "BOQ.XLSX");
const textFile = () => new File(["hello"], "notes.txt", { type: "text/plain" });

describe("UploadPanel", () => {
  it("shows the idle state with an enabled file picker", () => {
    renderPanel();

    expect(screen.getByRole("button", { name: "Choose files" })).toBeEnabled();
    expect(screen.getByText(/drag and drop pdf or excel files here/i)).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("restricts the picker to the supported extensions", () => {
    renderPanel();

    expect(screen.getByLabelText("Choose files to upload")).toHaveAttribute("accept", ".pdf,.xlsx,.xlsm,.xls");
  });

  it("uploads files chosen with the file picker", async () => {
    const user = userEvent.setup();
    const props = renderPanel();
    const files = [pdf(), workbook()];

    await user.upload(screen.getByLabelText("Choose files to upload"), files);

    expect(props.onUpload).toHaveBeenCalledTimes(1);
    expect(props.onUpload).toHaveBeenCalledWith(files);
  });

  it("skips unsupported files and tells the user which ones were skipped", async () => {
    const user = userEvent.setup({ applyAccept: false });
    const props = renderPanel();
    const supported = pdf();

    await user.upload(screen.getByLabelText("Choose files to upload"), [supported, textFile()]);

    expect(props.onUpload).toHaveBeenCalledWith([supported]);
    expect(screen.getByText(/skipped 1 file that is not pdf or excel: notes\.txt/i)).toBeInTheDocument();
  });

  it("does not call onUpload when every chosen file is unsupported", async () => {
    const user = userEvent.setup({ applyAccept: false });
    const props = renderPanel();

    await user.upload(screen.getByLabelText("Choose files to upload"), [textFile()]);

    expect(props.onUpload).not.toHaveBeenCalled();
    expect(screen.getByText(/notes\.txt/)).toBeInTheDocument();
  });

  it("uploads files dropped onto the drop zone", () => {
    const props = renderPanel();
    const file = workbook();

    fireEvent.drop(screen.getByTestId("upload-drop-zone"), { dataTransfer: { files: [file] } });

    expect(props.onUpload).toHaveBeenCalledWith([file]);
  });

  it("keeps accepting files while earlier uploads are still in progress", () => {
    const props = renderPanel({
      uploads: [
        { id: "u1", fileName: "first.pdf", sizeBytes: 1000, phase: "uploading", progress: 0.4, error: null },
        { id: "u2", fileName: "second.xlsx", sizeBytes: 2000, phase: "processing", progress: 1, error: null },
      ],
    });
    const file = pdf();

    expect(screen.getByRole("button", { name: "Choose files" })).toBeEnabled();
    fireEvent.drop(screen.getByTestId("upload-drop-zone"), { dataTransfer: { files: [file] } });

    expect(props.onUpload).toHaveBeenCalledWith([file]);
    expect(screen.getByRole("progressbar", { name: "Uploading first.pdf" })).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Parsing second.xlsx" })).toBeInTheDocument();
  });

  it("is disabled while no session is available", () => {
    const props = renderPanel({ disabled: true });

    expect(screen.getByRole("button", { name: "Choose files" })).toBeDisabled();
    fireEvent.drop(screen.getByTestId("upload-drop-zone"), { dataTransfer: { files: [pdf()] } });
    expect(props.onUpload).not.toHaveBeenCalled();
  });

  it("lets the user dismiss a failed upload row", async () => {
    const user = userEvent.setup();
    const props = renderPanel({
      uploads: [
        {
          id: "u1",
          fileName: "huge.pdf",
          sizeBytes: 999,
          phase: "failed",
          progress: 1,
          error: "The file is too large.",
        },
      ],
    });

    expect(screen.getByRole("alert")).toHaveTextContent("Upload failed. The file is too large.");
    await user.click(screen.getByRole("button", { name: "Dismiss failed upload of huge.pdf" }));
    expect(props.onDismissUpload).toHaveBeenCalledWith("u1");
  });
});
