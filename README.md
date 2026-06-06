# Writing Assessment Tool

A Google Apps Script tool for assessing writing assignments against a rubric using **OpenRouter** (access to GPT-4o, Claude, Gemini, Llama, Mistral, and 200+ models).

- Ulysses Cabayao, SJ (2024) — OpenRouter integration June 2026

## Table of Contents
- [Overview](#overview)
- [Features](#features)
- [Installation](#installation)
- [Usage](#usage)
- [OpenRouter Configuration](#openrouter-configuration)
- [Recommended Models](#recommended-models)
- [How It Works](#how-it-works)
- [Bug Fixes & Optimizations](#bug-fixes--optimizations)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

## Overview

This tool adds a **Writing Assessment** menu to Google Docs. Teachers can:

1. Upload a rubric (PDF or Google Doc)
2. Run AI-powered assessment of student writing against the rubric
3. Get detailed feedback on argument, grammar, structure, content, and style

All AI calls go through **OpenRouter**, giving you access to 200+ models from a single API key.

## Features

- **Upload rubric** from Google Drive or a local PDF file
- **OpenRouter-powered assessment** — choose from GPT-4o, Claude, Gemini, Llama, Mistral, and more
- **Per-user settings** — each user has their own API key and model preferences
- **Cached rubric interpretation** — same rubric can assess multiple papers without re-processing
- **Automated result document** — creates a new Google Doc with the assessment and links it back

## Installation

1. Create a new Google Apps Script project.
2. Copy `code.gs`, `UploadOptions.html`, and `Settings.html` from this repository into your project.
3. Save the project.
4. In your Google Doc, click **Extensions → Apps Script** to open the editor.
5. Run the `onOpen()` function once to authorize the script.
6. Reload the Google Doc. A new **Writing Assessment** menu will appear.

## Usage

1. **Get an OpenRouter API key** at [openrouter.ai/keys](https://openrouter.ai/keys)
2. Open a Google Doc containing a student's writing assignment.
3. Click **Writing Assessment → OpenRouter Settings...**
4. Enter your OpenRouter API key and choose your preferred models.
5. Click **Writing Assessment → Upload Rubric...**
6. Upload a rubric (PDF from Drive or local file).
7. Click **Writing Assessment → Assess Writing**
8. Wait for the AI to process (10–30 seconds).
9. A new document is created with the assessment. A link appears at the bottom of your current document.

> **Tip:** If you are assessing multiple papers against the same rubric, the rubric interpretation is cached. You only need to set up your API key once — it's stored per user in the script's UserProperties.

## OpenRouter Configuration

Open the **Writing Assessment → OpenRouter Settings...** dialog to configure:

| Setting | Description | Default |
|---------|-------------|---------|
| **API Key** | Your OpenRouter API key (`sk-or-v1-...`) | — |
| **API Base URL** | API endpoint | `https://openrouter.ai/api/v1` |
| **Rubric OCR Model** | Model for reading PDF rubrics (vision) | `openai/gpt-4o` |
| **Assessment Model** | Model for writing assessment | `openai/gpt-4o` |

Settings are stored per-user via `UserProperties`, so multiple teachers using the same script deployment have independent configurations.

## Recommended Models

### For Rubric OCR (vision)
| Model | Pros | Cost |
|-------|------|------|
| `openai/gpt-4o` | Best all-round vision, fast | ~$5/M tokens |
| `anthropic/claude-3.5-sonnet` | Excellent document reading | ~$3/M tokens |
| `google/gemini-2.0-flash-001` | Fast, cheap, good quality | ~$0.10/M tokens |
| `qwen/qwen-vl-plus` | Strong vision, very affordable | ~$0.50/M tokens |

### For Writing Assessment (text)
| Model | Pros | Cost |
|-------|------|------|
| `openai/gpt-4o` | Best all-round, detailed feedback | ~$5/M tokens |
| `anthropic/claude-3.5-sonnet` | Excellent nuance and writing critique | ~$3/M tokens |
| `anthropic/claude-3-opus` | Deepest analysis (slower) | ~$15/M tokens |
| `meta-llama/llama-3.3-70b-instruct` | Good quality, low cost | ~$0.50/M tokens |
| `deepseek/deepseek-chat` | Very cheap, solid quality | ~$0.15/M tokens |

*Prices are approximate — check [openrouter.ai/models](https://openrouter.ai/models) for current rates.*

## How It Works

```
Upload Rubric (PDF/Doc)
       ↓
Apps Script stores in "Writing Assessment Rubrics" folder
  (caches rubric file ID in UserProperties)
       ↓
Assess Writing triggered
       ↓
If rubric not yet interpreted:
  → Send PDF to OpenRouter vision model → extract rubric text
  → Cache extracted text in UserProperties
       ↓
Send student writing + rubric text to OpenRouter assessment model
       ↓
Create new Google Doc with assessment feedback
  → Insert link in original document
```

## Bug Fixes & Optimizations

This section documents changes made during the June 2026 debug/optimization pass.

### 🐛 Bugs Fixed

| # | Issue | Fix |
|---|-------|-----|
| 1 | Raw base64 PDF binary sent as chat text — LLMs cannot interpret it | Added multimodal API support (`image_url` with PDF data URI) for PDFs; Google Docs read as text directly |
| 2 | `ScriptProperties` used instead of `UserProperties` — all script users shared one rubric | Changed to `getUserProperties()` for per-user isolation |
| 3 | No loading/feedback during 20–30s API calls | Added spinner and disabled state in dialogs |
| 4 | `getRubricFolder()` searched Drive by name every call — slow and fragile | Cached folder ID; added stale-cache recovery |
| 5 | `new Date().toLocaleString()` produced slashes/commas in filenames | Replaced with `Utilities.formatDate()` |
| 6 | Loose regex matched non-ID strings in URLs | Three-pattern parser: `/d/ID`, `?id=ID`, `open?id=ID` |
| 7 | No input validation on document body or Drive URLs | Min 50-char check; URL format validation |
| 8 | Rubric re-downloaded and re-interpreted for every assessment | Cached interpreted rubric text in UserProperties |

### ⚡ Improvements

- **OpenRouter integration** — one API key for 200+ models
- **Settings dialog** — configure API key, base URL, and models without editing code
- **OpenRouter headers** — `HTTP-Referer` and `X-Title` for dashboard tracking
- **Reusable API helpers** — `makeApiOptions()` and `parseApiResponse()` with OpenRouter-specific error logging
- **12 preset models** to choose from via dropdown, with custom model support
- **Cached credentials** — API key and preferences stored per user, entered once

## Troubleshooting

| Symptom | Likely Cause | Solution |
|---------|-------------|----------|
| "OpenRouter Not Configured" | API key not set | Go to **OpenRouter Settings...** and enter your key |
| "Failed to interpret rubric" | Vision model doesn't support PDFs | Switch to `openai/gpt-4o` or `anthropic/claude-3.5-sonnet` |
| "Failed to connect" | Wrong base URL or API key | Verify in Settings; check your OpenRouter credits at [openrouter.ai](https://openrouter.ai) |
| "Failed to get assessment" | Model unavailable or rate-limited | Try switching to a different assess model (e.g., `openai/gpt-4o` or `google/gemini-2.0-flash-001`) |
| Menu doesn't appear | Script not authorized | Run `onOpen()` manually in the Apps Script editor |
| Assessment is empty | Document has < 50 characters | Add more content to the document |
| PDF interpretation timing out | Large PDF with many pages | Use a Google Doc rubric instead, or try a faster model like `google/gemini-2.0-flash-001` |

## Contributing

Fork the repository and submit a pull request. For major changes, open an issue first.

## License

MIT License. See the [LICENSE](LICENSE) file for more information.