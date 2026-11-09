# Review37 verify-side privacy guard follow-up — 9 November 2026

Base: `36d30d2488f60777f08281a3a283bdb01ecf1813`, feature branch; main/private-main
remain `fd2775e2`. Actual [review37](CLAUDE_ROADMAP_REVIEW_37_2026-11-09.md) accepts
the bounded package with no High/Medium and one Low L37-1 coverage gap. Its original
report is included verbatim. This is a **test/docs-only** follow-up: production
service, format/schema, renderer, permissions, errors and native bytes are unchanged.
No live defect was exposed; the existing guards refuse every constructed package.

## L37-1 coverage

New `electron/lesson/package.privacy.test.ts` constructs real packages using the
production creator, then changes their derived lesson or declared scope. Every
forgery has canonical existing-schema lesson JSON, recomputed actual payload
hashes/counts, a rewritten manifest and a re-signed completion receipt. It checks
those stored bytes again. The actual shared guide renderer's before/after HTML
and Markdown are equal: none of these cases relies on a different guide or an
earlier checksum failure. Original authoring paths move away before verification.

| Independent predicate/operand | Coherent malicious input | Other guards remain satisfied |
| --- | --- | --- |
| Media selection | Original v2 source pins, source hash and explicit refresh history injected into the derived step | Valid lesson schema; evidence empty; permitted code/images |
| Evidence | Observed source/session evidence injected | No mediaSelection; permitted code/images |
| Extensions | Private raw-journal/source extension payload injected | No pins/evidence; permitted code/images |
| Manifest code exclusion | Manifest says excluded, payload/code and authored include flag remain enabled | Authored code-exclusion predicate false; guide is genuinely the code-included projection |
| Authored code exclusion | Derived output says exclude, code remains; manifest permits inclusion | Manifest code-exclusion predicate false; current low-level projected renderer remains byte-identical |
| Manifest image exclusion | Manifest says exclude, JPEG/refs/provenance and authored include flag remain enabled | Authored image-exclusion predicate false; all transitive JPEG bytes/hashes remain present |
| Authored image exclusion | Derived output says exclude, JPEG/refs remain; manifest permits provenance inclusion | Manifest image-exclusion predicate false; same valid JPEG and canonical guide |

The public production `verifyLessonPackage` must return the fixed
`lesson-package-invalid` refusal in each case. Separate benign controls verify
explicit code inclusion and explicit illustration provenance, including the
permitted original image-source metadata. Both still exclude media pins, evidence
and extensions. The unchanged package suite also runs the retained v1 byte fixture
and existing roundtrip/authority/integrity/cancellation tests.

Seven single-predicate/operand mutation controls each remove only its matching
check in actual `package.ts`. **All7 are assertion-killed**, and every failure is a
`promise resolved` verification result rather than an import/type/timeout error:
with that predicate removed, the malicious package passes every later check. This
independently establishes the intended guard isolation. Exact source SHA256 before
and after each mutation matches; all production bytes are restored. No paired
removal is needed because code/image flag combinations deliberately leave their
other exclusion predicate inactive. Review37's unrelated equivalent survivors
remain documented; no independent closure is claimed for them.

## Actual current-build CLI proof

Unique evidence:
`../openscreen-evaluation/review37-followup-2026-11-09T1831Z/`.

`cli-privacy-proof.cjs` / `cli-privacy-proof.json` reuse the original production
build. Every reachable build hash is checked against the prior accepted slice's
inventory. From a foreign cwd under Xvfb, actual Electron CLI:

1. Creates a static package with explicitly included code and external image
   provenance, then verifies that benign package successfully.
2. Verifies seven separately copied/re-signed packages covering the same cases.
   Each exits1 with fixed `lesson-package-invalid`; no private canary/raw source
   path is returned in the error.
3. Leaves the explicit original lesson bytes unchanged.

The proof harness uses existing pure schema/renderer functions to canonicalize
and check the fixture, rather than an invented parallel privacy validator. This
is actual CLI transport/service verification, with no new app build or mock CLI
registration. It is static privacy coverage, not fresh native media, GUI, picker,
physical, installer, audio or other-platform acceptance. Existing v1/MP4 evidence
and its scope limits remain.

## Validation and preservation

Pinned Node22.22.1/npm10.9.4. Focused **110tests/6files,0skips** pass, including the
new9 privacy cases, original63 package cases/retained v1 fixture, CLI/MCP package
routes and shared lesson/guide/output suites. Initial focused72/2 also passes.
Both root/test TypeScript pass; lint passes with35baseline warnings and docs37
passes. Exact commands/results are recorded in evidence.
Seven isolated mutation runs intentionally filter other cases; their logs retain
those skip counts. No full suite, Vite/native build or startup-smoke repetition is
needed for this test-only change. Prior full6060/450 and production startup/video
proof belong to36d30d24 and are not new coverage claims here.

All original112 native artifacts,1485 previously declared evidence entries and76
reports/user work remain. New manifests extend preservation to1873 prior evidence
files and78 reports (adding the original portable report and review37). Imported
inventories and their earlier coordinator-summary correction remain untouched.
The external LMS workflow report, original review37 and retained v1 fixture bytes
are preserved; addon SHA256 remains
`5d16ea983672b7cb51cc92f3be0df1ee5cf78823bf86e421911a9ef58c09efca`.

N37-1 opaque error categorization stays unchanged to avoid broadening this test
follow-up. N37-2 equivalent guards and N37-3 plain file-link scope remain. No GUI,
player, format/schema, imported-path authority, source repair or privacy collection
change is made. Next: coordinator actual exact-SHA Claude follow-up/fixes/private
push, then a separate verified GUI import/reseal or timed-player dependency slice.
No worker push or next phase before review.
