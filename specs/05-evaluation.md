# Evaluation & Scoring — Spec

## Objective
The outcome-based evaluation layer — the platform's core differentiator: does the
thing actually work, run, and hold up. Each brief gets a weighted rubric; the
company scores submissions against it, producing a ranked scouting pool per brief.
Engineers see their scores and feedback (the work is theirs; the signal should be
too). Success: a company scores submissions and sees them ranked; an engineer sees
their evaluation.

## Requirements
Must-have:
1. Prisma models:
   - `RubricCriterion`: id, briefId, name, weight (int 1–5), createdAt.
   - `Score`: id, submissionId, criterionId, value (int 0–5), with
     `@@unique([submissionId, criterionId])`.
   - `Submission.feedbackNote` (nullable text): overall feedback from the
     evaluating company.
2. Default rubric: when a brief is created, three criteria are attached
   automatically — "Works end-to-end" (weight 5), "Code quality" (weight 3),
   "Docs & reproducibility" (weight 2).
3. Rubric editing (owning company, from the brief's manage view): add, rename,
   re-weight, remove criteria. Removing a criterion cascades its scores.
4. Scoring (owning company only): for each submission, score every criterion
   0–5 plus optional feedbackNote. Weighted percentage =
   Σ(weight × value) / Σ(weight × 5) × 100, shown to one decimal.
5. A submission is **fully scored** only when every current criterion has a
   score. Rubric edits recompute percentages and can demote submissions to
   partially scored.
6. Ranked view for the brief's company: submissions ordered fully scored first
   (by percentage desc), then partially scored, then unscored; percentage-ties
   broken by earlier submission first.
7. Engineers see their own per-criterion breakdown, percentage, and
   feedbackNote on their submission **only once fully scored**; before that,
   nothing is shown.
8. tRPC procedures enforce all of the above server-side (rubric edit and
   scoring are owner-company only; breakdown visible to the submission's
   engineer only when fully scored).
9. Vitest tests: weighted-percentage math (mixed weights; hand-checked case:
   weights 5/3/2 with scores 5/4/3 → (25+12+6)/50 × 100 = 86.0%),
   full/partial classification, recompute after criterion removal, scoring
   authorization.

Deferred: automated evaluation harnesses, cross-company score visibility, score
history/audit trail, per-criterion feedback text.

## Constraints
- Same stack constraints as foundation; no new dependencies.
- Scores are 0–5 integers; weights are 1–5 integers (Zod-validated).
- Only the brief's owning company can view or edit scores for its submissions;
  engineers see only their own results.

## Edge Cases
- All criteria removed → scoring UI disabled with a prompt to add criteria;
  submissions show as unscored.
- Score outside 0–5 or non-integer (including direct tRPC call) → validation
  error, nothing saved.
- Criterion added after full scoring → affected submissions become partially
  scored and drop below fully-scored ones in ranking.
- Engineer requesting a competitor's score breakdown → FORBIDDEN.
- Scoring a submission on a brief you don't own → FORBIDDEN.
- Percentage tie → stable order (earlier submission first).

## Definition of Done
- [ ] New briefs get the three-criterion default rubric automatically.
- [ ] The company can score a submission on every criterion and sees the correct
      weighted percentage (5/3/2 weights with 5/4/3 scores shows 86.0%).
- [ ] The ranked view orders fully scored > partial > unscored, by percentage.
- [ ] The engineer sees their breakdown and feedback only after full scoring.
- [ ] Removing a rubric criterion recomputes rankings without errors.
- [ ] `npm test` passes, including scoring-math and authz tests; `npm run build`
      stays clean.
