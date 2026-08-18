# Portfolio Translation Guide

Chinese content is the canonical source of truth for this portfolio. The
English version is a faithful translation of the Chinese content, not an
independently rewritten portfolio.

## Core Principle

Translate what the Chinese content actually says. Do not invent
information, achievements, metrics, responsibilities, design methods,
motivations, conclusions, or strengthen claims beyond the Chinese source.
If a fact does not exist in the Chinese version, it must not appear in
English. A useful check: if the English version were translated back into
Chinese, it should still be close to the original Chinese content.

## Style

Natural, simple, direct, professional, like the designer writing it herself.
Not academic, not corporate, not a templated case-study voice, no AI tone.

Avoid unless the Chinese source genuinely requires it: leveraged,
spearheaded, empowered, transformative, holistic, seamless, robust,
cutting-edge, innovative solution, user-centric, data-driven, end-to-end,
"optimize/optimization" when the source only means "调整", "enhance/elevate"
when the source does not claim improvement. Avoid excessive em dashes,
"not only... but also...", "from X to Y", three-part marketing lists, and
stacked abstract nouns.

## Allowed Polishing

You may adjust word order, split an overly long Chinese sentence, combine
obviously redundant short sentences, replace an unnatural literal
expression with normal English, and lightly adapt titles. You may not
change the meaning, add information, or strengthen a claim.

## Numbers and Claims

Preserve numbers exactly when present in Chinese. Never calculate new
percentages, infer performance improvements, convert vague outcomes into
measurable results, or invent business impact. Never strengthen a claim
(e.g. "调整了信息层级" → "Reworked the information hierarchy", never
"Significantly improved usability through a redesigned information
architecture").

## Uncertain Information

Never expose internal uncertainty notes in public English copy: "needs
confirmation", "to be verified", "transcription unclear", "possibly",
"assumed to be", "TBD", "translation uncertain", or similar. If the Chinese
source itself is unclear: preserve the safest supported meaning where
possible, otherwise omit the unsupported detail, and report the ambiguity
separately for review. Never guess.

## Proper Nouns

Use established official English names already confirmed elsewhere in the
project data (games, companies, tools, technologies). Never invent an
English name that "sounds right." A proper noun that cannot be confirmed is
reported for review, not guessed at in public copy.

## Terminology

Use normal professional design vocabulary without over-academicizing simple
Chinese expressions (交互设计 → interaction design, 用户体验 → user
experience/UX, 界面 → interface/UI depending on context, 信息层级 →
information hierarchy, 交互流程 → interaction flow, 操作路径 → user
flow/interaction path depending on context, 弹窗 → modal/pop-up depending on
actual UI, 多端 → cross-platform/multi-platform depending on context, 小程序
→ mini program). Choose based on actual meaning, not automatic word
replacement, and keep terminology consistent across the whole site.

## Scope

Public-facing content only: what is actually visible or intended to become
visible on the English public website (Home, Work/project list, project
cards, project detail pages, project metadata, section headings, captions,
explanatory text, Game Experience, UI Practice, About/personal
introduction, public navigation, buttons/labels, empty states, and any
other public-facing template content). Never translate developer comments,
internal diagnostics, publishing metadata, owner-only notes, temporary
debug copy, or hidden technical fields.

## Data Rules

Where a field is a `{ zh, en }` pair, the `zh` value is left completely
untouched -- only `en` is filled or corrected. Never change IDs, ordering,
schema, project relationships, asset references, or publish state as part
of a translation pass. The Chinese source itself is never rewritten or
"improved" during translation; a problem noticed in the Chinese content is
reported separately, never silently changed.

## Existing English

Don't blindly overwrite existing English. Check whether it: (1) still
corresponds to the current Chinese, (2) already reads naturally, (3) has
gone stale because the Chinese was updated since, (4) shows obvious AI
style or earlier over-polished writing. Correct and natural existing
English is kept; stale or drifted English is retranslated from the current
Chinese.

## Final Review Standard

Before considering a translation complete: every meaningful English claim
must exist in the Chinese source (fidelity); it should read like something
a normal English-speaking designer would plausibly write (naturalness);
simpler phrasing is preferred where it says the same thing (simplicity);
repeated concepts are translated the same way across pages (consistency);
nothing sounds unnecessarily polished, abstract, promotional, or formulaic
(AI tone); and no meaningful public-facing Chinese text remains
untranslated on the English route (completeness).
