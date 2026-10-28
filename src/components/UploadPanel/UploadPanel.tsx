import { useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { SUPPORTED_FILE_EXTENSIONS, hasSupportedExtension } from "../../utils/files";
import { ErrorBanner } from "../ErrorBanner/ErrorBanner";
import styles from "./UploadPanel.module.css";

interface UploadPanelProps {
  onUpload: (files: File[]) => void;
  isUploading: boolean;
  /** True while no session is available. */
  disabled: boolean;
  /** Safe message from the last failed upload request. */
  error: string | null;
  onDismissError: () => void;
}

const ACCEPT_ATTRIBUTE = SUPPORTED_FILE_EXTENSIONS.join(",");

function describeSkippedFiles(fileNames: string[]): string {
  const subject = fileNames.length === 1 ? "1 file that is" : `${fileNames.length} files that are`;
  return `Skipped ${subject} not PDF or Excel: ${fileNames.join(", ")}`;
}

export function UploadPanel({ onUpload, isUploading, disabled, error, onDismissError }: UploadPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const [skippedFileNames, setSkippedFileNames] = useState<string[]>([]);
  const isBlocked = disabled || isUploading;

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
    if (!isBlocked) {
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
    if (!isBlocked) {
      handleFiles(event.dataTransfer.files);
    }
  }

  const dropZoneClassName = [
    styles.dropZone,
    isDragActive ? styles.dropZoneActive : "",
    isBlocked ? styles.dropZoneDisabled : "",
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
          disabled={isBlocked}
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
          disabled={isBlocked}
          aria-label="Choose files to upload"
          data-testid="upload-input"
        />
      </div>

      {isUploading && (
        <p className={styles.progress} role="status">
          Uploading and processing files…
        </p>
      )}

      {skippedFileNames.length > 0 && (
        <ErrorBanner
          variant="notice"
          message={describeSkippedFiles(skippedFileNames)}
          onDismiss={() => setSkippedFileNames([])}
        />
      )}

      {error && <ErrorBanner message={error} onDismiss={onDismissError} />}
    </section>
  );
}
