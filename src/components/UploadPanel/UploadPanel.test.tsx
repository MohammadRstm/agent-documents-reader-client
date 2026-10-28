import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { UploadPanel } from "./UploadPanel";

function renderPanel(overrides: Partial<Parameters<typeof UploadPanel>[0]> = {}) {
  const props = {
    onUpload: vi.fn(),
    isUploading: false,
    disabled: false,
    error: null,
    onDismissError: vi.fn(),
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

  it("shows progress and blocks new uploads while uploading", () => {
    const props = renderPanel({ isUploading: true });

    expect(screen.getByRole("status")).toHaveTextContent(/uploading and processing files/i);
    expect(screen.getByRole("button", { name: "Choose files" })).toBeDisabled();
    expect(screen.getByLabelText("Choose files to upload")).toBeDisabled();

    fireEvent.drop(screen.getByTestId("upload-drop-zone"), { dataTransfer: { files: [pdf()] } });
    expect(props.onUpload).not.toHaveBeenCalled();
  });

  it("is disabled while no session is available", () => {
    const props = renderPanel({ disabled: true });

    expect(screen.getByRole("button", { name: "Choose files" })).toBeDisabled();
    fireEvent.drop(screen.getByTestId("upload-drop-zone"), { dataTransfer: { files: [pdf()] } });
    expect(props.onUpload).not.toHaveBeenCalled();
  });

  it("shows an upload error that can be dismissed", async () => {
    const user = userEvent.setup();
    const props = renderPanel({ error: "The request is too large. Try uploading fewer or smaller files." });

    expect(screen.getByRole("alert")).toHaveTextContent("The request is too large.");

    await user.click(screen.getByRole("button", { name: "Dismiss message" }));
    expect(props.onDismissError).toHaveBeenCalledTimes(1);
  });
});
