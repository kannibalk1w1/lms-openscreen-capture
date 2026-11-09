import { guideAppearance, lessonOutput } from "./output";
import { type LessonManifest, validateLesson } from "./schema";

const html = (text: string) =>
	text.replace(
		/[&<>"']/g,
		(char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!,
	);
const md = (text: string) =>
	text
		.replace(/[&<>]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[char]!)
		.replace(/([\\`*_{}[\]()#+.!|~=-])/g, "\\$1");

const instructionsMarkdown = (text: string) =>
	text
		.replace(/\r\n?/g, "\n")
		.split("\n")
		.map((line) => {
			if (!line.trim()) return "";
			const indentation = line.match(/^[ \t]*/)?.[0] ?? "";
			return (
				indentation.replace(/ /g, "&#32;").replace(/\t/g, "&#9;") +
				md(line.slice(indentation.length))
			);
		})
		.join("  \n");

export async function projectLesson(
	lesson: LessonManifest,
	ids: string[],
): Promise<LessonManifest> {
	const valid = await validateLesson(lesson),
		selected = new Set(ids);
	if (
		!ids.length ||
		selected.size !== ids.length ||
		ids.some((id) => !valid.steps.some((step) => step.id === id))
	)
		throw new Error("Choose valid lesson steps");
	const output = lessonOutput(valid);
	const steps = valid.steps
		.filter((step) => selected.has(step.id))
		.map((step) => ({
			...step,
			// Static guides carry no video: do not export unresolved media references.
			mediaSelection: undefined,
			...(!output.includeImages ? { imageId: undefined, imageAlt: "" } : {}),
			...(!output.includeCode ? { code: undefined } : {}),
		}));
	const assets = valid.assets.filter((asset) => steps.some((step) => step.imageId === asset.id));
	// Extension data has no export permission: retain it only in the editable original.
	return {
		...valid,
		id: crypto.randomUUID(),
		revision: 0,
		derivedFrom: { id: valid.id, revision: valid.revision, stepIds: steps.map((step) => step.id) },
		output,
		steps,
		assets,
		extensions: undefined,
	};
}
export async function renderLessonGuide(lesson: LessonManifest, ids: string[]) {
	return renderProjectedLessonGuide(await projectLesson(lesson, ids));
}
/** Render an already explicit derived lesson, keeping its provenance and identifiers. */
export async function renderProjectedLessonGuide(input: LessonManifest) {
	const selected = await validateLesson(input);
	const output = lessonOutput(selected),
		appearance = guideAppearance(output);
	if (selected.steps.some((step) => step.imageId && !step.imageAlt.trim()))
		throw new Error("Describe every illustration before exporting");
	const anchor = (index: number) => `step-${selected.steps[index].id}`;
	const contents = `<nav class="contents" aria-label="Lesson steps" lang="en" dir="ltr"><h2 id="lesson-steps" tabindex="-1">Steps</h2><ol>${selected.steps.map((step, index) => `<li><a href="#${anchor(index)}"><span lang="${step.title.trim() ? html(output.language) : "en"}" dir="${step.title.trim() ? output.direction : "ltr"}">${step.title.trim() ? html(step.title) : `Step ${index + 1}`}</span></a></li>`).join("")}</ol></nav>`;
	const sections = selected.steps
		.map((step, index) => {
			const image = selected.assets.find((asset) => asset.id === step.imageId);
			const previous =
				index > 0 ? `<a href="#${anchor(index - 1)}">Previous step (${index})</a>` : "";
			const next =
				index + 1 < selected.steps.length
					? `<a href="#${anchor(index + 1)}">Next step (${index + 2})</a>`
					: "";
			return `<section aria-labelledby="${anchor(index)}"><h2 id="${anchor(index)}" tabindex="-1">${step.title.trim() ? `${index + 1}. ${html(step.title)}` : `<span lang="en" dir="ltr">Step ${index + 1}</span>`}</h2><p class="status" lang="en" dir="ltr">${step.status === "draft" ? "Draft — review required" : "Source step reviewed"}</p><p>${html(step.instructions.replace(/\r\n?/g, "\n")).replace(/\n/g, "<br>")}</p>${image ? `<figure><img src="data:image/jpeg;base64,${image.base64}" alt="${html(step.imageAlt)}" width="${image.width}" height="${image.height}"><figcaption aria-hidden="true">${html(step.imageAlt)}</figcaption></figure>` : ""}${step.code ? `<pre dir="ltr"><code>${html(step.code.text)}</code></pre>` : ""}<nav class="step-navigation" aria-label="Step ${index + 1} navigation" lang="en" dir="ltr"><a href="#lesson-steps">Back to steps</a>${previous}${next}</nav></section>`;
		})
		.join("\n");
	const outputHtml = `<!doctype html><html lang="${html(output.language)}" dir="${output.direction}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>${html(selected.title)}</title><style>
body{font:${appearance.fontSize}px/${appearance.lineHeight} system-ui,sans-serif;max-width:960px;margin:auto;padding:24px;color:${appearance.foreground};background:${appearance.background}}
img{max-width:100%;height:auto}figure{margin:24px 0}
pre{white-space:pre-wrap;overflow-wrap:anywhere;background:${appearance.codeBackground};border:1px solid ${appearance.muted};padding:16px}
section{margin:40px 0}p,h1,h2,figcaption,nav{overflow-wrap:anywhere}.status,figcaption{font-size:.9em;color:${appearance.muted}}
a{color:inherit}nav a,.skip-link{display:inline-block;box-sizing:border-box;min-height:44px;padding:6px 4px;max-width:100%}
.contents ol{padding-inline-start:1.75em}.contents a{display:block}.step-navigation{display:flex;flex-wrap:wrap;gap:8px 16px}
a:focus-visible,h2:focus-visible{outline:3px solid currentColor;outline-offset:4px}h2{scroll-margin-block-start:24px}
@page{margin:16mm}@media print{body{max-width:none;padding:0;margin:0;color:#000;background:#fff}nav,.skip-link{display:none!important}h1,h2{break-after:avoid}figure{break-inside:avoid}section,pre{break-inside:auto}section{margin:24px 0}.status,figcaption{color:#000}}
</style></head><body><header><h1>${html(selected.title)}</h1><a class="skip-link" href="#${anchor(0)}" lang="en" dir="ltr">Skip to first step</a></header>${contents}<main>${sections}</main></body></html>`;
	const markdown =
		[
			`# ${md(selected.title.replace(/[\r\n]/g, " "))}`,
			`Derived lesson revision ${selected.revision}; source revision ${selected.derivedFrom?.revision ?? selected.revision}. Draft steps require review.`,
			...selected.steps.map((step, index) => {
				const image = selected.assets.find((asset) => asset.id === step.imageId);
				const code = step.code ? `\n\n<pre>${html(step.code.text)}</pre>` : "";
				return `## ${index + 1}. ${md(step.title.replace(/[\r\n]/g, " "))}\n\n${step.status === "draft" ? "Draft — review required" : "Source step reviewed"}\n\n${instructionsMarkdown(step.instructions)}${image ? `\n\n![${md(step.imageAlt.replace(/[\r\n]/g, " "))}](assets/${image.id}.jpg)` : ""}${code}`;
			}),
		].join("\n\n") + "\n";
	return { lesson: selected, html: outputHtml, markdown };
}
