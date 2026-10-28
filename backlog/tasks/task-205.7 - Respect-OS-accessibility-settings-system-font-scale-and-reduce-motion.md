---
id: TASK-205.7
title: >-
  OS accessibility settings: verify system font scale handling, make it
  position-safe, and respect reduce motion
status: Done
assignee:
  - '@claude'
created_date: '2026-10-20 22:23'
updated_date: '2026-10-28 22:04'
labels:
  - accessibility
  - android
milestone: m-13
dependencies:
  - TASK-205.8
parent_task_id: TASK-205
priority: medium
ordinal: 179000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Users who raise Android's system font size or turn on "remove animations" expect apps to follow.

**Font scale.** The original premise was "the OS scale is ignored". The 2026-10-21 review found it is probably false. Nothing sets WebView textZoom (MainActivity.java, capacitor.config.json), and Android WebView's default textZoom follows the system font scale. So the OS scale is most likely already multiplied onto the app UI size (theme-context.tsx sets the root font-size in px) and onto the reader font px (scroll-view.tsx, page-view/chunk-content.tsx). This is not yet verified on a device with font_scale != 1.0.
- Seeding defaults from fontScale would apply the scale twice.
- Adding setTextZoom(100) would shrink text for existing users who have a large OS scale.

**Progress risk.**
- AndroidManifest configChanges has no fontScale, so an OS scale change recreates the activity. The position then survives only through the pause flush.
- If fontScale is added to configChanges instead, page mode's layoutKey (page-view/index.tsx) ignores textZoom, and the ResizeObserver only watches container size. A text-only reflow would not re-anchor, and the next settle would save an unrelated word.
- Scroll mode is protected by the TASK-174 hasMoved rule.

If seeding from the OS scale turns out to be needed, read fontScale by extending the existing DeviceInfoPlugin (the web build has no equivalent). Seeds must not stamp settings updatedAt, because readerFontSize is synced and TASK-190 is about fresh installs overwriting synced settings.

**Reduce motion.** Support is partial today: framer MotionConfig reducedMotion="user", a check in the scroll-follow jump, and one goal-animation media query. The app uses TanStack router with no Ionic and no route transitions, so the reader-unmount timing is unaffected. The page-turn settle runs on a timer, not transitionend. E-ink mode already proves that `transition:none !important` is safe.

Step one: verify on device, then decide. Scaling may already work, in which case the work is layout fixes and position safety.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Verified on an Android device with a large system font scale whether WebView textZoom already applies it; finding documented in the task
- [x] #2 Chosen approach does not apply the OS scale twice and does not change text size for existing installs
- [ ] #3 If defaults are seeded from the OS scale: seeding does not bump settings updatedAt and never overrides server settings adopted on first pull (TASK-190)
- [x] #4 Changing the OS font scale while a book is open (scroll and page mode) does not save a different word; reopening after a scale change between sessions restores the same word
- [x] #5 Layouts (tab bar, sheets, settings rows, reader chrome) do not clip or overlap at the largest Android font scale
- [x] #6 With OS reduce-motion / remove-animations or prefers-reduced-motion on: sheet/drawer, popover, page-turn and goal animations and read-aloud follow smooth scrolling are disabled or instant
- [x] #7 Reduce-motion CSS reuses only the motion rules of eink.css (animation, transition, scroll-behavior), not its box-shadow/backdrop overrides
- [ ] #8 pnpm build and Android build succeed; Playwright e2e covers prefers-reduced-motion (no page-turn animation, position unchanged across turns); existing position-*, page-mode-* and eink-mode e2e specs pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Constraint (2026-10-28): no Android device or emulator here (no AVDs, no system images). On-device checks are blocked; everything else is done in the browser.
A) Reduce motion, fully: one shared motion-off CSS block for e-ink and reduce-motion; page turns non-animated (settle path unchanged); smooth scrolls instant; e2e with Playwright reducedMotion.
B) Font scale, safe part only: no seeding from fontScale, no setTextZoom. Emulate textZoom 200% in the browser, fix clipping/overlap, add a layout e2e. AC4: cover the activity-recreate path (reload after a move at a doubled scale) with an e2e; on-device confirmation stays blocked.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
BLOCKED on device (2026-10-28): AC1 needs an Android device or emulator with font_scale != 1.0. None available (no AVDs, no system images). Unverified: whether WebView textZoom already follows the OS scale (most likely, since nothing sets textZoom).

Font scale (safe part only):
- No seeding from fontScale, no setTextZoom (AC2: text size unchanged for existing installs, since no code touches the scale). AC3 is N/A: nothing is seeded.
- textZoom emulation (e2e/helpers/text-zoom.ts): textZoom multiplies every computed font size, and rem lengths follow the zoomed root, while px lengths stay. Chrome has no text-only zoom. CDP minimum-font only lifts small text; CSS zoom scales px lengths too and breaks floating-ui popover placement. So the helper doubles the root font-size the app sets, every text-[Npx] utility, inline px font sizes, and the reading text (via a stylesheet, so the reader's first measure already sees it). Known gap: two px font sizes in monochrome.css stay unscaled.
- Layout check (e2e/helpers/layout-check.ts): text lines that run off screen, spill out of their button, get cut sideways by an overflow-hidden box, or overlap other text. Ellipsis and line-clamp count as deliberate. Text under the header or tab bar, clipped away, or inside a closed details is skipped. It scrolls the main scroller so every row is checked. A control test proves it flags overlap and spill.
- Fixes for 200% at 412px: SettingsRow (StepperRow etc.) wraps the control below a label that would be squeezed (label flex 1 1 10rem); the appearance popover is capped at Radix available width, its rows wrap, step buttons grow (min-width/min-height), toggle labels wrap, and long font names break; the annotations sheet toggle scrolls sideways instead of overlapping labels; theme cards use an auto-fit grid (stack when narrow); font card labels break-words; sync sign-in buttons wrap their text. 1x layout checked unchanged (checker clean, screenshots compared).
- AC4: android:configChanges has no fontScale (AndroidManifest.xml:19), so a scale change recreates the activity and the WebView reloads. The position then survives through the reader's background flush (pagehide / visibilitychange / Capacitor pause, mirrored to localStorage by savePosition). e2e/position-font-scale.spec.ts reloads right after a move under the doubled text zoom (reading text asserted at 32px) in page and scroll mode: the same word is on screen and the saved row keeps it. Not covered without a device: an in-place change if fontScale were ever added to configChanges (page mode's layoutKey would not see a textZoom reflow), and the real Android pause-to-recreate timing.

Reduce motion:
- src/theme/motion.css: the one motion-off block (animation none, transition none, scroll-behavior auto, unlayered !important) for html.eink and html.reduce-motion. eink.css keeps only its box-shadow/backdrop overrides. index.html's inline script mirrors prefers-reduced-motion into html.reduce-motion before first paint and on change. Frozen indeterminate progress shows full width at reduced opacity (e-ink keeps its stripes). The old goal-only media query in monochrome.css is removed, since the shared block covers it.
- Page turns: animatePageTurns is off while motion is reduced (usePrefersReducedMotion, which covers e-ink and the OS setting). This is the same no-animation path e-ink uses, so turns settle synchronously; CSS alone would only hide the slide and keep the 220 ms wait.
- Smooth scrolls: scroll-view smoothScrollBy jumps at once when isMotionReduced() (now exported from @lesefluss/ui). This covers read-aloud follow, follow jumps, and the smooth chapter/scrub jumps; the follow branch's own media check is folded in.
- framer-motion: MotionConfig reducedMotion user, unchanged.
- e2e/reduced-motion.spec.ts (contextOptions reducedMotion reduce, with no-preference controls): no element transitions or animates with the appearance popover and annotations drawer open; page turns are instant (transform changed, transition 0s, no animations) and each turn saves its first word, contiguously; read-aloud follow moves the scroller in one step (more than 2 steps under no-preference).

Open: reduce-motion also stops spinners (animate-spin), as in e-ink. AC7 asked for e-ink's rules as they are; a slowed spinner would need its own exception.

Results (2026-10-28): vitest 1455/1455; tsc app + e2e clean; biome clean on changed files (pre-existing hits only: reader/index.tsx useExhaustiveDependencies x3, monochrome.css noEmptyBlock x2); pnpm run sync (build + cap sync) ok; android ./gradlew assembleDebug ok (no device to install on). New specs green when run before the no-e2e rule: reduced-motion 5/5 (x2), large-text-layout 3/3, position-font-scale 2/2 (x2). The full suite was stopped at 80 passed / 0 failed when the planner took over e2e. AC8 stays open until the planner's full run (existing position-*, page-mode-*, eink-mode). AC5 is checked against the browser emulation, not a device.

Review round 1 fixes (2026-10-28):
- Settings rows: RowLabel takes flex 1 1 6rem (only used in single-line rows), and controls carry ml-auto, so a wrapped control stays right-aligned. The arbitrary first-child basis is gone; it wrapped StepperRow at 1x on 360dp. Popover rows keep value and steppers in one .ap-row-control group; each row's control is right-aligned.
- Theme cards: grid-cols-3, or one column under a container query (@max-[16rem]), never 2+1.
- Planner decision: under OS reduce-motion, spinners (.animate-spin) keep turning; e-ink still stops them. motion.css: one rule, split selectors. The indeterminate-bar width is one :is(.eink, .reduce-motion) rule; e-ink adds stripes, reduce-motion 0.4 opacity. The cascade comment is corrected (layered !important beats unlayered; the claim is dropped).
- Page animation: readerLayoutFor(settings, isEinkMode, isOsMotionReduced) returns pageTurnAnimationOffBy (eink | reduce-motion | null) and is the single source. The reader uses its effective value. The popover and Settings > Reader show the control disabled, with the hint "Off while system reduce motion is on". useOsPrefersReducedMotion (media only) is added to @lesefluss/ui. The popover remount key includes the OS reduce-motion state.
- Annotations sheet toggle labels wrap (wrap-anywhere) instead of scrolling sideways. Font cards and popover font items use wrap-anywhere, cards min-w-0; the wrapped sign-in ghost button is text-center.
- px to rem: .selection-toolbar-action and .reader-goal-divider-label (0.6875rem), goal-chart SVG label (0.625rem). The selection toolbar wraps if a large scale outgrows one row; at 1x it stays one row.
- NavRow subtitles are line-clamp-2 instead of truncate: a single ellipsised line kept about 40 % of the text at 200 %. The reader preview window is marked data-clips-text.
- view-types.ts jumpTo comment updated. Behaviour change worth noting: smooth jumps (BLE device follow, back-to-voice, read-aloud follow) are now instant in e-ink mode as well (isMotionReduced covers e-ink).
- Tests: layout-check rewritten (top/bottom spill and clip; scroll-container-only skip; fixed/sticky bars with horizontal overlap; horizontal strips the only off-screen exemption; ellipsis/clamp under 50 % reported; fonts.ready; 2 rAFs per scroll step; one control per rule). text-zoom wraps the inline font-size setters, so the real inline px is scaled before the first layout; the MutationObserver handles only mutation targets and added nodes; adoptedStyleSheets avoid a null head. large-text-layout runs at 200 % (412) and 100 % (360x740) with reduced motion over onboarding, library, stats, explore (catalog mocked), all settings pages, reader, popover, annotations, selection toolbar, RSVP, book page and goal sheet. reduced-motion: the page turn must settle inside the key's own task (control: 0 without the preference); follow and a BLE smooth jump compare first vs final scrollTop; library checked; the disabled page animation control is checked. elementsInMotion moved to e2e/helpers/motion.ts and is shared with eink-mode. position-font-scale: no-wait flush variants (reload alone; visibilitychange hidden + pagehide first) with no save requested before the reload; the 32 px check is replaced by page count / paragraph line count growing.
- Checks: tsc app + e2e clean; biome clean on my files; build ok. vitest: 1470 passed; 3 failed in services/db/__tests__/reading-session-delete.test.ts, an untracked TASK-162 file in the other worker's area, not touched here. E2E not run (planner runs it).

Verifier HIGH fix (2026-10-28): text-zoom.ts never scaled. Chromium keeps style properties on each CSSStyleDeclaration instance, not the prototype, so the setter wrap never installed. It now overrides the HTMLElement.prototype.style accessor with a cached Proxy that scales fontSize and setProperty("font-size"). Confirmed in a standalone headless-Chromium probe on about:blank: 16px becomes 32px for an element and the root; other properties are untouched; style identity holds. Kept synchronous rather than a style-attribute MutationObserver, which would scale only after React's commit, i.e. after page mode has measured its columns. Both specs assert the computed root and reading-text sizes are actually doubled (zoomedSizes). position-font-scale: the reload-alone flush variant reads save-request counts inside pagehide (capture listener before the reader's flush, another after it, kept in sessionStorage) and reloads on the first frame the list has moved; the background variant counts synchronously around the dispatched events. The mid-slide variant is retitled as a nothing-else-saved guard. useOsPrefersReducedMotion is dropped: readerLayoutFor checks e-ink first, so the existing usePrefersReducedMotion gives the same result.

E2E round 1 (2026-10-28):
- Library h1 'truncated to 0%': by design. TabHeader lets the title yield to the actions (logo stays); marked data-clips-text, which the checker now honours for truncation too.
- Popover spills (OpenDyslexic, A-, A+, -, +): checker false positive. The controls have no vertical padding and line-height 1, so a glyph's content area pokes a pixel past the box with no visible ink. Vertical spill/clip now allows a quarter line. .ap-step-btn also gets flex-shrink: 0 against real horizontal squeezing.
- 1x reader-preview overlap: checker bug. Text inside a data-clips-text box is skipped entirely.
- Strip control: checker bug. inStrip / isScrolledAway walked from the text's parent's parent and missed a scroller that is the text's own parent.
- 1x RSVP 'clipped: 0': most likely the progress label's '0' of a reader view stretched by the overflow-clip/min-height bug (TASK-205.6 HIGH 2, now min-h-0). Needs the rerun to confirm.
- position-font-scale reload-alone race: the page now reloads itself from a rAF loop in the first frame the list has moved 400 px (mid-scroll, so the settle cannot have run). The background variant dispatches its events in the same frame. pagehide counts are kept in sessionStorage.

Targeted-run fixes (2026-10-28):
- Explore at 200%: the hero wraps (text column flex 1 1 10rem drops below the cover; the title breaks long words), and shelf headers wrap (the title takes its own line instead of truncating, actions ml-auto). 1x on 360px keeps the hero side by side.
- RSVP paused (both scales): pre-existing, not from min-h-0. The paused view shows a fixed 50 words of context above and below the focal word (CONTEXT_PEEK_WORDS), absolutely positioned and unbounded, so on a short screen the next-context ran under the controls and the progress line. .rsvp-display-inner is now a size container. The peeks get a max-height in cqh: the next one stops above the paused controls (bottom 24px + about 111px + gap), the previous one keeps the lines nearest the word (flex-end); both fade at the cut edge (mask, -webkit- too) and are marked data-clips-text.

Rerun fixes (2026-10-28):
- Book page facts (200%): the dl grid is auto-fit (minmax 7.5rem): two columns at 1x, even on 360px, and one at 200%; values wrap (no truncate).
- Explore shelf tile title clamp (49%): deliberate. The fixed-width cover tile shows a 2-line teaser, the full title stays in the button's name and on the book page. result-card and web-novel-card titles are marked data-clips-text.
- position-font-scale flush variants: a trace showed the only save is the reader's own pagehide flush. At the window, Chrome runs pagehide listeners in the order they were added, not capture-first, so the old 'before' listener ran after the flush. 'Before' is now taken in the rAF callback right before location.reload() (and before the background events). Both variants assert strictly: nothing saved while the finger was down, then the flush saved. Repeated 3x green.
- Verified in an isolated copy (rsync + symlinked deps + own .vite, port 3611): a11y-labels, large-text-layout and position-font-scale all pass (15 tests).

Planner verification: large-text-layout, reduced-motion and position-font-scale green (worker 1's isolated-copy run, plus the planner's targeted run). AC1/AC4 are device checks, still open for the owner. Full-suite e2e is deferred to the end-of-loop run.

Device pass (Pixel 8 Pro, 2026-10-28, planner via adb + WebView CDP):
- AC1: WebView textZoom follows the OS font scale with no app code. At font_scale 2.0 the root goes 16→32px and the reading text 22→44px. Nothing is applied twice.
- AC4 scroll mode: saved word 840 at 1.0. Switching to 2.0 recreates the activity; the DB still holds 840 and no save happens. Reopened at 2.0, the line holding 840 is at the top (first full word 837, same line). Back at 1.0 it reopens on 840 exactly.
- AC4 page mode: 1293 after 3 real swipe turns. At 2.0 the DB still holds 1293, and on reopen word 1293 is on the shown page (verified in-clip). Back at 1.0 it reopens on page-start 1293.
- Finding: an OS font-scale change recreates the activity, and the WebView reloads to the start route, so the reader lands on the Library instead of the open book. The position is safe; it's a UX regression only versus staying in the book. Possible fix: restore the last reader route after recreate, or handle fontScale in configChanges (but then page mode must re-measure on the textZoom change).
<!-- SECTION:NOTES:END -->
