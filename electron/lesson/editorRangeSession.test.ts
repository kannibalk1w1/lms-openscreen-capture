import { expect, it } from "vitest";
import { EditorRangeSessions } from "./editorRangeSession";

it("only grants a registered loaded editor's current saved project", () => {
	const sessions = new EditorRangeSessions();
	let url = "file:///app/index.html?windowType=editor",
		destroyed = false,
		dirty = false;
	const owner = { getURL: () => url, isDestroyed: () => destroyed };
	expect(() => sessions.capture(owner, () => false)).toThrow("project-changed");
	sessions.register(owner, url);
	expect(() => sessions.capture(owner, () => false)).toThrow("project-changed");
	sessions.select(owner, "p");
	const authority = sessions.capture(owner, () => dirty);
	expect(authority.projectId).toBe("p");
	dirty = true;
	expect(authority.assertCurrent).toThrow("project-changed");
	dirty = false;
	authority.assertCurrent();
	url = "https://untrusted/";
	expect(authority.assertCurrent).toThrow("project-changed");
	sessions.select(owner, "other");
	expect(() => sessions.capture(owner, () => false)).toThrow("project-changed");
	url = "file:///app/index.html?windowType=editor";
	destroyed = true;
	expect(authority.assertCurrent).toThrow("project-changed");
});
it.each([
	"p",
	"other",
	null,
])("invalidates pending authority on selection %s, including reopen", (next) => {
	const sessions = new EditorRangeSessions(),
		owner = { getURL: () => "file:///app", isDestroyed: () => false };
	sessions.register(owner, "file:///app");
	sessions.select(owner, "p");
	const pending = sessions.capture(owner, () => false);
	sessions.select(owner, next);
	expect(pending.assertCurrent).toThrow("project-changed");
	if (next) expect(sessions.capture(owner, () => false).projectId).toBe(next);
});
it("invalidates crashed/navigated editors independently", () => {
	const sessions = new EditorRangeSessions(),
		a = { getURL: () => "file:///app", isDestroyed: () => false },
		b = { ...a };
	for (const owner of [a, b]) {
		sessions.register(owner, "file:///app");
		sessions.select(owner, "p");
	}
	const first = sessions.capture(a, () => false),
		second = sessions.capture(b, () => false);
	sessions.invalidate(a);
	expect(first.assertCurrent).toThrow("project-changed");
	second.assertCurrent();
});

it("matches Electron query encoding without accepting a different page or query", () => {
	const sessions = new EditorRangeSessions();
	let url = "file:///app/index.html?windowType=editor&videoPath=a%20b";
	const owner = { getURL: () => url, isDestroyed: () => false };
	sessions.register(owner, "file:///app/index.html?windowType=editor&videoPath=a+b");
	sessions.select(owner, "p");
	const authority = sessions.capture(owner, () => false);
	authority.assertCurrent();
	url = "file:///app/index.html?windowType=editor&videoPath=other";
	expect(authority.assertCurrent).toThrow("project-changed");
});
