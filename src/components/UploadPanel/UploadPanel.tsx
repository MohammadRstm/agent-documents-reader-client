import { useRef, useState, type ChangeEvent, type DragEvent } from "react";
import type { FileUpload } from "../../hooks/useDocuments";
import { SUPPORTED_FILE_EXTENSIONS, hasSupportedExtension } from "../../utils/files";
import { ErrorBanner } from "../ErrorBanner/ErrorBanner";
import { UploadProgressList } from "../UploadProgressList/UploadProgressList";
import styles from "./UploadPanel.module.css";

interface UploadPanelProps {
  onUpload: (files: File[]) => void;
  /** True while no session is available. Uploading more files while others are in progress is allowed. */
  disabled: boolean;
  uploads: FileUpload[];
  onDismissUpload: (uploadId: string) => void;
}

const ACCEPT_ATTRIBUTE = SUPPORTED_FILE_EXTENSIONS.join(",");

function describeSkippedFiles(fileNames: string[]): string {
  const subject = fileNames.length === 1 ? "1 file that is" : `${fileNames.length} files that are`;
  return `Skipped ${subject} not PDF or Excel: ${fileNames.join(", ")}`;
}

export function UploadPanel({ onUpload, disabled, uploads, onDismissUpload }: UploadPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const [skippedFileNames, setSkippedFileNames] = useState<string[]>([]);

  function handleFiles(fileList: FileList | readonly File[]) {
    const files = Array.from(fileList);
    if (files.length === 0) {
      return;
    }
    const supported = files.filter((file) => hasSupportedExtension(file.name));
    setSkippedFileNames(files.filter((file) => !hasSupportedExtension(file.name)).map((file) => file.name));
    if (supported.length > 0) {
      onUpload(supported);
    }
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files) {
      handleFiles(event.target.files);
    }
    // Allow selecting the same file again later.
    event.target.value = "";
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (!disabled) {
      setIsDragActive(true);
    }
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    // Ignore leave events fired when moving between child elements.
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
      return;
    }
    setIsDragActive(false);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragActive(false);
    if (!disabled) {
      handleFiles(event.dataTransfer.files);
    }
  }

  const dropZoneClassName = [
    styles.dropZone,
    isDragActive ? styles.dropZoneActive : "",
    disabled ? styles.dropZoneDisabled : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <section className={styles.panel} aria-labelledby="upload-heading">
      <h2 id="upload-heading" className={styles.heading}>
        Upload documents
      </h2>

      <div
        className={dropZoneClassName}
        data-testid="upload-drop-zone"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <p className={styles.hint}>Drag and drop PDF or Excel files here, or</p>
        <button
          type="button"
          className={styles.chooseButton}
          onClick={() => inputRef.current?.click()}
          disabled={disabled}
        >
          Choose files
        </button>
        <p className={styles.formats}>Supported: {SUPPORTED_FILE_EXTENSIONS.join(", ")}</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT_ATTRIBUTE}
          className={styles.hiddenInput}
          onChange={handleInputChange}
          disabled={disabled}
          aria-label="Choose files to upload"
          data-testid="upload-input"
        />
      </div>

      <UploadProgressList uploads={uploads} onDismiss={onDismissUpload} />

      {skippedFileNames.length > 0 && (
        <ErrorBanner
          variant="notice"
          message={describeSkippedFiles(skippedFileNames)}
          onDismiss={() => setSkippedFileNames([])}
        />
      )}
    </section>
  );
}
