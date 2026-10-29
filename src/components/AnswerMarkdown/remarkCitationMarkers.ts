// Remark plugin that turns citation markers such as `[E12]` in answer text into
// dedicated nodes. AnswerMarkdown renders those nodes as CitationChip buttons.
//
// The marker becomes a markdown link node tagged with a `dataEvidenceId` property.
// Markdown written by the model cannot produce that property (raw HTML is skipped
// and markdown links only carry href/title), so only markers found here become chips.
// Markers inside code spans/blocks are left untouched because those are not text nodes.

const CITATION_MARKER_PATTERN = /\[(E\d+)\]/g;

/** Minimal mdast node shape needed here (avoids depending on @types/mdast directly). */
interface MarkdownNode {
  type: string;
  value?: string;
  url?: string;
  children?: MarkdownNode[];
  data?: { hProperties?: Record<string, string> };
}

export const EVIDENCE_ID_PROPERTY = "dataEvidenceId";

function splitTextNode(value: string): MarkdownNode[] {
  const nodes: MarkdownNode[] = [];
  let lastIndex = 0;
  for (const match of value.matchAll(CITATION_MARKER_PATTERN)) {
    const matchIndex = match.index ?? 0;
    if (matchIndex > lastIndex) {
      nodes.push({ type: "text", value: value.slice(lastIndex, matchIndex) });
    }
    const evidenceId = match[1];
    nodes.push({
      type: "link",
      url: `#${evidenceId}`,
      children: [{ type: "text", value: evidenceId }],
      data: { hProperties: { [EVIDENCE_ID_PROPERTY]: evidenceId } },
    });
    lastIndex = matchIndex + match[0].length;
  }
  if (lastIndex === 0) {
    return [{ type: "text", value }];
  }
  if (lastIndex < value.length) {
    nodes.push({ type: "text", value: value.slice(lastIndex) });
  }
  return nodes;
}

function transformNode(node: MarkdownNode): void {
  // Links cannot contain other links, so markers inside link text stay as text.
  if (!node.children || node.type === "link" || node.type === "linkReference") {
    return;
  }
  node.children = node.children.flatMap((child) => {
    if (child.type === "text") {
      return splitTextNode(child.value ?? "");
    }
    transformNode(child);
    return [child];
  });
}

export function remarkCitationMarkers() {
  return (tree: unknown) => {
    transformNode(tree as MarkdownNode);
  };
}
