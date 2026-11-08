# Current confidence: original saved-condition table restored (t260)

Current runtime method is condition-table-v1, NOT nearest-neighbor or a new
confidence formula. Exact source and confidence_bands.json are restored from
6d887900e859109b415d04ecb585fa4bc160ee2f. Horse scoring still uses the unchanged
29-feature normal/rain Lambda models. Ranking, recommendation gate, Memuro axis
rule, BOX construction and newspaper comments are untouched.

Lookup conditions: axis past_form band, field-size band, moisture band, grade
flag. Exact original fallback: joint -> coarse -> pf_only -> baseline. Exact
original adjustments: skipped confidence capped at.25, then Memuro+.05 capped
at.95. Existing band boundaries, saved table values and fallback values are not
redesigned or refitted. Example saved input: PF.66765873,10 runners,1.9% moisture,
non-grade ->065_070|ge10|wet|normal,N62,hits3,hit4.839%,ROI304.73%,confidence.744.
Current weather inputs may differ; the example is a fixed-input replay.

learned_model.json only loses the former confidence_method metadata. Its whole
file again hashes to f50896e88bffe77475904d32d12280178b150f6c3cc18a5eeea5ad71dc57250f;
all13911 original numeric fields hash to
3b20528d5641cf6e96eeac8df244afee7411c2c408ce873c55af409040b5f3b8.
comment_style and predictive parameters are unchanged.

Shared views still use one atomic prediction store. Stable input/output content
and per-date identities now include the restored table hash, not a corpus.
Identical inputs/reloads stay stable; compact immutable browser records and
IndexedDB fallback remain. A method change creates a new version, never edits
old local/server records. Confidence-only migration keeps original horse saved
times, scores and predictions, and separately marks post-start confidence
recalculation. Actual subsequent latest-weather recalculation remains the
existing shared path, never a per-view calculation.

Production nearest search, normalization, outcome-loader modules, corpus JSON,
policy JSON and comparison assets were removed. Exact old sources/data/reports
are retained under analysis/nearest-v1 and existing immutable prediction-history
for audit; they are not bundled/deployed as runtime or the current method.
No QEA/DU/utility experimental formula was introduced. No result retrieval,
training, schedule or water-log update is part of this change.

Tests compare exact old source/table bytes,1452 lookup cases covering all four
fallback levels,192 original correction fixtures, all36 fixed-current-input
before/after scores/ranking/BOX/gates/comments, all36 saved-input predictions,
compact no-scroll Results, stable version/persistence and water-log safeguards.
Current input was captured once before replacement; no outcome-based tuning.

Runtime exports use the restored table automatically. Confidence-only shared
snapshot migration: node scripts/refresh_confidence_snapshot.mjs. Old published
versions and prestart performance remain independent immutable records.
