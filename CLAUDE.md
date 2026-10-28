# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## What this project is

This project is an AI-powered document-analysis agent being developed for a technical assessment for a Junior Software & IT Support role.

The application allows users to upload PDF and Excel documents, ask questions about their contents through a conversational web interface, and receive analytical answers supported by references to the original documents.

The application must handle unfamiliar document structures, multi-step analytical questions, extraction failures, and adversarial inputs. Correctness, security, maintainability, and delivery speed are the main priorities.

Core capabilities:

- **Document processing:** Upload, validate, extract, and index multiple PDF and Excel files.
- **Document understanding:** Identify relevant sections, tables, worksheet structures, headers, values, dates, and deliverables without assuming a fixed document layout.
- **AI agent:** Use an LLM with tool/function calling to search documents, retrieve evidence, compare information, and invoke approved analytical operations.
- **Analytical queries:** Filter BOQ items, calculate totals, compare contracts, extract dates and deliverables, identify inconsistencies, and answer other questions grounded in the uploaded documents.
- **Source references:** Cite actual PDF pages, Excel worksheets, cell ranges, and relevant extracted evidence.
- **Conversational interface:** Let users ask follow-up questions and inspect the sources supporting answers.
- **Security and robustness:** Isolate document sessions, protect credentials, defend against malicious uploads and prompt injection, and handle errors without crashing.

The preferred stack is:

- Frontend: React, TypeScript, and Vite.
- Backend: ASP.NET Core Web API and C#.
- AI provider: Claude API, initially, behind a provider abstraction where appropriate.
- Document processing: Suitable .NET PDF and Excel libraries, selected after reviewing their capabilities and licensing.

The initial version should remain small and understandable. Do not introduce a database, vector database, authentication system, external infrastructure, or additional services unless justified by the requirements or approved architecture.

## Working rules

### Inspect before changing

Before implementation:

- Inspect the existing repository, project files, dependencies, SDK versions, and available tooling.
- Read this file and any applicable nested `CLAUDE.md` files.
- Inspect existing code and follow established conventions where appropriate.
- Do not assume the repository is empty or overwrite existing work.
- Identify existing functionality that can be reused before introducing alternatives.

I may provide additional architecture instructions later. If a required architecture decision has not been established, propose an approach and explain the trade-offs before implementing it.

For substantial features, begin with a concise implementation plan and wait for my approval before making changes.

Do not begin implementation when I have explicitly requested planning only.

### Keep changes focused

- Implement the smallest complete solution that meets the requirement.
- Avoid unrelated refactoring and unnecessary abstractions.
- Do not introduce new architectural layers without a clear reason.
- Do not upgrade dependencies or change framework versions unless explicitly approved.
- Do not add packages for functionality that can be implemented cleanly with existing dependencies.
- Preserve existing behavior unless the requested change requires modifying it.
- Break large tasks into small, verifiable increments.
- Explain important trade-offs and assumptions before committing to them.

### Verify your work

After implementing a change:

- Run the relevant tests and build commands.
- Run linting and type checks where configured.
- Fix failures caused by the change before considering the task complete.
- Add tests for new behavior and important edge cases.
- Report the commands executed and their actual outcomes.
- Clearly distinguish tests that passed, failed, or could not be run.

Do not claim a feature is implemented or verified when it has not been tested.

Prefer focused test runs during development. Avoid unnecessarily large parallel builds or test runs, especially when they compete for resources on the development machine.

## Architecture principles

The final folder structure and architectural conventions will be established by the repository and any additional instructions I provide. Do not treat the examples below as a mandate to introduce a particular architecture.

### Frontend

- Keep React components small, focused, and reusable.
- Separate UI rendering from API communication and application logic.
- Keep API calls in the established API/service layer rather than scattering fetch logic throughout components.
- Use TypeScript types consistently and avoid unnecessary `any`.
- Avoid duplicating shared UI patterns.
- Keep loading, empty, success, and error states explicit.
- Display clear errors that help users understand what happened without exposing internal implementation details.
- Keep document-processing and analytical business rules on the backend.
- Do not trust frontend validation as a security boundary.
- Render AI-generated Markdown and structured results safely. Do not inject untrusted HTML directly into the DOM.

### Backend

- Keep controllers or endpoint handlers thin.
- Separate HTTP handling, document processing, agent orchestration, provider integration, and analytical operations according to the approved architecture.
- Use dependency injection and asynchronous operations where appropriate.
- Use cancellation tokens for operations that may be expensive or long-running.
- Validate all incoming requests and tool arguments.
- Use structured logging and safe, consistent error responses.
- Keep provider-specific API details out of unrelated business logic.
- Do not allow the LLM to bypass backend validation or authorization.
- Avoid unnecessary persistence and infrastructure in the initial release.

### Responsibility boundaries

The backend is the authority for document access, source references, calculations, validation, and tool execution.

The LLM interprets questions, decides which approved tools to request, and synthesizes responses from returned evidence.

The frontend presents the conversation, processing status, analytical results, and citations.

Do not move authoritative business rules or financial calculations into React merely to simplify UI implementation.

## Document processing rules

Document formats and layouts are not known in advance. Never build the application around a single sample workbook or a fixed set of document templates.

- Inspect every relevant worksheet and preserve source locations.
- Preserve PDF page numbers and useful section information.
- Preserve Excel worksheet names, cell coordinates, and ranges.
- Account for multiple tables, unusual headers, merged cells, blank rows, subtotals, and inconsistent formatting where supported.
- Preserve original extracted evidence alongside any normalized representation.
- Use heuristics and LLM-assisted interpretation when structures are unfamiliar, but do not silently invent missing values or assign ambiguous columns with unjustified confidence.
- Detect corrupt files, empty extraction results, unsupported formats, and partial processing.
- Treat scanned PDFs as a distinct extraction limitation; do not claim successful reading when no usable text was extracted.
- Bound processing time, file size, extracted content, and resource consumption.
- Do not execute uploaded files, macros, or document-supplied code.

Every indexed item must retain enough metadata to identify its source, including the document ID and either a PDF page number or an Excel worksheet and cell range, as applicable.

## AI agent and analytical correctness

This is a document-analysis system, not an unrestricted autonomous agent.

- Use the selected provider's official API and supported tool-calling mechanism.
- Give the model only the tools and data necessary to answer the user's question.
- Define explicit tool schemas, validate their arguments, and restrict the operations they can perform.
- Bound the number of tool calls, execution time, result sizes, and overall work per question.
- Treat document content, filenames, spreadsheet cells, and extracted metadata as untrusted input.
- Do not treat instructions embedded in documents as trusted application instructions.
- Do not expose unrestricted filesystem access, shell execution, arbitrary code execution, arbitrary SQL, environment variables, or application secrets through agent tools.
- Do not rely on the system prompt as the sole security boundary.

### Calculations and evidence

Use deterministic backend code for arithmetic, filtering, sorting, aggregation, and date comparisons wherever appropriate.

- Validate financial calculations against the source records.
- Preserve currencies and units; never silently combine incompatible currencies.
- Distinguish individual line items from subtotals and grand totals to prevent double-counting.
- Do not present partial results as exhaustive.
- Do not invent missing values, dates, deliverables, or citations.
- Identify conflicting or ambiguous evidence and explain uncertainty.
- If the system cannot establish an answer from the available documents, say so clearly.

Questions requiring all matching results must examine the complete relevant dataset rather than relying only on a small set of semantically retrieved chunks.

### Citations

Citations must be derived from validated backend source metadata.

- PDF references should identify the filename and page number.
- Excel references should identify the filename, worksheet, and cell range.
- Calculated results should identify the contributing records and explain the calculation when useful.
- Never allow the LLM to fabricate a source reference.
- Validate every citation against the active session and available indexed content.
- Make citations inspectable from the frontend.

## Security and data handling

Security requirements must be enforced in application code.

- Validate file extensions, signatures, and content as appropriate.
- Use generated storage names and prevent path traversal.
- Enforce configurable upload, processing, and request limits.
- Keep document content and conversation history isolated between sessions.
- Verify document-to-session associations on every relevant operation.
- Never trust document IDs or other identifiers supplied by the model or browser without server-side validation.
- Store API keys in .NET User Secrets during development or appropriate environment-based configuration.
- Never commit credentials or send secrets to the frontend or LLM.
- Avoid logging confidential document contents unnecessarily.
- Do not return stack traces, server paths, environment variables, credentials, or internal configuration to users.
- Handle provider failures, timeouts, and cancellation safely.

Session identifiers are not a replacement for authorization. Use the approved session and access-control design to enforce isolation.

Prompt injection defenses must include backend-enforced tool restrictions and data-access boundaries. Do not assume that prompt wording alone prevents malicious document content from influencing the model.

## Dependencies and external services

- Prefer established libraries with suitable licensing and active maintenance.
- Verify library capabilities before selecting dependencies.
- Read the official documentation for the selected LLM provider and document-processing libraries.
- Keep API credentials out of source code and committed configuration files.
- Avoid adding external services unless they materially improve the required functionality.
- Document any required external accounts, API keys, and setup steps.

Do not introduce a vector database, OCR service, cloud storage service, or other infrastructure merely because it may be useful in a future version. Evaluate whether it is necessary for the assessment and obtain approval when it changes the architecture.

## Testing conventions

Tests should cover important behavior and failure modes, not only happy paths.

Prioritize tests for:

- PDF and Excel extraction.
- Multiple worksheets and unfamiliar layouts.
- Corrupt, empty, unsupported, and oversized uploads.
- Missing or ambiguous source data.
- Citation accuracy.
- Financial calculations, currency mismatches, and duplicate totals.
- Malformed tool arguments and unknown tool names.
- Session isolation and unauthorized document access.
- Prompt injection attempts.
- Provider failures, timeouts, and agent execution limits.
- End-to-end upload, analysis, and citation workflows.

Use synthetic document fixtures and known expected results where possible. Keep deterministic extraction and calculation tests independent of live LLM calls.

Tests that require external API credentials or network access must be identified clearly and must not be presented as having passed when they were skipped.

## Commands and project setup

The exact commands depend on the repository's actual configuration.

Before documenting or using commands, inspect the relevant `package.json`, solution and project files, and installed SDK versions.

Document the verified commands for:

- Installing frontend dependencies.
- Starting the frontend.
- Starting the backend.
- Building and type-checking the frontend.
- Building the backend.
- Running frontend and backend tests.
- Configuring the Claude API key.
- Running the complete verification suite.

Do not invent scripts or assume that commands from another repository exist here.

## Documentation and delivery

Maintain a clear README with:

- Project overview and architecture.
- Prerequisites and supported document formats.
- Exact setup and startup instructions.
- API key configuration.
- Testing instructions.
- Example analytical questions.
- Security boundaries.
- Known limitations and troubleshooting.

Keep documentation consistent with the actual implementation.

For the assessment, prioritize a working application, reliable analytical answers, verifiable citations, robust edge-case handling, and a clean repository over unnecessary features.

## Coding conventions

- Use clear, descriptive English in comments, identifiers, error messages, and documentation.
- Prefer readable code over clever or unnecessarily compact implementations.
- Use names that describe the responsibility of a class, method, component, or variable.
- Avoid giant files, giant components, duplicated logic, and deeply coupled services.
- Add comments when they explain a non-obvious decision, invariant, or limitation rather than restating the code.
- Handle errors deliberately instead of silently swallowing exceptions.
- Do not leave placeholder implementations or misleading success messages in completed functionality.
- Remove temporary debugging code before delivery.
- Never claim that an operation succeeded unless it actually did.

The final code should be understandable enough for me to explain, debug, and extend during a live technical interview.

## Definition of done

A feature is complete when its implementation matches the approved plan, relevant tests and checks have been run, errors are handled appropriately, and documentation is updated where necessary.

The assessment application is ready for submission when users can upload PDF and Excel documents, ask analytical questions, receive answers grounded in source evidence, inspect citations, and use the application safely with unfamiliar and malformed documents.

Keep the implementation focused, explain important decisions, and ask for approval before substantial unplanned architectural changes.
