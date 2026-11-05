/** SVG drawings are stored as self-contained source, not a screen-sized bitmap. */
export interface SvgAsset {
	svg: string;
	width: number;
	height: number;
}
export const SVG_MAX_BYTES = 256 * 1024;
const NS = "http://www.w3.org/2000/svg";
const ELEMENTS = new Set(
	"svg g path rect circle ellipse line polyline polygon defs linearGradient radialGradient stop clipPath mask pattern symbol use marker style filter feGaussianBlur feOffset feMerge feMergeNode feColorMatrix feDropShadow".split(
		" ",
	),
);
const ATTRIBUTES = new Set(
	"id class style viewBox width height x y x1 y1 x2 y2 cx cy r rx ry d points transform fill fill-opacity fill-rule stroke stroke-width stroke-opacity stroke-linecap stroke-linejoin stroke-miterlimit stroke-dasharray stroke-dashoffset opacity color gradientUnits gradientTransform spreadMethod offset stop-color stop-opacity clip-path clip-rule mask maskUnits maskContentUnits patternUnits patternContentUnits patternTransform preserveAspectRatio vector-effect marker-start marker-mid marker-end markerWidth markerHeight refX refY orient markerUnits filter filterUnits primitiveUnits stdDeviation dx dy in in2 result values type mode flood-color flood-opacity".split(
		" ",
	),
);
function localReferences(value: string) {
	if (/[\\]|@|expression\s*\(|javascript\s*:/i.test(value))
		throw new Error("unsupported SVG style");
	for (const match of value.matchAll(/url\s*\(([^)]*)\)/gi)) {
		if (!/^#[\w:.-]+$/.test(match[1].trim().replace(/^['"]|['"]$/g, "")))
			throw new Error("SVG must be self-contained");
	}
}
export function sanitizeSvg(source: string): SvgAsset {
	if (new TextEncoder().encode(source).length > SVG_MAX_BYTES || /<!DOCTYPE|<!ENTITY/i.test(source))
		throw new Error("SVG is too large or contains entities");
	const parsed = new DOMParser().parseFromString(source, "image/svg+xml");
	if (parsed.querySelector("parsererror") || parsed.documentElement.localName !== "svg")
		throw new Error("invalid SVG");
	const original = parsed.documentElement;
	const viewBox = (original.getAttribute("viewBox") ?? "")
		.trim()
		.split(/[\s,]+/)
		.map(Number);
	let [x, y, width, height] = viewBox;
	if (viewBox.length !== 4) {
		x = 0;
		y = 0;
		width = parseFloat(original.getAttribute("width") ?? "");
		height = parseFloat(original.getAttribute("height") ?? "");
	}
	if (
		![x, y, width, height].every(Number.isFinite) ||
		width <= 0 ||
		height <= 0 ||
		width > 1e6 ||
		height > 1e6
	)
		throw new Error("SVG needs a finite viewBox or dimensions");
	const doc = document.implementation.createDocument(NS, "svg", null);
	let count = 0;
	const copy = (node: Element): Element | null => {
		if (++count > 5000) throw new Error("SVG has too many elements");
		if (
			node.localName === "metadata" ||
			node.localName === "title" ||
			node.localName === "desc" ||
			(node.namespaceURI !== null && node.namespaceURI !== NS)
		)
			return null;
		if (!ELEMENTS.has(node.localName)) throw new Error("unsupported SVG element");
		const out = doc.createElementNS(NS, node.localName);
		for (const attr of Array.from(node.attributes)) {
			if (attr.name.startsWith("on")) throw new Error("interactive SVG is unsupported");
			if (attr.localName === "href") {
				if (!/^#[\w:.-]+$/.test(attr.value)) throw new Error("SVG must be self-contained");
				out.setAttribute("href", attr.value);
				continue;
			}
			if (!ATTRIBUTES.has(attr.name)) continue;
			localReferences(attr.value);
			out.setAttribute(attr.name, attr.value);
		}
		if (node.localName === "style") {
			localReferences(node.textContent ?? "");
			const css = (node.textContent ?? "").replace(/\/\*[\s\S]*?\*\//g, "");
			if (css.replace(/[^{}]+\{[^{}]*\}/g, "").trim())
				throw new Error("unsupported SVG stylesheet");
			out.textContent = node.textContent;
		} else
			for (const child of Array.from(node.children)) {
				const safe = copy(child);
				if (safe) out.append(safe);
			}
		return out;
	};
	const safe = copy(original)!;

	safe.setAttribute("viewBox", `${x} ${y} ${width} ${height}`);
	safe.setAttribute("width", String(width));
	safe.setAttribute("height", String(height));
	safe.setAttribute("x", "0");
	safe.setAttribute("y", "0");
	return { svg: new XMLSerializer().serializeToString(safe), width, height };
}
export async function importSvg(file: File): Promise<SvgAsset> {
	if (
		file.size > SVG_MAX_BYTES ||
		(file.type ? file.type !== "image/svg+xml" : !/\.svg$/i.test(file.name))
	)
		throw new Error("unsupported SVG file");
	return sanitizeSvg(await file.text());
}
export function svgDataUrl(svg: string): string {
	const bytes = new TextEncoder().encode(svg);
	let binary = "";
	for (let i = 0; i < bytes.length; i += 8192)
		binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
	return `data:image/svg+xml;base64,${btoa(binary)}`;
}
export function decodeSvgDataUrl(url: string): string | null {
	if (!url.startsWith("data:image/svg+xml;base64,") || url.length > SVG_MAX_BYTES * 2) return null;
	try {
		return new TextDecoder().decode(
			Uint8Array.from(atob(url.slice(url.indexOf(",") + 1)), (c) => c.charCodeAt(0)),
		);
	} catch {
		return null;
	}
}
export function svgDimensions(svg: string): [number, number] | null {
	const match = /\bviewBox="([^"]+)"/.exec(svg);
	if (!match) return null;
	const n = match[1].split(/[\s,]+/).map(Number);
	return n.length === 4 && n.every(Number.isFinite) && n[2] > 0 && n[3] > 0 ? [n[2], n[3]] : null;
}
/** SVGs always rotate about their art's centre and retain every corner. */
export function rotatedSvgGraphic(source: string, degrees: number): string {
	const size = svgDimensions(source);
	if (!size) return source;
	const [w, h] = size;
	const angle = Number.isFinite(degrees) ? degrees : 0;
	const rad = (angle * Math.PI) / 180;
	const width = Math.abs(w * Math.cos(rad)) + Math.abs(h * Math.sin(rad));
	const height = Math.abs(w * Math.sin(rad)) + Math.abs(h * Math.cos(rad));
	return `<svg xmlns="${NS}" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><g transform="translate(${width / 2} ${height / 2}) rotate(${angle}) translate(${-w / 2} ${-h / 2})">${source}</g></svg>`;
}
