# Search algorithm (product rules)

These are the rules we keep rediscovering in conversation. The code is the implementation; this file is the intent, so a later tweak does not silently undo an earlier one.

## What we are optimizing

The user is asking a question about a named thing and an outcome. PubMed does not speak wellness copy. The engine has to:

1. Recover **what they named**
2. Recover **what they actually want to know**
3. Search literature terms papers use
4. Not treat a related-but-different literature pile as proof of the claim

That is an algorithm. The little parse/search tweaks are training data for it. Keep the rules here when they change; do not rely on PR chat history.

## Grains

**Named equipment / product inside a real clinical class** (hyperbaric chamber ⊂ HBOT, jasmine tea ⊂ green tea, red light bed ⊂ photobiomodulation):

- Search both grains.
- Class trials are related, not automatic proof about the named object.
- Do not drop protected nouns (`chamber`, `jasmine`).

**Folk protocol + recipe** (epsom salt + olive oil liver flush → skin complexion):

- The question is: does **this kind of protocol** improve the outcome?
- Search subject = the protocol (`liver flush` / liver cleanse / gallbladder flush), not glued ingredients (`"epsom salt olive oil"`).
- Do **not** promote the class to a generic bucket (`detoxification`).
- Headline = protocol AND mapped outcome, RCT-filtered. Near-zero is a real answer.
- Then list papers on the **protocol with any outcome**, with a short abstract summary of what they actually found (benefit, harm, or “not evidence-based”).
- Search phrases must be the wellness practice, not a medical homonym. Bare `"liver flush"` matches transplant *flush solutions*; use `"gallbladder flush"` / `"liver and gallbladder flush"` instead.
- Ingredient trials (olive oil for skin, magnesium sulfate for other uses) are adjacent, not proof the flush works.

## Outcomes

Map consumer phrasing before AND-ing (`energy levels` → fatigue; `skin complexion` → skin). Quote-ANDing two marketing phrases is how we get silent zeros.

## What the UI should say

- No 0–100 score. No flag chips.
- **What this means** is the user-facing algorithm output. It is the takeaway: first on the page, visually distinct from PubMed queries and parse metadata.
- Do not ask clarifying questions the UI cannot answer.

## When you change a rule

Update this file in the same change as the code, with one sentence on *why*. That is the training log.
