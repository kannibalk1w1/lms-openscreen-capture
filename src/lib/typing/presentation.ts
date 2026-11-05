import hljs from "highlight.js/lib/core";
import type { AxcutDocument } from "../ai-edition/schema";
import { sectionPlayback } from "./capture";
import type { CodePresentation } from "./presentationSchema";
import gdscript from "./vendor/gdscript";

hljs.registerLanguage("gdscript", (api) => {
	const language = gdscript(api);
	// The upstream grammar includes Godot 3 spellings; extend its keyword set for Godot 4.
	const keywords = language.keywords as Record<string, string>;
	keywords.keyword += " await super trait namespace abstract";
	language.contains?.unshift({ className: "meta", begin: /@[A-Za-z_][\w]*/ });
	return language;
});
export interface CodeToken {
	text: string;
	color: string;
}
export interface CodeFrame {
	at: number;
	tokens: CodeToken[];
	caretLine: number;
	caretColumn: number;
}
export interface SceneCodePanel {
	originSec: number;
	durationSec: number;
	mode: "clean" | "faithful";
	pauseBackground: boolean;
	blurBackground: boolean;
	theme: "dark" | "light";
	fontSize: number;
	firstLine: number;
	lineNumbers: boolean;
	title: string;
	frames: CodeFrame[];
}
const decode = (s: string) =>
	s.replace(
		/&(amp|lt|gt|quot|#x27|#39);/g,
		(_, key: string) => ({ amp: "&", lt: "<", gt: ">", quot: '"', "#x27": "'", "#39": "'" })[key]!,
	);
export function highlightGdscript(text: string, theme: "dark" | "light"): CodeToken[] {
	const palette: Record<string, string> =
		theme === "dark"
			? {
					plain: "#dce3ef",
					keyword: "#c792ea",
					string: "#c3e88d",
					number: "#f78c6c",
					comment: "#80909f",
					built_in: "#82aaff",
					title: "#ffcb6b",
					literal: "#f78c6c",
					meta: "#89ddff",
					type: "#ffcb6b",
				}
			: {
					plain: "#25334d",
					keyword: "#7c3ab5",
					string: "#2e7d32",
					number: "#b24d20",
					comment: "#6a737d",
					built_in: "#1658a7",
					title: "#916215",
					literal: "#b24d20",
					meta: "#126d87",
					type: "#916215",
				};
	const html = hljs.highlight(text, { language: "gdscript", ignoreIllegals: true }).value;
	const stack = [palette.plain],
		tokens: CodeToken[] = [];
	for (const match of html.matchAll(/<span class="([^"]+)">|<\/span>|([^<]+)/g)) {
		if (match[1]) {
			const kind = /hljs-([\w]+)/.exec(match[1])?.[1] ?? "plain";
			stack.push(palette[kind] ?? stack.at(-1)!);
		} else if (match[0] === "</span>") stack.pop();
		else if (match[2])
			tokens.push({ text: decode(match[2]), color: stack.at(-1) ?? palette.plain });
	}
	return tokens;
}
export function codePanelForRegion(
	doc: AxcutDocument,
	data: CodePresentation,
	originSec: number,
	durationSec: number,
): SceneCodePanel | null {
	const take = doc.typingTakes?.find((t) => t.id === data.takeId),
		section = take?.sections.find((s) => s.id === data.sectionId);
	if (!take || !section) return null;
	const playback = sectionPlayback(take, section);
	const snippet = (text: string) =>
		text
			.split("\n")
			.slice(data.firstLine - 1, data.firstLine - 1 + data.lineCount)
			.join("\n");
	const frames: CodeFrame[] = [];
	const edits = take.events.filter(
		(e) =>
			e.event === "text-edit" &&
			e.sequence >= section.startSequence &&
			e.sequence <= section.endSequence,
	);
	const add = (text: string, at: number, focus?: number) => {
		const selected = snippet(text);
		if (selected.length > 12000) throw new Error("Code panel snippet exceeds 12,000 characters");
		const prefix = focus === undefined ? selected : Array.from(text).slice(0, focus).join("");
		frames.push({
			at,
			tokens: highlightGdscript(selected, data.theme),
			caretLine:
				focus === undefined
					? selected.split("\n").length - 1
					: prefix.split("\n").length - data.firstLine,
			caretColumn: Array.from((prefix.split("\n").at(-1) ?? "").replace(/\t/g, "    ")).length,
		});
	};
	if (data.mode === "clean") add(playback.finalText, 0);
	else {
		if (playback.frames.length > 1000)
			throw new Error("Choose a smaller typing section (up to 1,000 edits)");
		add(playback.beforeText, 0);
		const total = playback.frames.at(-1)?.atMs ?? 0;
		playback.frames.forEach((frame, index) =>
			add(
				frame.text,
				total > 0 ? frame.atMs / total : 0,
				edits[index]?.event === "text-edit" ? edits[index].selections[0]?.focus : undefined,
			),
		);
	}
	return { ...data, originSec, durationSec, title: take.documentName, frames };
}
