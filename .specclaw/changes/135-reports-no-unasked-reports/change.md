# Reports chat: answer a question in chat, make a file only when asked

**Change:** 135-reports-no-unasked-reports · **Created:** 2026-11-16

## Problem

Asking the Reports bot for information about someone ("tell me about Nimal", "what is Ayesha's utilisation") gave a PDF report the user had not asked for. The export tool's description said only "Make a written PDF or Word report…", with nothing about when to use it, and no rule said that a question is answered in chat. The bot matched the word "utilisation" to the tool's "utilisation report" and made a file.

## Mock Delta

In chat, a question about a person gets a short written answer and, at most, an offer of a PDF. A file card appears only after "report", "PDF", "Word" or "download" is asked for. See [`135-reports-no-unasked-reports`](../../mock/index.html#135-reports-no-unasked-reports).

## Acceptance Criteria

1. **AC-1** The export tool's description starts with "ONLY when the user asks for a report, a PDF, a Word file, a document or a download (or to send something): never to answer a question", and names the read tools to use instead.
2. **AC-2** The Reports bot rules say a question about a person, project or number is answered in chat with get_person_utilisation, get_utilisation or get_delivery_pulse, that export_report is never called to answer a question, and that a file may be offered once ("Want a PDF of this?") and made after a yes.
3. **AC-3** Asking for a report, PDF, Word file or download still makes one, as before. No existing rule is edited.

## Tasks

- [x] `T1` — The tool description and the bot rule say "only when asked" (AC-1, AC-2, AC-3)
  Files: modules/reports/export-tool.ts, chat-rules.ts, tests/export.test.ts

## Verify

**Verdict:** PASS

- AC-1: pass — the export tool's description now starts "ONLY when the user asks for a report, a PDF…"; a test reads it from the tool registry.
- AC-2: pass — the new rule is in the Reports bot rules, before the "Report/PDF/Word" rule, and a test checks the key sentence. No existing rule was edited.
- AC-3: pass — the existing export tests still pass (a file card for "pdf", person, project and several-people reports).

Type-check clean. Reports tests: 27 of 27 pass. NOT verified: that the real bot now answers in chat. A model follows instructions rather than a fixed rule, so please try "tell me about Nimal" on localhost:3000 and say if it still makes a file; the next step would be to name more examples in the rule or to stop offering a file unless asked.

