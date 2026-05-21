---
id: TASK-112
title: >-
  Glossary marker issue, line split and special symbols e.g. "Harmony.. display
  issues
status: Done
assignee: []
created_date: '2026-04-30 21:24'
updated_date: '2026-05-07 22:17'
labels: []
milestone: m-5
dependencies: []
modified_files:
  - apps/capacitor/src/pages/reader/use-glossary-decorations.ts
  - apps/capacitor/src/pages/reader/paragraph.tsx
  - apps/capacitor/src/pages/reader/glossary-utils.ts
  - apps/capacitor/src/pages/reader/index.tsx
  - apps/capacitor/src/theme/monochrome.css
  - packages/core/src/changelog.ts
priority: medium
ordinal: 23000
---

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fixed glossary marker rendering and matching in the reader.

**Matching (`use-glossary-decorations.ts`)**
- Replaced `\b...\b` boundaries with Unicode lookarounds `(?<![\p{L}\p{N}_])...(?![\p{L}\p{N}_])` (with `u` flag) so labels with leading/trailing punctuation (`Harmony.`, `"Harmony"`) match correctly.
- Trim labels when building the regex so older entries with stray whitespace are not silently broken.

**Rendering (`paragraph.tsx`, `monochrome.css`)**
- Token splitting only happens at whitespace, so `"Problem....` is one token. Avatar lookup now accepts any range whose start falls within the token's byte span instead of requiring exact equality with `tokenOffset`.
- When the term is glued to leading punctuation, the token is split visually so the avatar renders directly before the matched label (`"⬤Problem` rather than `⬤"Problem`).
- Wrapped avatar + word in a `.glossary-marker-group` span with `white-space: nowrap` so the avatar can no longer be stranded at the end of a line while its term wraps to the next.

**Auto-strip on entry creation (`glossary-utils.ts`, `index.tsx`)**
- New `normalizeGlossaryLabel` strips surrounding non-letter/digit characters; applied in `findOrCreateGlossary` so a long-press on `pause.` or `"Harmony"` yields the clean labels `pause` / `Harmony`.
<!-- SECTION:FINAL_SUMMARY:END -->
