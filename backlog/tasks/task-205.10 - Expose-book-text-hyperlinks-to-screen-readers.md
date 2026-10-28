---
id: TASK-205.10
title: Expose book-text hyperlinks to screen readers
status: To Do
assignee: []
created_date: '2026-10-28 18:32'
updated_date: '2026-10-28 18:33'
labels:
  - accessibility
  - reader
milestone: m-14
dependencies: []
parent_task_id: TASK-205
priority: low
ordinal: 194000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Follow-up from TASK-205.6 (planner decision c, 2026-10-28). Hyperlinks inside book text (TASK-153) render as styled word spans (.word-link) and open through the delegated word tap (handleWordTap -> findLinkAt). TalkBack does not announce them as links and cannot activate them: after TASK-205.6 an accessibility click on book text is deliberately ignored so it never saves a position. Expose each link range as a link (role=link with its href as accessible name, or a real anchor around the range) that TalkBack can focus and activate, without changing word spans, data-word, column pagination or the no-save rule for plain text.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A link in book text is announced by TalkBack as a link with a meaningful name
- [ ] #2 Activating it with TalkBack opens the link, as a sighted tap does, and does not save a reading position
- [ ] #3 Word spans keep data-word; plain-text paragraphs still read as one paragraph
<!-- AC:END -->
