---
id: TASK-130
title: Convert monochrome.css residual styles to tailwind
status: To Do
assignee: []
created_date: '2026-05-20 01:30'
labels:
  - frontend
  - tech-debt
  - capacitor
dependencies: []
modified_files:
  - apps/capacitor/src/theme/monochrome.css
  - apps/capacitor/src/theme/legacy.css
  - apps/capacitor/src/theme/variables.css
  - apps/capacitor/src/pages/reader/rsvp-view.tsx
  - apps/capacitor/src/pages/reader/rsvp-controls.tsx
  - apps/capacitor/src/pages/reader/appearance-popover.tsx
  - apps/capacitor/src/pages/reader/selection-toolbar.tsx
  - apps/capacitor/src/pages/reader/glossary-avatar.tsx
priority: low
ordinal: 25000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
After Ionic removal, ~1474 LOC remain in `apps/capacitor/src/theme/monochrome.css`. Mostly RSVP display + controls, reader-paragraph/heading/progress-bar, appearance-popover layout (`ap-*`), glossary avatar markers, selection toolbar. Convert to tailwind utilities in their component files, then delete monochrome.css + legacy.css and drop the legacy cascade layer from variables.css.

**Scope**
- RSVP: `.rsvp-display`, `.rsvp-overlay-root`, `.rsvp-word-line`, `.rsvp-focal`, `.rsvp-context-*`, `.rsvp-controls`, `.rsvp-playpause`, `.rsvp-wpm-*`, `.rsvp-dict-button`, `.rsvp-settings-button`, `.rsvp-scroll-spacer`
- Reader: `.reader-paragraph`, `.reader-heading`, `.reader-progress-bar` + fills/labels, `.reader-skeleton-line`
- Appearance popover: `.ap-section`, `.ap-row`, `.ap-step-btn`, `.ap-chip`, `.ap-label`
- Glossary: `.glossary-avatar`, `.glossary-inline-avatar`, `.glossary-marker-group`
- Selection: `.selection-toolbar`, `.selection-handle`, `.selection-color-swatch`
- Misc: `.cover-image`, `.cover-image-fallback`, `.next-chapter-footer`, `.rsvp-preview-*`, `.content-container`

**Why**: shared `--reader-bg`/`--reader-text` CSS vars work but make theme switching brittle. Tailwind tokens (`--background`, `--foreground`) already wired per theme. Eliminates last bespoke CSS layer.

**Risk**: RSVP visual layout is precise (focal letter alignment, container queries). Convert one section at a time; visual diff each.
<!-- SECTION:DESCRIPTION:END -->
