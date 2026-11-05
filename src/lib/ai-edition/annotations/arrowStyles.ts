import type { FigureData } from "../../../components/video-editor/types";
export type ArrowStyle = Pick<
	FigureData,
	"color" | "strokeWidth" | "linePattern" | "headEnds" | "headStyle" | "headSvg" | "headScale"
>;
export interface ArrowStylePreset {
	id: string;
	name: string;
	style: ArrowStyle;
}
const KEY = "openscreen-arrow-styles-v1";
const LAST = "openscreen-arrow-style-last-v1";
export function arrowStyle(figure: FigureData): ArrowStyle {
	return {
		color: figure.color,
		strokeWidth: figure.strokeWidth,
		linePattern: figure.linePattern ?? "solid",
		headEnds: figure.headEnds ?? "end",
		headStyle: figure.headStyle ?? "open",
		headSvg: figure.headSvg,
		headScale: figure.headScale ?? 1,
	};
}
export function readArrowStyle(value: unknown): ArrowStyle | null {
	if (!value || typeof value !== "object") return null;
	const s = value as ArrowStyle;
	if (
		typeof s.color !== "string" ||
		s.color.length > 100 ||
		!Number.isFinite(s.strokeWidth) ||
		s.strokeWidth < 1 ||
		s.strokeWidth > 20
	)
		return null;
	if (
		s.headSvg &&
		(typeof s.headSvg.svg !== "string" ||
			s.headSvg.svg.length > 400000 ||
			!s.headSvg.svg.startsWith("<svg") ||
			!Number.isFinite(s.headSvg.width) ||
			!Number.isFinite(s.headSvg.height) ||
			s.headSvg.width <= 0 ||
			s.headSvg.height <= 0)
	)
		return null;
	return {
		color: s.color,
		strokeWidth: s.strokeWidth,
		linePattern: s.linePattern === "dashed" ? "dashed" : "solid",
		headEnds: s.headEnds === "both" || s.headEnds === "none" ? s.headEnds : "end",
		headStyle: s.headStyle === "triangle" || s.headStyle === "custom" ? s.headStyle : "open",
		headSvg: s.headSvg,
		headScale: Math.max(0.25, Math.min(4, Number(s.headScale) || 1)),
	};
}
export function loadArrowStyles(): ArrowStylePreset[] {
	try {
		const data: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
		if (!Array.isArray(data)) return [];
		return data.slice(0, 20).flatMap((item) => {
			const style = readArrowStyle(item?.style);
			return style && typeof item.id === "string" && typeof item.name === "string"
				? [{ id: item.id, name: item.name.slice(0, 80), style }]
				: [];
		});
	} catch {
		return [];
	}
}
export function saveArrowStyles(styles: ArrowStylePreset[]) {
	localStorage.setItem(KEY, JSON.stringify(styles.slice(0, 20)));
}
export function rememberArrowStyle(style: ArrowStyle) {
	try {
		localStorage.setItem(LAST, JSON.stringify(style));
	} catch {
		/* The project still owns its active style if browser storage is full. */
	}
}
export function lastArrowStyle(): ArrowStyle | null {
	try {
		return readArrowStyle(JSON.parse(localStorage.getItem(LAST) ?? "null"));
	} catch {
		return null;
	}
}
