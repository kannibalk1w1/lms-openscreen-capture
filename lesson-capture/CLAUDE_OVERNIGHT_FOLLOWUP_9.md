# Review 9 disposition (slice 12)

Review source: preserved [report9](CLAUDE_OVERNIGHT_REVIEW_9.md), actual immutable
`56e6fc2c` and `1e2ddea3` ranges. No High/Medium; slice10 accepted.

- L11-1: fixed. Previous-source teardown leaves an unbound link waiting with an
  unavailable gap; bound-source identity failure still closes it. Direct test.
- L11-2: fixed. Deferred old-source close does not increment new operation epoch.
  Direct test suspends new createPair filesystem validation across old410/close,
  then verifies new pairing and a fresh source query succeed. No wrong-source data.
- I11-1: Host must match actual loopback socket port. Real node:http request tests
  malicious Host with correct bearer before native query. Fetch normalizes Host,
  so the first fetch-based test was unsuitable and is preserved in failure log.
- I11-2/3/4: authorization/realpath/suspend/prestart semantics clarified in clock doc.
- I11-5: inspector rejects backwards same-clock time/media/interval and changed
  same-interval identity; different clock IDs stay independent. Four corruption cases.
- Godot bounded rejection and limit footer: fixed; actual4.7.1 headless assertions.
- Empty pre-chmod journal window / advisory filesystem lock: explicit limitation;
  no content is written before private permission check and no token is journaled.
- S10-I1/2: conservative permanent recovery review and future strict-schema marker
  debt remain documented. No new review-decision UI or schema migration in this fix.

27 focused tests/3 files, bothTS,Vite,Biome35/docs/diff. Full run deferred to next
guide milestone; Rust/helpers unchanged. Exact logs slice-12-* outsidecheckout.
Actual fix rereview pending; no physical desktop or production acceptance.
