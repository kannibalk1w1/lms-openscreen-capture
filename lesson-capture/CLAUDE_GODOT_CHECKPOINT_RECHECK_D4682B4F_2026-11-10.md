# C1 recheck: Godot checkpoint labels — d4682b4f vs 9e9883dc

- HEAD: `d4682b4f67f5b159b8b3ced950b68c951f077f4d` ("fix: reject Unicode blank Godot checkpoint labels"). Base: reviewed `9e9883dc`.
- Reviewer: Claude (Opus 5.5), Orca task `task_dee09a31fc83`. Read-only; `git status` was clean. Probes ran from `/tmp/claude-ckpt-recheck-d4682b4f/` (a copy of HEAD's `scene_capture.gd` taken with `git show`) with headless Godot 4.7.1 and pinned Node 22.22.1.

## Verdict: ACCEPT — C1 closed

### What changed
`scene_capture.gd` replaces `strip_edges().is_empty()` with `_has_label_content`. The new check skips the ECMAScript `trim()` set:
- line terminators: LF, CR, U+2028, U+2029;
- whitespace: TAB, VT, FF, SP, NBSP, U+FEFF;
- every Zs space: U+1680, U+2000–200A, U+202F, U+205F, U+3000.

The control-character check (C0/DEL/C1) and the 200-UTF-16-unit bound are unchanged. The decoder is unchanged.

### Independent equivalence proof, covering every code point
- **Real Godot 4.7.1:** I loaded HEAD's `scene_capture.gd` (as a `/tmp` copy) and ran the real `_has_label_content` on every Unicode scalar value, U+0000–U+10FFFF excluding surrogates: 1,112,064 values. It reports exactly 25 blank code points.
- **Node 22.22.1:** `String.fromCodePoint(cp).trim() === ""` gives the same 25. Only-Godot set: `[]`. Only-JS set: `[]`.
- **Full label rule:** I compared the decoder's acceptance rule (`trim().length > 0` and no `\p{Cc}`) with the producer's (has content and no C0/DEL/C1) for every single code point. **0 mismatches.**
- **Multi-character labels:** both sides treat a label as blank exactly when every character is in that same set. The producer loops over every code point, and the decoder's `trim()` result is empty exactly then.
- **Real Godot spot checks:**
  - mixed `U+3000 NBSP U+2028 U+FEFF` is blank;
  - `U+3000 "x" NBSP` has content;
  - `""` is blank.
- **Length:** unchanged and previously verified on both sides (at most 200 UTF-16 units).

### Retained evidence (`../openscreen-evaluation/godot-checkpoint-unicode-2026-11-10`)
- The probe diff calls the real `mark_checkpoint` with ten Unicode blanks plus a mixed blank. It asserts every one is refused **and** that the journal text is byte-identical afterwards. It then records `"　Script attached "`.
- Decoding the retained Linux and Windows (`godot-scene-probe-lPKo79`) journals with my HEAD bundle:
  - `scene.jsonl`: 15 observations and 4 markers, including the label `"　Script attached "`;
  - `marker-limit.jsonl`: 4,094 observations, 1 marker, `limited`.
- The Windows guest's `scene_capture.gd` is byte-identical to HEAD after CRLF normalisation.
- Focused vitest: **42 passed / 2 files** (`godotScene.test.ts`, `sceneDraft.test.ts`), including the 11 new Unicode-blank cases and the surrounded-label case.

## Remaining discrepancies
None that matter. One theoretical case I did not probe: lone UTF-16 surrogates in a Godot `String`. LineEdit input does not normally produce them, and they are outside the scalar-value range both rules were compared over.

## Limits
- No full suite, build or tsc rerun; the change is GDScript plus tests only, and root reports both tsc configs and lint passing.
- I did not run my own live editor session. The real-Godot check calls the production function directly from a headless script.
- No VM access; the Windows result comes from retained artifacts. No physical input, native, media or run-result claims.
