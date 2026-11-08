# Nearest confidence v1 / Results

K=30, population z-score and Euclidean distance. Seven fixed features:
axis past_form, field size, effective moisture (% points), grade flag,
axis sled midrank percentile within its race, race sled max−min (kg),
mean selected-three past_form. Equal sled weights yield percentile .5 and span0.
No absolute600kg rule and no odds/popularity input.

Only finalized candidate races strictly earlier than BOTH target race date and
actual prediction/save date in JST are eligible. All same-day races are excluded
because official finalization timestamps are unavailable. Mean/std are fitted
only to that eligible prefix; zero variance uses scale1. Distance ties: race ID.

`H=hits/n`, `R=payout_yen/(600*n)` (ROI multiplier, not percentage).
`confidence=min(n/10,1)*(0.75*H+0.25*R/(1+R))`; n0 gives0.
K/features/formula were fixed before evaluating outcomes; no backtest tuning.
This is an uncalibrated composite index, NOT a hit probability. No skipped-race
confidence cap or Memuro confidence bonus remains; selection gates/ranking stay.

The shared store lazy-loads a SHA-verified compact history, actually searches
once on session startup and again on input/history changes, and atomically
publishes the same version to every view. Views never calculate independently.
Network/integrity failures retain the last valid shared version with a stale
notice, never silently fall back to the removed table. History currently ends
2026-11-07. Corpus fetching does not scrape/update official outcomes by itself.

## Reproducible comparison

`python3 scripts/build_confidence_history.py`
`node scripts/backtest_nearest_confidence.mjs`

Inputs are the existing read-only analysis under
`/workspace/banma_confidence_backtest_2023_2026/`. All6751 frozen horse rankings,
6 tickets and payouts stay fixed. Public comparison JSON/CSV/Markdown:
`confidence-audit/comparison.*` (annual/pooled bands, recommendation subset,
migration, low-neighbor counts). All6751R:134hits, stake4050600yen,
return2599010yen, ROI64.16358%, unchanged. New range0–0.34729235, all<.5;
first12R have no eligible history. The new formula was NOT rescaled to recover
old high-confidence labels. No2022 saved predictions exist, so empty warmup.

Limitations: frozen final normal/rain models,1049 training-source overlaps,
official postrace measured moisture/actual starters and reconstructed horse
histories. This is NOT pure unseen, prestart-forecast or rolling-refit performance.
Legacy saved prestart7R/0hit remains separately bytewise preserved.

## Safe future official outcome updates (not scheduled by this change)

After official results are obtained/validated into verified-results schema:

```
node scripts/update_confidence_history.mjs --snapshot public/prediction-snapshot.json --results public/verified-results.json
# review audit, then append only known finalized saved PRESTART records:
node scripts/update_confidence_history.mjs --snapshot public/prediction-snapshot.json --results public/verified-results.json --apply
node scripts/refresh_confidence_snapshot.mjs
npm test && npm run build
# publish through existing reviewed gh-pages path
```

The append adapter rejects missing/postrace/unpersisted predictions, pending
results, missing payout, refunds and unverified sources; it records all-race
BOX outcomes independently of purchase recommendation. Locks, atomic manifest
publication, immutable corpus versions, deterministic IDs and idempotence guard
updates. Corrections to existing outcomes need separately reviewed new versions,
not silent overwrite. Existing water/OLS schedules/permissions are untouched.
Do not rebuild the initial historical corpus after appending new outcomes.

## Results UI and source import

Canonical route `?view=results&date=2026-11-08`, tab/title「結果」.
Legacy `view=confidence-results` is replaced once preserving date/other query/hash.
All12R (including skipped) are shown in R order: race name, all6 BOX tickets,
official top3, hit/miss or explicit pending. Wide four-column table scrolls on
narrow phones; names/results retain legible sizes. Newspaper comments and source/
save details are behind disclosure. All-race purchase assumptions are reference
only; skipped and postrace rows are labeled and never added to old prestart stats.

The umanity import merges only results/source IDs/timestamps/official crosscheck
and separate measured-water metadata (24 final+12pending). Incoming prediction
fields are ignored; existing full finishes/all payouts/refunds are retained.
No prediction history, weather-log values or learned ranking parameters change.

## Layout/persistence regression follow-up

Results alone uses a1240px desktop container and900px table minimum; column
widths live on col elements, tickets wrap in two columns, and the verdict sticks
to the right on narrow horizontally scrolling screens. Other views keep their
existing880px container.1280px viewport has1208px inner space, so all four
columns fit without reducing normal text sizes.

Browser persistence now stores schema3 minimal immutable prediction records,
not full runtime predictions/near-neighbor audits. Current36R measured size:
655409bytes full vs26104bytes compact (96.02% smaller). Candidate corpus is
never stored there. A stable content ID derives from effective normalized
weather, model/source/engine/corpus hashes and predicted output; per-date IDs
share that identity across views. Check timestamps and provider metadata/unused
forecast days do not create new history versions. Identical content reuses the
first stored record and save times without overwriting it. No prior user
history is deleted. localStorage failure falls back to an add-only IndexedDB
record; both failures remain visibly unavailable with diagnostic details.
Minimal records are evidence, not a fabricated full-runtime cache: cold views
reconstruct once through the shared latest-input calculator.
