# Follow-ups

Deferred by the review loop: minors and pre-existing findings.

- [minor B2] `packages/core/tests/log.test.ts:33` The comment on line 6 of log.ts says DEL, U+2029 and the error-name path are covered. The 115 variant table tests none of them: it checks the scope only, with CR/LF, a tab and U+2028. Add rows for U+2029 and DEL (0x7f), and one row that puts a control character in the error's name, so the new expression is pinned for every kind it claims to handle. (round 1) <!-- fp:3f28b732a34c class:other -->
- [minor B8] `packages/core/src/log.ts:7` oneLine replaces line-breaking and control characters but lets Unicode format characters through: bidi overrides and isolates (U+202A–U+202E, U+2066–U+2069) and zero-width characters (U+200B–U+200F, U+FEFF). Each log line stays one line, but these characters can change how it looks in a terminal or log viewer, for example by reversing the reference id or hiding part of the scope. Before 115, the allow-list removed them. Fix: add \p{Cf} to the character class, and add a test row with a U+202E in the scope. (round 3) <!-- fp:35b6d0ca6b6f class:security -->
