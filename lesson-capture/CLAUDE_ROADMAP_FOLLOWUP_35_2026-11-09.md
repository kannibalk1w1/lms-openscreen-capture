# Review35 decoder resolution and export guards — 9 November 2026

Coordinator disposition: actual [review36](CLAUDE_ROADMAP_REVIEW_36_2026-11-09.md)
acceptse45e4b34e649e800a54074690b78178a41e23769; M35-1/L35-1 CLOSED.
Independent305focused/16files, both TS/i18n/lint, real non-root CLI/stdio and
startup smoke pass;14own mutants yield12kills. Invalid tools fail with fixed
actionable errors and no receipt. Original worker account remains below; nits and
unproven platform/physical/audio/installer limits remain documented.

Base: `bbe56356a426e5e82350a0ece83027db7350f009`, private feature branch,
main/private-main unchanged at `fd2775e2`. Actual
[review35](CLAUDE_ROADMAP_REVIEW_35_2026-11-09.md) accepts the bounded architecture
but requires M35-1 before relying on unpackaged headless export, and identifies
Low L35-1. Its original report is included verbatim. This follow-up awaits actual
coordinator exact-SHA Claude review/fixes/private push; no packaging/player phase.

## M35-1: working-directory-independent decoder and honest tool errors

The shared FFmpeg resolver now adds the stable absolute APP_ROOT and module-derived
app root before its existing working-directory fallback. Production bundles resolve
from `dist-electron` to its parent; source modules resolve from `electron/media`.
App path and installed `process.resourcesPath` candidates retain their existing
priority, explicit OPENSCREEN_FFMPEG_PATH remains first, duplicates are removed,
and only regular executable candidates qualify. The existing explicit `here`
resolution seam retains its isolated-root contract; production callers omit it.
There is no PATH lookup, shell interpolation, download, imported-path tool grant
or new authentication/configuration state.

The resolver is shared by audio peaks, STT audio extraction, extension clips and
range validation. Those callers retain their existing return/cache/fallback
contracts; focused regressions cover all four. Windows shared-build preference,
Linux staged paths and installed-resource layouts are preserved. Candidate/unit
coverage is not installer or Windows/macOS runtime acceptance.

Missing, inaccessible or unusable decoder setup/version probing now raises a fixed
`range-video-tool-unavailable` error. Materialization maps it to
`range-media-tool-unavailable`, then the public `range-export-tool-unavailable`.
Malformed media, invalid sample timing, failed decode and decoder replacement
during the proof remain verification failures; no acceptance guard was bypassed.
Decoder before/after hashing, bounded version token, full decode, selected programme
and source checks remain. Confirmation's exhaustive error mapping remains
source-unsupported for the unreachable render-tool case, without invoking a tool.

CLI preserves `message` as the fixed error code and adds a fixed actionable
`detail`; human output includes that detail. MCP returns fixed `code` and `message`.
The real Lesson guide/registered service displays the matching catalog wording:
verification tooling is unavailable, reinstall/update OpenScreen or ask an
administrator to check the configured FFmpeg tool, then retry. No tool paths,
raw stderr or imported payloads are returned. All15 catalogs contain the new key;
14 non-English entries deliberately use English fallback, pending human translation.
No human translation completion is claimed.

Unverified MP4s remain inspectable in their private partial folders, disclosed only
while file/caller/destination authority stays current. No completion receipt is
published. Cancellation/ownership/native settlement, grants, source pins, exact
cuts/speeds and original lesson/project/source bytes are preserved. This change
does not preflight or repair tools automatically before rendering.

## L35-1: independent boundary tests

| Guard | Production path exercised | Independent control |
| --- | --- | --- |
| G3 output ancestor symlink | Real directory plus ancestor alias; early fixed unsupported error before selected-file/media open; no output and unchanged originals | Removing only initial canonical-path predicate is assertion-killed; final-component directory checks cannot substitute for this case |
| G9 error disclosure | Real service first creates an authorized partial failure; identical-byte selected-lesson inode replacement is injected after that service failure and before wrapper disclosure | Removing only the wrapper's late input check exposes the path and is assertion-killed |
| G17 HTTP render wiring | Execute the exact actual `handlers.ts` MCP dependency initializer located by TypeScript AST, then pass its resulting dependencies to real HTTP server/SDK/tool/export/native-compute registration | Removing only actual startLessonRangeRender field is assertion-killed |

G17 surrounds the actual production initializer with fixture services and a live
permission provider; it does not reconstruct the dependency literal or call an
invented registration. It is a bounded source-execution wiring seam, **not** the
whole registerIpcHandlers module or a full GUI HTTP app. Existing real production
headless startup smoke independently covers complete handler/bootstrap startup.
The real native transport proofs below are separate from native/decoder doubles
in these authority tests.

Three further single controls independently remove module-root fallback, APP_ROOT
fallback and the public distinct tool-error propagation. All6 controls fail with
assertion errors; no timeout/import/compile failure is counted as a kill. Exact
source hashes and byte restoration are verified in guard-mutations.json. Known
review35 redundant survivors remain described in the original report; no new
independent coverage is claimed for them.

## Actual built transports outside the app root

Unique preserved evidence:
`../openscreen-evaluation/review35-followup-2026-11-09T1652Z/`.
The script `nonroot-proof.cjs` receives the app root explicitly; both actual child
processes use `foreign client cwd` outside the repository, with spaces in its name.
It clears only command-local inherited OPENSCREEN_FFMPEG_PATH and APP_ROOT for
baseline/fixed success probes. User configuration and staged binaries are untouched.

- `baseline/`: previous bbe56356 production build, actual CLI and SDK stdio both
  reproduce `range-export-incomplete`, leave native MP4s without receipts and keep
  all inputs unchanged. Both baseline MP4 files are byte-identical to the new
  output certified by the fixed validator; this independently rules out invalid
  encoded media as the cause. These initial failure logs/media are retained.
- `fixed/`: new production Vite build, actual CLI exits0 and SDK stdio materializes.
  Both receipts verify **45 samples /45 decoded frames /1.5 seconds**, including
  stored stts deltas, full decode, decoder/output/source hashes, explicit target
  and the original programme/cut/speed pin. Inputs stay byte-unchanged. No FFmpeg
  override or APP_ROOT environment hint is present.
- `invalid-tool/`: same built CLI/stdio, with a command-local explicit `/bin/false`
  override to exercise existing override precedence and actual tool/version failure.
  Both refuse with the distinct actionable error, retain the unverified MP4 and
  publish no receipt; returned tool errors contain no executable path/stderr.
- `nonroot-startup/`: committed `scripts/smoke-headless-startup.cjs` runs after Vite
  with its parent working directory outside the repo too, no FFmpeg/APP_ROOT hint.
  Real SDK initialize/listTools plus ordinary CLI registration/runner startup pass;
  the absent-project CLI failure is expected startup coverage, not native export.

Reproduction commands (pinned Node22.22.1/npm10.9.4):

```sh
xvfb-run -a node /absolute/evidence/nonroot-proof.cjs /absolute/openscreen fixed
# The proof explicitly sets both actual child cwds to the foreign directory.
cd '/absolute/evidence/foreign client cwd'
env -u OPENSCREEN_FFMPEG_PATH -u APP_ROOT node \
  /absolute/openscreen/scripts/smoke-headless-startup.cjs \
  --evidence-dir /absolute/fresh/startup-evidence
```

This is actual unpackaged Electron CLI and SDK stdio/native compositor/shipped
validator proof under Linux/Xvfb, not a direct service labelled as transport.
No GUI clicks, native picker, physical capture, installed release, audio timing
or other-platform readiness is claimed. Both audio verification flags remain false.
Native source/addon are unchanged; addon SHA256
`5d16ea983672b7cb51cc92f3be0df1ee5cf78823bf86e421911a9ef58c09efca`.

## Validation, preservation and remaining scope

Focused279tests/12files pass,0skips; real process/runtime integration18/2 also
passes,0skips. Root/test TS pass after fixing an exhaustive
error mapping and a test callback's this annotation. Initial7 decoder-test failures
expected the former generic setup error; their assertions now require the distinct
fixed setup error while retaining all refusal/process/pipe checks. Initial logs
remain. The first full run also found5 real version-probe wrapper tests requiring
that same category update (5986pass/5fail,447files); decode-phase assertions,
deadlines and marked-descendant cleanup stay intact. The final full run passes
**5991tests/447files,0skips** after the focused process correction; both full logs
are retained, rather than claiming only one full run. No weakened sample/decode/identity test or skipped runtime case is used to
close M35-1. Final bothTS, lint35baseline warnings, docs37 and i18n15/1265
pass. Production Vite and non-root real startup smoke pass (61MCPtools, expected
missing-project CLI failure). Existing bundle-size/Browserslist warnings remain;
no native rebuild, installer packaging or extra platform acceptance run.

Preservation includes original112 native files, all860 previously declared prior
files plus the complete previous slice evidence (1254 total prior entries), and
all72 original reports/user work plus the previous slice report/review35 (74 total).
Imported inventories and their earlier coordinator-summary correction remain
untouched; the user LMS workflow report and original review35 are preserved.

The prior proof used the app root as cwd and did not establish the normal external
MCP-client launch case. Review35 found and reproduced that gap; this report records
both failing baseline and fixed production proofs, without calling bbe56356 fully
functional from arbitrary launch directories. The older035c8313 missing-provider
startup regression history and its00bdbc77 fix also remain explicit in prior reports.

Remaining nits: missing output directory still returns a generic fixed error;
destination drift remains project-changed; stateless HTTP cancellation requires
aborting the active request, not a standalone SDK cancellation notification.
N31-3/N31-4/N29-3/N27-3 and N34 smoke/trace limits remain. No source discovery,
implicit confirmation/refresh/relink/upgrade, arbitrary imported destination,
audio certification, portable course package or timed learner player is added.

Next: coordinator actual exact-SHA Claude follow-up/fixes/private push. Only after
that accepted checkpoint should the selected-media portable-package prerequisite
and accessible timed-player dependencies continue. No worker push or next phase.
