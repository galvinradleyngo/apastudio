# APA Formatting Studio (7th Edition)

A modern, browser-based academic formatting workspace for researchers, educators, and students.

## Features

1. **Table Formatter**:
   - APA 7th Edition compliant tables (no vertical borders, double-spaced headers, left-aligned stub columns).
   - Pre-configured blueprints: Descriptive Statistics, Correlation Matrix, Themes & Quotes Matrix, and Participant Demographics.
   - Import tables directly from Word, Excel, Google Docs, or Google Sheets.
   - Export to Word (`.doc`) with native table styling.

2. **Bibliography Formatter**:
   - Paste existing references in any format.
   - Automatic alphabetization by first author surname and publication year.
   - Hanging-indent formatting (0.5 inch).
   - APA 7 metadata validation checks (author formats, dates, title casing, DOIs).

3. **Citation Generator (from PDF or Web Link / DOI)**:
   - **Upload PDF File**: Drag & drop or browse academic PDFs; extracts embedded metadata and searches for DOIs within the paper using PDF.js.
   - **Web Link / DOI**: Paste DOIs (`10.xxxx/...`), arXiv preprints, or webpage URLs. Resolves against official Crossref and DataCite registries.
   - Generates both full APA 7 reference entries and in-text citations (parenthetical and narrative).
   - Interactive metadata review and 1-click addition directly into the Bibliography Formatter.
   - 1-click rich-text copy and Word export.


## URL handling notes
- Web links resolve in this order: DOI in the link, arXiv, YouTube (oEmbed), Wikipedia, then page metadata (JSON-LD, Dublin Core, `citation_*`, Open Graph). If the page title matches a published work in Crossref, that record is used. If the live page is blocked, the Wayback Machine copy is tried.
- Fields are marked green (found in source), amber (guessed from the link) or red (missing) so you know what to verify. Editing a field clears its marker.
- Optional: deploy `worker/metadata-proxy.js` (see `worker/README.md`) for more reliable page fetching.
- Tests: `node tests/url-metadata.test.js` (requires Playwright).
