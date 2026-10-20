---
id: TASK-201
title: 'Read aloud: auto-continue serial chapters'
status: To Do
assignee: []
created_date: '2026-10-20 21:34'
labels:
  - tts
milestone: m-14
dependencies:
  - TASK-85
ordinal: 162000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
When read aloud reaches the end of a serial chapter, fetch/open the next chapter and keep reading aloud. Each serial chapter is its own book row and the reader remounts per chapter (`<BookReader key={id}>`), so this needs an auto-start flag that survives the remount plus `chapterAdvance.tryAdvance()` on finished. Follow-up to TASK-85.
<!-- SECTION:DESCRIPTION:END -->
