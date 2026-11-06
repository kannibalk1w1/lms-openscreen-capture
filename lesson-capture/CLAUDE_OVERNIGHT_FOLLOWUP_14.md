# Review14 follow-up — slice18

Actual review14 examined13f7d723, found no High/Medium, and independently ran80
focused tests/8 files plus root/node TypeScript (not the test config), touched
Biome and i18n. Its filesystem/dialog probes are read-only snapshot evidence;
it did not run a new full suite, Vite/native or physical desktop acceptance.

L17-1 is addressed by a lesson-generation fence: replacing the current lesson,
including restoring the same lesson UUID, invalidates older asynchronous UI
results. Existing project epoch/document identity/fingerprint guards remain.
Busy state drains even when a replacement invalidates a pending response.
B17-1 is addressed by attaching validated illustrations through a functional
current-state update, preserving later authored text/title/revisions. Removed
steps, changed image references and stale identities/revisions refuse attachment.
Only a replaced, unreferenced old illustration is removed; unrelated assets stay.
Tests inject restore/text callbacks during deferred rendering, including a
same-identity restored copy. These are React state race tests, not OS input proof.

N17-4 remains a boundary for the next file-scoped CLI/MCP slice: never expose
recovery inventory/location or store methods without separate explicit authority.
Only explicitly selected source files and output directories are planned.
N17-2/3 bounded scan/performance limits remain documented; no speculative storage
rewrite is added. N17-5 Windows ACL, hard-link/removable/network filesystem and
physical desktop acceptance remain open.
