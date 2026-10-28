import type { FileUpload } from "../../hooks/useDocuments";
import { formatFileSize } from "../../utils/files";
import styles from "./UploadProgressList.module.css";

interface UploadProgressListProps {
  uploads: FileUpload[];
  onDismiss: (uploadId: string) => void;
}

function UploadRow({ upload, onDismiss }: { upload: FileUpload; onDismiss: (uploadId: string) => void }) {
  const percent = Math.round(upload.progress * 100);

  return (
    <li className={styles.row} aria-label={`Upload of ${upload.fileName}`}>
      <div className={styles.rowHeader}>
        <span className={styles.fileName} title={upload.fileName}>
          {upload.fileName}
        </span>
        <span className={styles.size}>{formatFileSize(upload.sizeBytes)}</span>
      </div>

      {upload.phase === "uploading" && (
        <>
          <div
            className={styles.track}
            role="progressbar"
            aria-label={`Uploading ${upload.fileName}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
          >
            <div className={styles.bar} style={{ width: `${percent}%` }} />
          </div>
          <p className={styles.caption}>Uploading… {percent}%</p>
        </>
      )}

      {upload.phase === "processing" && (
        <>
          {/* No aria-valuenow: an indeterminate progress bar. */}
          <div
            className={styles.track}
            role="progressbar"
            aria-label={`Parsing ${upload.fileName}`}
            aria-busy="true"
            aria-valuetext="Parsing"
          >
            <div className={styles.indeterminateBar} />
          </div>
          <p className={styles.caption}>Parsing…</p>
        </>
      )}

      {upload.phase === "failed" && (
        <div className={styles.failure}>
          <p className={styles.errorMessage} role="alert">
            Upload failed. {upload.error}
          </p>
          <button
            type="button"
            className={styles.dismissButton}
            onClick={() => onDismiss(upload.id)}
            aria-label={`Dismiss failed upload of ${upload.fileName}`}
          >
            Dismiss
          </button>
        </div>
      )}
    </li>
  );
}

/** One row per file sent to the server: upload progress, parsing, or failure. */
export function UploadProgressList({ uploads, onDismiss }: UploadProgressListProps) {
  if (uploads.length === 0) {
    return null;
  }
  return (
    <ul className={styles.list} aria-label="Uploads in progress">
      {uploads.map((upload) => (
        <UploadRow key={upload.id} upload={upload} onDismiss={onDismiss} />
      ))}
    </ul>
  );
}
