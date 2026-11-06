# Review15 disposition — slice19

Actual review15 reviewed414823d6 against13f7d723, found no High/Medium and closed
L17-1/B17-1 in code using independent regressions that fail baseline/pass fixed.
It ran85 focused/8files, all3 TS configs, whole Biome35warnings, i18n1243,
snapshot mutation probes and a plain-DOM Chromium151 disabled-fieldset probe.
It did not run full/Vite/Electron/native/physical or platform acceptance.

LowT18-1: fixed. Shipped Restore tests now wait for busy/fieldset to clear before
asserting content/image absence, including same lesson/step identity and a higher
restored revision. An immutable414823d6 snapshot outside checkout with this waited
test passes11/11; removing generation.current++ fails the same-identity case,
10pass/1fail, with Node22.22.1. The earlier tests were vacuous for this race;
previous85 passes must not be treated as regression proof by themselves.

Review14 reachability correction: its jsdom fireEvent bypassed the busy disabled
fieldset. Review15's plain Chromium probe blocks real click/keyboard Restore and
typing. Keep both original reports; the fix is defence in depth for state changes
and future callers, not proof of a previously reachable real-user defect. Neither
probe tested the actual Electron dialog/OS desktop input.

N18-1: a new delayed crypto validation test changes the document only after image
integrity validation starts and asserts refusal after busy drain. The in-updater
current() check remains correct by inspection, without a separate scheduler-window
probe. N18-2: unchanged attachment is refusal, not a success result; the new file
commands do not call that helper or attach illustrations. N18-3: file writes can
finish after a future modeless UI replacement even if the notice is fenced;
current busy/native-dialog reachability remains as documented, no such UI added.
The new CLI/MCP commands await and return their own actual output outcome.

Shared image integrity validation retains existing checks; file commands always
use full manifest validation, including pixel-area/asset/step/total bounds.
N17-4: recovery storage remains outside the tool surface. Explicit-source-file
query/export exposes no recovery inventory, location lookup or store mutation.
[Command scope and exact evidence](../LESSON_CAPTURE_COMMANDS.md).
