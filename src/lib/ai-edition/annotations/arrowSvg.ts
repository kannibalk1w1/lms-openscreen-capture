import type { SceneAnnotation } from "../../../native/sceneDescription";
import { connectorPath } from "./connectors";
import { decodeSvgDataUrl, rotatedSvgGraphic, svgDataUrl } from "./svgAssets";

const xml = (s: string) =>
	s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
// Embedded head styles must not restyle the shaft or the opposite head.
function scopedHead(svg: string, id: string): string {
	return svg.replace(/<style([^>]*)>([\s\S]*?)<\/style>/g, (_all, attrs: string, css: string) => {
		const scoped = css.replace(
			/([^{}]+)\{([^{}]*)\}/g,
			(_rule, selectors: string, body: string) =>
				`${selectors
					.split(",")
					.map((selector) => `#${id} ${selector.trim().replace(/:root/g, "svg")}`)
					.join(",")} {${body}}`,
		);
		return `<style${attrs}>${scoped}</style>`;
	});
}
/** Resolve styled vectors at the compositor boundary; source geometry stays in the document. */
export function resolveSvgAnnotation(
	annotation: SceneAnnotation,
	output: { width: number; height: number },
): SceneAnnotation {
	if (annotation.kind === "image" && annotation.imagePath) {
		const source = decodeSvgDataUrl(annotation.imagePath);
		if (source && annotation.imageRotation)
			return {
				...annotation,
				imagePath: svgDataUrl(rotatedSvgGraphic(source, annotation.imageRotation)),
				imageRotation: undefined,
			};
		return annotation;
	}
	const f = annotation.figure,
		c = f?.connector;
	if (
		annotation.kind !== "figure" ||
		!f ||
		!c ||
		!(
			f.linePattern === "dashed" ||
			f.headStyle === "triangle" ||
			f.headStyle === "custom" ||
			f.headEnds === "both" ||
			f.headEnds === "none" ||
			(f.headScale && f.headScale !== 1)
		)
	)
		return annotation;
	const w = annotation.w * output.width,
		h = annotation.h * output.height;
	if (w <= 0 || h <= 0) return annotation;
	const stroke = (f.strokeWidth * output.height) / 1080;
	const length = Math.max((10 * output.height) / 1080, stroke * 4) * (f.headScale ?? 1);
	const asset = f.headSvg;
	const ratio = asset ? Math.min(20, asset.height / asset.width) : 1;
	const pad = length * (1 + ratio) + stroke;
	const point = (p: { x: number; y: number }) => ({ x: p.x * w, y: p.y * h });
	const a = point(c.tail),
		b = point(c.head),
		q = point(c.bend);
	const tangent = (end: boolean) => {
		const tip = end ? b : a;
		let prev = c.shape === "curved" ? q : end ? a : b;
		if (c.shape === "elbow") {
			prev = end ? { x: q.x, y: b.y } : { x: q.x, y: a.y };
			if (Math.hypot(tip.x - prev.x, tip.y - prev.y) < 0.001)
				prev = end ? { x: q.x, y: a.y } : { x: q.x, y: b.y };
		}
		if (Math.hypot(tip.x - prev.x, tip.y - prev.y) < 0.001) prev = end ? a : b;
		return (Math.atan2(tip.y - prev.y, tip.x - prev.x) * 180) / Math.PI;
	};
	const head = (end: boolean) => {
		const p = end ? b : a;
		let art: string;
		if (f.headStyle === "custom" && asset) {
			art = `<g transform="translate(${-length} ${(-length * ratio) / 2}) scale(${length / asset.width} ${(length * ratio) / asset.height})">${scopedHead(asset.svg, end ? "openscreen-head-end" : "openscreen-head-tail")}</g>`;
		} else if (f.headStyle === "triangle")
			art = `<path d="M0 0 L${-length} ${-length * 0.5} L${-length} ${length * 0.5} Z" fill="${xml(f.color)}"/>`;
		else
			art = `<path d="M${-length} ${-length * 0.5} L0 0 L${-length} ${length * 0.5}" fill="none" stroke="${xml(f.color)}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round"/>`;
		return `<g id="${end ? "openscreen-head-end" : "openscreen-head-tail"}" color="${xml(f.color)}" transform="translate(${p.x} ${p.y}) rotate(${tangent(end)})">${art}</g>`;
	};
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w + pad * 2}" height="${h + pad * 2}" viewBox="${-pad} ${-pad} ${w + pad * 2} ${h + pad * 2}"><path d="${connectorPath(c, { x: w, y: h })}" fill="none" stroke="${xml(f.color)}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" ${f.linePattern === "dashed" ? `stroke-dasharray="${stroke * 6} ${stroke * 4}"` : ""}/>${f.headEnds === "none" ? "" : head(true)}${f.headEnds === "both" ? head(false) : ""}</svg>`;
	return {
		...annotation,
		kind: "image",
		figure: undefined,
		imagePath: svgDataUrl(svg),
		x: annotation.x - pad / output.width,
		y: annotation.y - pad / output.height,
		w: annotation.w + (pad * 2) / output.width,
		h: annotation.h + (pad * 2) / output.height,
	};
}
