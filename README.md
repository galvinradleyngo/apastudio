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

## Homepage and saved drafts
- The homepage lists the three tools in workflow order (Citation Generator, Bibliography Formatter, Table Formatter). Table templates open from the Table Formatter card.
- Your bibliography text is saved automatically in this browser (localStorage); the homepage offers to resume or discard it. The built-in sample bibliography is never saved.
- Tests: `node tests/home-and-draft.test.js`.

## More features
- **Source types:** journal article, book (edition, translator), book chapter (editors, pages), webpage (optional retrieval date), news/blog article, video, podcast episode, social post, thesis, dataset, software, report, religious/foundational document.
- **Bibliography tools:** en-dash page ranges, automatic a/b year suffixes for same-author same-year works, one-click sentence-case fixes for flagged titles, BibTeX/RIS import, and an in-text citation vs reference-list check.
- **Export:** the bibliography, single citations and tables all download as real `.docx` files (Times New Roman; references use real Word styles (Heading 1 for "References" and a "Reference" paragraph style with the hanging indent) so you can restyle the whole list in Word, plus italics; APA rules-only borders and notes for tables).
- **Accessibility:** labelled form fields, live regions for status messages, visible keyboard focus.
- `apa_table_formatter.html` now just redirects to `index.html`.
- Tests: `node tests/features.test.js`.

## Rebuild from parsed parts
Format Bibliography can rebuild each pasted reference from its parsed fields (authors, date, title, source, volume/issue/pages, DOI/URL), so punctuation, initials, en dashes and italics all come from one generator. It is on by default (checkbox in the Bibliography Formatter).
- Italics are written as `*asterisks*` in the text box and shown as real italics in the preview, copy and export. You can type your own to mark italics.
- Capitalization you typed is never rewritten by the rebuild (use the "Fix it" button for sentence case).
- If an entry can't be read with confidence, or rebuilding would add, drop or change any word, it is left exactly as typed and the corrections list says why.
- Handled: name suffixes (Jr., Sr., III), hyphenated initials (J.-P.), long author lists with an ellipsis, and news/blog articles recognized from the URL (plain title, italic publication). For other sites, mark the publication with `*asterisks*`.

## Project layout
No build step; `index.html` loads classic scripts in this order:
- `js/reference-engine.js`: pure text logic (formatting, italics, citation generator, BibTeX/RIS). No DOM.
- `js/reference-parser.js`: reference parser and rebuild. No DOM.
- `js/web-metadata.js`: URL and page-metadata helpers.
- `js/app.js`, `js/table-formatter.js`, `js/bibliography-ui.js`, `js/citation-ui.js`, `js/export.js`, `js/main.js`: UI for each tool, exports, and startup.
- `worker/`: optional Cloudflare Worker for fetching pages. `tests/`: see below.

## Tests
`npm test` runs everything: `tests/engine.test.js` needs only Node; the browser tests need Playwright (`npm install`, then a Chromium build).
