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
	const steps = valid.steps.filter((step) => selected.has(step.id));
	const assets = valid.assets.filter((asset) => steps.some((step) => step.imageId === asset.id));
	// Extension data has no export permission: retain it only in the editable original.
	return {
		...valid,
		id: crypto.randomUUID(),
		revision: 0,
		derivedFrom: { id: valid.id, revision: valid.revision, stepIds: steps.map((step) => step.id) },
		steps,
		assets,
		extensions: undefined,
	};
}
export async function renderLessonGuide(lesson: LessonManifest, ids: string[]) {
	const selected = await projectLesson(lesson, ids);
	if (selected.steps.some((step) => step.imageId && !step.imageAlt.trim()))
		throw new Error("Describe every illustration before exporting");
	const sections = selected.steps
		.map((step, index) => {
			const image = selected.assets.find((asset) => asset.id === step.imageId);
			return `<section id="step-${index + 1}"><h2>${index + 1}. ${html(step.title)}</h2><p class="status">${step.status === "draft" ? "Draft — review required" : "Reviewed by author"}</p><p>${html(step.instructions.replace(/\r\n?/g, "\n")).replace(/\n/g, "<br>")}</p>${image ? `<figure><img src="data:image/jpeg;base64,${image.base64}" alt="${html(step.imageAlt)}" width="${image.width}" height="${image.height}"><figcaption>${html(step.imageAlt)}</figcaption></figure>` : ""}${step.code ? `<pre><code>${html(step.code.text)}</code></pre>` : ""}</section>`;
		})
		.join("\n");
	const outputHtml = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>${html(selected.title)}</title><style>body{font:18px/1.6 system-ui,sans-serif;max-width:960px;margin:auto;padding:24px;color:#17202a;background:#fff}img{max-width:100%;height:auto}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f1f3f5;padding:16px}section{margin:40px 0;break-inside:avoid}p{overflow-wrap:anywhere}.status,figcaption{font-size:.9em;color:#46515d}a{color:inherit}@media print{body{padding:0}}</style></head><body><h1>${html(selected.title)}</h1>${sections}</body></html>`;
	const markdown =
		[
			`# ${md(selected.title.replace(/[\r\n]/g, " "))}`,
			`Lesson revision ${selected.revision}. Draft steps require review.`,
			...selected.steps.map((step, index) => {
				const image = selected.assets.find((asset) => asset.id === step.imageId);
				const code = step.code ? `\n\n<pre>${html(step.code.text)}</pre>` : "";
				return `## ${index + 1}. ${md(step.title.replace(/[\r\n]/g, " "))}\n\n${step.status === "draft" ? "Draft — review required" : "Reviewed by author"}\n\n${md(step.instructions.replace(/\r\n?/g, "\n")).replace(/\n/g, "  \n")}${image ? `\n\n![${md(step.imageAlt.replace(/[\r\n]/g, " "))}](assets/${image.id}.jpg)` : ""}${code}`;
			}),
		].join("\n\n") + "\n";
	return { lesson: selected, html: outputHtml, markdown };
}
