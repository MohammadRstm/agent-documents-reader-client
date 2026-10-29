# agent-documents-reader-client

React frontend for the AI document-analysis assistant. Users upload PDF and Excel
documents, ask analytical questions about them in a chat, and inspect the source
behind every answer: the PDF page, or the Excel worksheet and cell range.

The backend is a separate ASP.NET Core project:
[agent-documents-reader-server](https://github.com/MohammadRstm/agent-documents-reader-server).
It does all document processing, retrieval, calculations, citation validation and
calls to Claude. This client only presents the conversation, upload status and sources.

## Prerequisites

- Node.js 24.x and npm 11.x (verified with Node 24.14 and npm 11.11).
- The server running on `http://localhost:5080`, with a Claude API key in its .NET User
  Secrets. See the server repository's README for setup. The client never sees or needs
  the API key.

## Getting started

```bash
npm ci        # install the exact versions from package-lock.json
npm run dev   # start Vite on http://localhost:5173
```

Open `http://localhost:5173`. In development, Vite proxies every request under `/api` to
`http://localhost:5080` (see `vite.config.ts`), so the browser only talks to the Vite origin.
Port 5173 is strict: if it is taken, Vite stops instead of picking another port.

## Commands

| Command | What it does |
|---|---|
| `npm ci` | Install dependencies from `package-lock.json` |
| `npm run dev` | Start the dev server on port 5173 with the `/api` proxy |
| `npm run lint` | Lint with oxlint (the linter shipped by the current `create-vite` React + TypeScript template) |
| `npm run typecheck` | Type-check the app, tests and Vite config with `tsc -b` |
| `npm test` | Run all tests once with Vitest (`vitest run`, jsdom environment) |
| `npm run build` | Type-check, then build for production into `dist/` |
| `npm run preview` | Serve the production build locally (no `/api` proxy) |

Tests use mocked `fetch` responses and never call the server or Claude.

### Continuous integration

`.github/workflows/ci.yml` runs on every pull request and on pushes to `develop` and
`main`. On Ubuntu with Node 24 it runs `npm ci`, lint, type-check, `npx vitest run` and build.

## Stack

- Vite, React 19 and TypeScript, styled with plain CSS modules.
- `react-markdown` + `remark-gfm` to render answers.
- Vitest, React Testing Library, `@testing-library/user-event`, `@testing-library/jest-dom` and jsdom for tests.
- No UI library, state library or HTTP library: `fetch` is wrapped in `src/api/client.ts`.

## Project structure

```
docs/api-contract.md        Shared API contract (identical copy in the server repository)
src/api/
  types.ts                  TypeScript mirror of the contract types
  client.ts                 fetch wrapper: X-Session-Id header, typed ApiError, endpoint functions
  sse.ts                    Server-sent-event parser for the streaming chat response
src/hooks/
  useSession.ts             Session ID in sessionStorage, expiry handling
  useDocuments.ts           Document list and uploads
  useChat.ts                Chat history, streaming answers, cancellation
  useEvidence.ts            Full source text for the source panel
src/components/
  UploadPanel, DocumentList, ChatPanel, MessageList, MessageItem,
  AnswerMarkdown, CitationChip, SourcePanel, ErrorBanner
src/utils/                  Small helpers (file extensions and sizes, source locations)
src/test/                   Test setup and SSE test helpers
```

Components only render. All API calls go through `src/api/client.ts` and are made from the hooks.

### API contract

`docs/api-contract.md` is the single source of truth for endpoints, error codes and
stream events. `src/api/types.ts` mirrors its types exactly: same names, fields and unions.
A contract change must be made in both repositories in the same step, including `types.ts`.

## Behaviour

### Sessions

- On first load the client calls `POST /api/sessions` and keeps the ID in
  `sessionStorage`. The ID is lost when the tab closes.
- Every other request sends the ID as `X-Session-Id`.
- If the server answers `session_not_found` (for example after a server restart), the
  client starts one new session and shows: "Your previous session has expired, so its
  documents and chat history are no longer available. A new session has been started."

### Uploading documents

- Drag and drop files, or use **Choose files**. Accepted extensions are `.pdf`, `.xlsx`,
  `.xlsm` and `.xls`.
- Files with other extensions are skipped and listed in a notice. This check is only a
  convenience; the server validates every file's signature and content.
- While a batch uploads and is processed, the panel shows "Uploading and processing files…"
  and accepts no new files.
- Each document shows its type, size, page count or sheet names, a status badge, and any
  warnings from the server:

| Status | Badge |
|---|---|
| `indexed` | Indexed |
| `partiallyIndexed` | Partially indexed (some content could not be read) |
| `noTextExtracted` | No text found (the PDF may be scanned) |
| `empty` | Empty |
| `unsupported` | Unsupported |
| `corrupt` | Unreadable (damaged, encrypted or unopenable) |
| `tooLarge` | Too large |

### Asking questions

- Enter sends; Shift+Enter inserts a new line. Questions can be 1 to 4000 characters.
- `POST /api/chat` returns a server-sent-event stream, read from `fetch` because
  `EventSource` cannot POST.
  - `status` events update a progress line, such as "Searching documents…".
  - `delta` events build a draft answer, shown as plain text.
  - `done` replaces the draft with the final, validated answer.
  - `error` shows the server's message.
- Malformed events and unknown event names are skipped; the stream continues.
- If the stream ends without `done` or `error`, a generic "interrupted" error is shown.
- Send is disabled while an answer streams. **Cancel** stops reading the answer.
- If the server rejects a question before streaming starts (validation, a question already
  in progress, rate limit, provider failure), the question is removed from the chat and
  its text goes back into the input box.
- Answers flagged `incomplete` (the agent hit a processing limit) show a note that the
  answer may be incomplete.
- Earlier messages are loaded from `GET /api/chat/history` when the page opens.

### Citations and sources

- The server writes citation markers such as `[E12]` into answers. A marker becomes a
  clickable chip only when the server also sent a validated citation with that ID.
  Markers without one stay plain text, as do markers inside code.
- Each answer lists its sources once below the text.
- Clicking a chip opens the source panel. It shows:
  - the file name;
  - the location ("Page 3" or "Sheet BOQ, range A5:F5");
  - the snippet;
  - the full source text from `GET /api/evidence/{id}`.
- Close the panel with **Close** or Escape.

### Rendering safety

- Answers are rendered with `react-markdown` + `remark-gfm` (tables, lists, code).
- Raw HTML in answers is never rendered: `skipHtml` is on and `rehype-raw` is not used.
  User questions, file names and warnings are always plain text.
- Links use react-markdown's default URL filter, which removes `javascript:` and similar
  links. They open in a new tab with `rel="noopener noreferrer"`.
- Images are shown only for absolute `http(s)` URLs, with `referrerPolicy="no-referrer"`
  and `loading="lazy"`. Other image URLs show their alt text instead.
- Error messages come from the contract's safe `message` field or from generic client text.
  Raw server output, stack traces and proxy pages are never shown.

## Example questions

After uploading, for example, a contract PDF and a bill-of-quantities workbook:

- "What documents have I uploaded, and what does each contain?"
- "List every BOQ item with a total above 10,000 and give the sum."
- "What is the grand total of the bill of quantities, and which currency is it in?"
- "What are the key dates and deadlines in the contract?"
- "Which deliverables does the contract require, and when are they due?"
- "Do the contract value and the BOQ total match? If not, what is the difference?"
- "Which sheets in the workbook contain unit rates?"

Follow-up questions in the same conversation can refer to earlier answers.

## Known limitations

- **Cancel is client-side only.** The browser stops reading, but the server may finish the
  answer and store it; it can then appear in history after a reload.
- **No client-side size or count limits.** The server enforces them and reports `tooLarge`
  per file or `payload_too_large` for the whole request.
- **One upload at a time.** The panel is disabled until the current batch finishes.
- **The source panel is cramped in narrow windows.** It opens as a third column; below
  720 px the layout stacks into one column.
- **`traceId` is not shown.** Error trace IDs are kept on `ApiError` but not displayed.
- The session lives only as long as the browser tab and the server's in-memory session.

## Troubleshooting

| Symptom | Likely cause and fix |
|---|---|
| "Could not start a session" with a generic server error, and `http proxy error ... ECONNREFUSED` in the Vite terminal | The server is not running on port 5080. Start it, then click **Try again**. |
| "Could not reach the server. Check your connection and try again." | The Vite dev server itself is unreachable, or the network failed. Restart `npm run dev`. |
| Questions fail with a provider error (HTTP 502 `provider_unavailable`) | Claude could not be reached, usually because the server has no API key in its User Secrets, or the key is invalid. Configure it on the server and restart it. |
| The expired-session notice appears and documents disappear | The server restarted and lost its in-memory sessions. Upload the documents again. |
| `npm run dev` exits because port 5173 is in use | Stop the other process using port 5173 (the port is strict). |
