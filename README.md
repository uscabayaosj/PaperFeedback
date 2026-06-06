# Writing Assessment Tool

A Google Apps Script tool for assessing writing assignments against a rubric using an OpenAI-compatible API (GPT-4o, Claude, etc.).

- Ulysses Cabayao, SJ (2024) — Debugged & optimized June 2026

## Table of Contents
- [Overview](#overview)
- [Features](#features)
- [Installation](#installation)
- [Usage](#usage)
- [Bug Fixes & Optimizations](#bug-fixes--optimizations)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

## Overview

This tool adds a **Writing Assessment** menu to Google Docs. Teachers can:

1. Upload a rubric (PDF or Google Doc)
2. Run AI-powered assessment of student writing against the rubric
3. Get detailed feedback on argument, grammar, structure, content, and style

## Features

- **Upload rubric** from Google Drive or a local PDF file
- **AI-powered assessment** using any OpenAI-compatible API endpoint
- **Per-user rubric storage** — each user has their own rubric in a shared deployment
- **Cached rubric interpretation** — same rubric can assess multiple papers without re-processing
- **Automated result document** — creates a new Google Doc with the assessment and links it back

## Installation

1. Create a new Google Apps Script project.
2. Copy `code.gs` and `UploadOptions.html` from this repository into your project.
3. Save the project.
4. In your Google Doc, click **Extensions → Apps Script** to open the editor.
5. Run the `onOpen()` function once to authorize the script.
6. Reload the Google Doc. A new **Writing Assessment** menu will appear.

## Usage

1. Open a Google Doc containing a student's writing assignment.
2. Click **Writing Assessment → Upload Rubric...**
3. Choose a rubric (PDF from Drive or local file) and upload it.
4. Click **Writing Assessment → Assess Writing**
5. Enter your OpenAI-compatible API endpoint URL.
6. Enter your API key.
7. Wait for the AI to process (10–30 seconds).
8. A new document is created with the assessment. A link appears at the bottom of your current document.

> **Tip:** If you are assessing multiple papers against the same rubric, the rubric interpretation is cached. You only need to re-enter the server URL and API key for each assessment (or modify the script to cache those too).

## Bug Fixes & Optimizations

This section documents the changes made during the June 2026 debug/optimization pass.

### 🐛 Bugs Fixed

| # | Issue | Fix |
|---|-------|-----|
| 1 | Raw base64 PDF binary sent as chat text — LLMs cannot interpret it | Added multimodal API support (`image_url` with PDF data URI) for PDFs; Google Docs are read as text directly |
| 2 | `ScriptProperties` used instead of `UserProperties` — all script users shared the same rubric | Changed to `getUserProperties()` for per-user isolation |
| 3 | No loading/feedback during 20–30s API calls | Added spinner and disabled state in the upload dialog |
| 4 | `getRubricFolder()` searched Drive by name every call — slow and fragile | Cached folder ID in `UserProperties`; added stale-cache recovery |
| 5 | `new Date().toLocaleString()` produced slashes/commas in filenames | Replaced with `Utilities.formatDate()` using ISO-style format |
| 6 | Loose regex `[-\\w]{25,}` matched non-ID strings in URLs | Three-pattern parser targeting `/d/ID`, `?id=ID`, `open?id=ID` |
| 7 | No input validation on document body or Drive URLs | Added emptiness check (min 50 chars) and URL format validation |
| 8 | Rubric re-downloaded and re-interpreted for every assessment | Cached interpreted rubric text in `UserProperties` on first use |

### ⚡ Efficiency Improvements

- **Extracted shared API logic** into `makeApiOptions()` and `parseApiResponse()` helper functions
- **Added `clearRubric()` function** — accessible from the upload dialog and the menu
- **PDF file type validation** — rejects non-PDF, non-Google-Doc files with a clear message
- **120-second timeout** on API calls (up from default) for long-running LLM responses
- **Better error messages** — invalid URL, empty document, server connection failures all have specific messages
- **Model field exposed** in payload construction — change `model` in `interpretRubric()` or `assessAgainstRubric()` to use a different model

### 🔮 Future Improvements

- [ ] **Mistral OCR integration** — use the existing `mistral/ocr/structured_ocr.ipynb` pipeline to extract text from PDFs before sending to the LLM (avoids vision API costs and improves accuracy)
- [ ] **Server URL + API key caching** — optionally store credentials in `UserProperties` to avoid re-entering on every assessment
- [ ] **Batch assessment** — assess multiple student documents in one run
- [ ] **Rubric versioning** — track which rubric version was used for which assessment

## Troubleshooting

| Symptom | Likely Cause | Solution |
|---------|-------------|----------|
| "No Rubric" error | Rubric not uploaded | Click **Upload Rubric...** first |
| "Failed to connect" | Wrong server URL or API key | Verify the endpoint (should end in `/v1`) and API key |
| "Failed to interpret" | PDF can't be read by vision API | Convert rubric to a Google Doc and upload from Drive instead |
| Menu doesn't appear | Script not authorized | Run `onOpen()` manually in the Apps Script editor once |
| Assessment is empty | Document has < 50 characters | Add more content to the document |

## Contributing

Fork the repository and submit a pull request. For major changes, open an issue first.

## License

MIT License. See the [LICENSE](LICENSE) file for more information.