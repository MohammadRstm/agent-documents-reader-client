import { useMemo } from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Citation } from "../../api/types";
import { CitationChip } from "../CitationChip/CitationChip";
import { EVIDENCE_ID_PROPERTY, remarkCitationMarkers } from "./remarkCitationMarkers";
import styles from "./AnswerMarkdown.module.css";

interface AnswerMarkdownProps {
  /** Assistant answer text (untrusted). */
  content: string;
  /** Validated citations for this answer, from the backend. */
  citations: Citation[];
  onCitationClick: (citation: Citation) => void;
}

const REMARK_PLUGINS = [remarkGfm, remarkCitationMarkers];

// Images are not rendered: an image URL in model output could be used to send data
// to a third-party server as soon as the answer is displayed.
const DISALLOWED_ELEMENTS = ["img"];

/**
 * Renders an answer as Markdown without ever interpreting raw HTML (`skipHtml`, no
 * rehype-raw). react-markdown's default URL transform removes unsafe link protocols
 * such as `javascript:`. Citation markers only become clickable when the backend
 * supplied a matching citation; unknown markers are shown as plain text.
 */
export function AnswerMarkdown({ content, citations, onCitationClick }: AnswerMarkdownProps) {
  const components = useMemo<Components>(() => {
    const citationsById = new Map(citations.map((citation) => [citation.evidenceId, citation]));

    return {
      a({ node, href, children }) {
        const evidenceId = node?.properties?.[EVIDENCE_ID_PROPERTY];
        if (typeof evidenceId === "string") {
          const citation = citationsById.get(evidenceId);
          return citation ? (
            <CitationChip citation={citation} onClick={onCitationClick} />
          ) : (
            <span className={styles.unknownMarker}>[{evidenceId}]</span>
          );
        }
        return (
          <a href={href} target="_blank" rel="noopener noreferrer">
            {children}
          </a>
        );
      },
    };
  }, [citations, onCitationClick]);

  return (
    <div className={styles.markdown}>
      <Markdown
        remarkPlugins={REMARK_PLUGINS}
        components={components}
        disallowedElements={DISALLOWED_ELEMENTS}
        skipHtml
      >
        {content}
      </Markdown>
    </div>
  );
}
