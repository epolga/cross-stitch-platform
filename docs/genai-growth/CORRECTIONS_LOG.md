# Corrections Log

Structured records for the feedback-learning mechanism specced in
`DESIGN_FEEDBACK_LOOP.md`. Manual accumulation only for now — no UI/diff
tooling yet, per Olga's 2026-08-07 decision (start with Domain 1, log by
hand, build tooling once there's enough volume to justify it).

One entry per correction (or explicit no-change approval), grouped by
domain (see `DESIGN_FEEDBACK_LOOP.md`'s "Domains and per-domain
advancement plan" for what each domain covers and its threshold for
moving to Level 1 rule extraction).

---

## Domain 1 — Image-prompt composition

### Record 1 — 2026-08-07, capybara

- **Input:** trend-detected theme "capybara," first `imagePrompt` draft
  from `buildPrompt()`'s original wording (a plain "describe the scene"
  instruction).
- **AI result:** capybara floating on its back among lily pads and a
  lotus flower — a full scene, capybara relatively small in frame.
- **Correction:** rewrote the prompt guidance entirely — subject alone,
  large, filling almost the entire frame, no scenery/props.
- **Reason (Olga's own words):** "Я хотела не только текст, я хотела
  картинку! ... Для вышивки крестиком главный образ должен быть гораздо
  крупней а фона вообще быть не должно."
- **Status:** rule already applied directly to
  `trend-detection.ts`'s `buildPrompt()` (no separate rule-extraction
  step needed — single example was unambiguous). Counts toward Domain
  1's threshold regardless.

*(1/3-5 toward Domain 1's provisional Level-1 threshold — already
resolved in the prompt itself; further records here are for future
volume/pattern-confirmation, not because this specific issue is still
open.)*

---

## Domain 5 — Newsletter / Ann-voice copy

### Record 1 — 2026-08-07, capybara newsletter draft

- **Input:** first newsletter copy draft for the Capybara design —
  "I keep seeing them pop up everywhere lately... So I finally gave in
  and stitched one myself."
- **AI result:** claimed Ann personally noticed a trend and stitched the
  piece herself; framed the whole email around "trending everywhere."
- **Correction:** removed the personal-stitching claim entirely (Ann did
  not stitch this — Claude generated it); removed the trending framing;
  replaced with a plain "a new pattern just went up" introduction plus a
  couple of factual sentences about capybaras.
- **Reason (Olga's own words):** "Убери замечание, что я её вышила, я ж
  её не вышивала, ты сам только что её создал. И про трендинг тоже не к
  месту, просто несколько слов про капибар и всё."
- **Status:** applied directly to `HtmlEmailTemplate.txt` /
  `TextEmailTemplate.txt`.

*(1/5-8 toward Domain 5's provisional Level-1 threshold.)*
