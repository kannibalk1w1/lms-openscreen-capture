// @vitest-environment jsdom
import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { newLesson, newStep } from "./authoring";
import { renderLessonGuide } from "./export";
import { defaultLessonOutput } from "./output";

beforeEach(() => vi.stubGlobal("crypto", webcrypto));
afterEach(() => vi.unstubAllGlobals());
function documentOf(text: string) {
	return new DOMParser().parseFromString(text, "text/html");
}
it("links only selected steps in source order with stable IDs and valid previous/next/contents targets", async () => {
	const first = newStep("First"),
		omitted = newStep("PRIVATE_OMITTED"),
		last = newStep("Last");
	const lesson = { ...newLesson(), steps: [first, omitted, last] };
	const output = await renderLessonGuide(lesson, [last.id, first.id]);
	const doc = documentOf(output.html);
	const sections = [...doc.querySelectorAll("main section")];
	expect(sections.map((section) => section.getAttribute("aria-labelledby"))).toEqual([
		`step-${first.id}`,
		`step-${last.id}`,
	]);
	expect([...doc.querySelectorAll(".contents a")].map((link) => link.textContent)).toEqual([
		"First",
		"Last",
	]);
	const anchors = [...doc.querySelectorAll<HTMLAnchorElement>("a")];
	for (const link of anchors) {
		expect(link.getAttribute("href")).toMatch(/^#[a-z0-9-]+$/);
		const target = doc.getElementById(link.hash.slice(1));
		expect(target).not.toBeNull();
		expect(target?.getAttribute("tabindex")).toBe("-1");
	}
	expect([...sections[0].querySelectorAll("nav a")].map((link) => link.textContent)).toEqual([
		"Back to steps",
		"Next step (2)",
	]);
	expect([...sections[1].querySelectorAll("nav a")].map((link) => link.textContent)).toEqual([
		"Back to steps",
		"Previous step (1)",
	]);
	expect(output.html).not.toContain(omitted.id);
	expect(output.html).not.toContain("PRIVATE_OMITTED");
	const subset = documentOf((await renderLessonGuide(lesson, [last.id])).html);
	expect(subset.querySelector("main h2")?.id).toBe(`step-${last.id}`);
	expect(subset.querySelector("main h2")?.textContent).toBe("1. Last");
	expect(subset.querySelectorAll(".step-navigation a")).toHaveLength(1);
	expect(lesson.steps).toHaveLength(3);
});
it("keeps English navigation separate from authored RTL language and refuses executable title markup", async () => {
	const step = {
		...newStep('<img src=x onerror="evil()"> درس'),
		instructions: "شرح",
		code: { language: "plain", text: "<script>CANARY</script>" },
	};
	const output = await renderLessonGuide(
		{
			...newLesson(),
			steps: [step],
			output: { ...defaultLessonOutput(), language: "ar", direction: "rtl" },
		},
		[step.id],
	);
	const doc = documentOf(output.html);
	expect(doc.documentElement.lang).toBe("ar");
	expect(doc.documentElement.dir).toBe("rtl");
	expect(doc.querySelector(".contents")?.getAttribute("lang")).toBe("en");
	expect(doc.querySelector(".contents a span")?.getAttribute("lang")).toBe("ar");
	expect(doc.querySelector(".contents a span")?.getAttribute("dir")).toBe("rtl");
	expect(doc.querySelector(".contents a")?.textContent).toBe(step.title);
	expect(doc.querySelectorAll("script,img,iframe,object,form")).toHaveLength(0);
	expect(doc.querySelector("pre")?.dir).toBe("ltr");
	expect(
		doc.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute("content"),
	).toContain("default-src 'none'");
	expect(output.html).not.toContain("<script>");
	expect(doc.querySelector("style")?.textContent).toContain(
		"nav,.skip-link{display:none!important}",
	);
	expect(doc.querySelector("style")?.textContent).toContain("section,pre{break-inside:auto}");
});

it("gives an empty authored title a nonempty navigation label without rewriting its source", async () => {
	const step = newStep("   ");
	const lesson = {
		...newLesson(),
		steps: [step],
		output: { ...defaultLessonOutput(), language: "ar", direction: "rtl" as const },
	};
	const doc = documentOf((await renderLessonGuide(lesson, [step.id])).html);
	expect(doc.querySelector(".contents a")?.textContent).toBe("Step 1");
	expect(doc.querySelector(".contents a span")?.getAttribute("lang")).toBe("en");
	expect(doc.querySelector("main h2")?.textContent).toBe("Step 1");
	expect(doc.querySelector("main h2 span")?.getAttribute("lang")).toBe("en");
	expect(step.title).toBe("   ");
});
