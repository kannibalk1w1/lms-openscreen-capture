import {
	type ExportLessonRangeFileRequest,
	exportLessonRangeFileSchema,
} from "../lesson/fileExportContracts";
import {
	type CreateLessonPackageRequest,
	createLessonPackageSchema,
} from "../lesson/packageContracts";
// Pure argv parser for the OpenScreen CLI. No Electron imports so it can be
// unit-tested under plain vitest.

import path from "node:path";
import {
	CAPTION_WORDS_PER_LINE_MAX,
	CAPTION_WORDS_PER_LINE_MIN,
} from "../../src/lib/ai-edition/captions/wordsPerLine";
import {
	type CliExportRequest,
	type CliRecordRequest,
	type CliRequest,
	isAudioExportFormat,
} from "../../src/lib/cliContracts";
import {
	GIF_SIZE_PRESETS,
	type GifSizePreset,
	MP4_FRAME_RATES,
} from "../../src/lib/exporter/types";
import { type LessonQuery, lessonQuerySchema } from "../../src/lib/lesson/review";
import { exportLessonFileSchema } from "../lesson/fileContracts";
import {
	type ConfirmLessonFileRangeRequest,
	confirmLessonFileRangeSchema,
} from "../lesson/fileRangeContracts";

export type CliLessonCommand = { kind: "lesson"; manifestPath: string } & (
	| { action: "package"; request: CreateLessonPackageRequest }
	| { action: "verify-package"; directory: string }
	| { action: "confirm-range"; request: ConfirmLessonFileRangeRequest }
	| { action: "export-range"; request: ExportLessonRangeFileRequest }
	| { action: "query"; query: LessonQuery }
	| { action: "export"; outputDirectory: string; stepIds: string[] }
);

export interface CliInfoCommand {
	kind: "info";
	projectPath: string;
}

export interface CliHelpCommand {
	kind: "help";
}

export interface CliErrorCommand {
	kind: "error";
	message: string;
}

/** Serve the MCP tools on stdin/stdout, to the agent that started this process. */
export interface CliMcpCommand {
	kind: "mcp";
}

export type CliCommand = (
	| CliRequest
	| CliInfoCommand
	| CliLessonCommand
	| CliPackCommand
	| CliMcpCommand
	| CliHelpCommand
	| CliErrorCommand
) & {
	/** Machine-readable NDJSON output on stdout instead of human progress. */
	json?: boolean;
	/**
	 * Write the machine-readable result here rather than onto stdout.
	 *
	 * stdout is correct as it stands -- Chromium logs to stderr, and nothing this
	 * process runs writes anywhere it should not. What a caller cannot control is
	 * the wrapper around it. Ubuntu's xvfb-run, which is how a GUI binary gets run
	 * headlessly in the first place, folds the command's stderr into its stdout;
	 * under it, `sources --json | jq` sees Chromium's diagnostics ahead of the JSON
	 * and fails. That is not hypothetical -- it is what the first attempt to script
	 * this command did.
	 *
	 * A named file is a channel no wrapper can redirect into. It also sidesteps
	 * shell quoting and encoding, which matters more on Windows than on POSIX.
	 *
	 * Note the shapes differ, and website/docs/cli.md says so: stdout carries the payload
	 * inside the NDJSON `done` envelope because it is one event in a stream, while
	 * the file carries the bare payload because a file is not a stream. Written on
	 * success only.
	 */
	jsonOutPath?: string;
};

const SUBCOMMANDS = new Set([
	"lesson",
	"export",
	"record",
	"sources",
	"pack",
	"captions",
	"info",
	"mcp",
	"help",
	"--help",
	"-h",
]);

export const CLI_USAGE = `OpenScreen CLI

Usage:
  openscreen export <project.openscreen> [options]   Render a project to MP4/GIF, or its audio to WAV/M4A
  openscreen record [options]                        Record the screen headlessly
  openscreen sources [--json] [-o <file>]            List displays, windows, microphones and cameras
  openscreen pack <project.openscreen> --out <dir>   Copy project + media into one portable folder
  openscreen captions <project.openscreen>           Transcribe (on-device Whisper) and turn captions on
                     [--min-words <1-12>] [--max-words <1-12>]
  openscreen info <project.openscreen> [--json]      Inspect a project file
  openscreen lesson query <lesson.json> [--title <text>] [--status <all|draft|reviewed>]
                     [--source <all|authored|recording-flag|typing-section>] [--problems-only] [--json]
  openscreen lesson export <lesson.json> --out <existing-dir> --step <UUID> [--step <UUID> ...] [--json]
                            Selected file only; preserves source and creates a fresh verified guide folder
  openscreen lesson confirm-range <lesson.json> --project <current.openscreen> --project-id <ID>
                     --step <UUID> --start <seconds> --end <seconds> --source <absolute-file> [--source ...]
                     --intent <author-current|refresh-current> --out <new-lesson.json> [--json]
                            Explicit source grants and new editable copy; Linux supported subset, no MP4 export
  openscreen lesson export-range <lesson.json> --project <current.openscreen> --project-id <ID>
                     --step <UUID> --source <absolute-file> [--source ...] --out <existing-dir> [--json]
                            Export exactly this included confirmed step to a new verified private MP4 folder
  openscreen lesson package <lesson.json> --step <UUID> [--step ...] --code include|exclude
                     --images exclude|include-external-provenance --out <existing-dir>
                     [--media <step-UUID> <explicit.mp4> <range-export.json> ...] [--json]
                            Derived static lesson/media package; image inclusion retains external source metadata
  openscreen lesson verify-package <explicit-package-dir> [--json]
                            Verify/reopen package integrity without original paths; Linux subset, no player
  openscreen mcp                                     Serve the agent tools over MCP on stdio
  openscreen help                                    Show this help

Export options:
  -o, --out <path>          Output file (.mp4, .gif, .wav or .m4a). Default: next to the project file
  --format <mp4|gif|wav|m4a>
                            Override the format stored in the project. wav and m4a write
                            the project's audio only, as the MP4 export mixes it
  --track <audioId>         WAV/M4A only: write this imported audio track alone
  --quality <medium|good|source>
                            MP4 quality (default: from project)
  --fps <24|30|60>          MP4 frame rate (default 60)
  --gif-fps <15|20|25|30>   GIF frame rate (default: from project)
  --gif-size <small|medium|large|original>
                            GIF size preset (default: from project)
  --gif-loop, --no-gif-loop GIF loops forever, or plays once (default: from project)
  --auto-zoom               Add automatic zooms from cursor telemetry (editor's magic wand)
  --audio <file>            Mix a voiceover audio file into the MP4 (mp3/wav/m4a)
  --audio-mode <mix|replace>
                            Layer over the recording's audio (default) or replace it
  --audio-offset <seconds>  Delay before the voiceover starts (default 0)
  --json                    NDJSON progress/result on stdout

Record options (recording is saved into the app's recordings directory):
  --display <n>             Screen index to record (default 0)
  --window <title>          Record the first window whose title contains <title>
  --mic                     Capture the default microphone
  --mic-device <name>       Microphone device name (implies --mic)
  --system-audio            Capture system audio
  --camera                  Record the default webcam beside the screen
  --camera-device <name>    Camera device name (implies --camera)
  --cursor <editable-overlay|system>
                            Cursor capture mode (default editable-overlay)
  --duration <seconds>      Stop automatically after this long
  --project <out.openscreen>
                            Write a ready-to-export project file when done
  --json                    NDJSON events on stdout

Stopping a recording: send SIGINT/SIGTERM, type "stop" + Enter on stdin,
or pass --duration.
`;

function takeValue(argv: string[], i: number, flag: string): [string, number] {
	const next = argv[i + 1];
	// "" is rejected alongside a missing value: an unset variable in a wrapper
	// (`openscreen sources -o "$OUT"`) reaches us as an empty argument, and every
	// caller here feeds the result to resolvePath, where path.resolve(cwd, "")
	// returns cwd. That turns a typo into a directory path, which then fails much
	// later as EISDIR from the write — after the work is done and discarded —
	// instead of as the parse error the same mistake gets when the value is
	// omitted entirely.
	if (next === undefined || next === "" || next.startsWith("--")) {
		throw new Error(`${flag} requires a value`);
	}
	return [next, i + 1];
}

function resolvePath(p: string, cwd: string): string {
	return path.isAbsolute(p) ? p : path.resolve(cwd, p);
}

/**
 * Extracts CLI arguments from process.argv. Returns null when no subcommand is
 * present (normal GUI launch). `firstArgIndex` should be 1 for packaged builds
 * and 2 when running via `electron <app-path> ...`.
 */
export function parseCliArgs(
	argv: string[],
	firstArgIndex: number,
	cwd: string = process.cwd(),
): CliCommand | null {
	const rawArgs = argv.slice(firstArgIndex).filter((a) => !a.startsWith("--inspect"));

	// Skip *leading* Chromium/Electron switches (e.g. the AppImage's required
	// `--no-sandbox`) so `Openscreen --no-sandbox export demo.openscreen` still
	// enters CLI mode. Only leading dash-tokens are skipped — everything after
	// the subcommand belongs to the subcommand parser. `--help`/`-h` are ours.
	let subIndex = 0;
	while (
		subIndex < rawArgs.length &&
		rawArgs[subIndex].startsWith("-") &&
		rawArgs[subIndex] !== "--help" &&
		rawArgs[subIndex] !== "-h"
	) {
		subIndex++;
	}

	const args = rawArgs.slice(subIndex);
	const sub = args[0];
	if (!sub || !SUBCOMMANDS.has(sub)) return null;
	if (sub === "help" || sub === "--help" || sub === "-h") return { kind: "help" };

	try {
		if (sub === "lesson") return parseLessonCommand(args.slice(1), cwd);
		if (sub === "export") return parseExport(args.slice(1), cwd);
		if (sub === "record") return parseRecord(args.slice(1), cwd);
		if (sub === "sources") return parseSources(args.slice(1), cwd);
		if (sub === "pack") return parsePack(args.slice(1), cwd);
		if (sub === "captions") return parseCaptions(args.slice(1), cwd);
		if (sub === "mcp") {
			if (args.length > 1) throw new Error(`Unexpected argument for mcp: ${args[1]}`);
			return { kind: "mcp" };
		}
		return parseInfo(args.slice(1), cwd);
	} catch (error) {
		return { kind: "error", message: error instanceof Error ? error.message : String(error) };
	}
}

function parseExport(args: string[], cwd: string): CliCommand {
	const request: CliExportRequest & { json?: boolean } = {
		kind: "export",
		projectPath: "",
		outPath: null,
		format: null,
		quality: null,
		mp4FrameRate: 60,
		gifFrameRate: null,
		gifSizePreset: null,
		gifLoop: null,
		autoZoom: false,
		audioPath: null,
		audioMode: "mix",
		audioOffsetSec: 0,
	};

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		switch (arg) {
			case "-o":
			case "--out": {
				const [value, next] = takeValue(args, i, arg);
				request.outPath = resolvePath(value, cwd);
				i = next;
				break;
			}
			case "--format": {
				const [value, next] = takeValue(args, i, arg);
				if (value !== "mp4" && value !== "gif" && !isAudioExportFormat(value)) {
					throw new Error(`--format must be mp4, gif, wav or m4a, got "${value}"`);
				}
				request.format = value;
				i = next;
				break;
			}
			case "--quality": {
				const [value, next] = takeValue(args, i, arg);
				if (value !== "medium" && value !== "good" && value !== "source") {
					throw new Error(`--quality must be medium, good or source, got "${value}"`);
				}
				request.quality = value;
				i = next;
				break;
			}
			case "--fps": {
				const [value, next] = takeValue(args, i, arg);
				const fps = MP4_FRAME_RATES.find((rate) => rate === Number(value));
				if (fps === undefined) {
					throw new Error(`--fps must be ${MP4_FRAME_RATES.join(", ")}, got "${value}"`);
				}
				request.mp4FrameRate = fps;
				i = next;
				break;
			}
			case "--gif-fps": {
				const [value, next] = takeValue(args, i, arg);
				const fps = Number(value);
				if (fps !== 15 && fps !== 20 && fps !== 25 && fps !== 30) {
					throw new Error(`--gif-fps must be 15, 20, 25 or 30, got "${value}"`);
				}
				request.gifFrameRate = fps;
				i = next;
				break;
			}
			case "--gif-size": {
				const [value, next] = takeValue(args, i, arg);
				const size = (Object.keys(GIF_SIZE_PRESETS) as GifSizePreset[]).find((s) => s === value);
				if (size === undefined) {
					throw new Error(`--gif-size must be small, medium, large or original, got "${value}"`);
				}
				request.gifSizePreset = size;
				i = next;
				break;
			}
			case "--gif-loop":
			case "--no-gif-loop":
				request.gifLoop = arg === "--gif-loop";
				break;
			case "--track": {
				const [value, next] = takeValue(args, i, arg);
				request.audioTrackId = value;
				i = next;
				break;
			}
			case "--auto-zoom":
				request.autoZoom = true;
				break;
			case "--audio": {
				const [value, next] = takeValue(args, i, arg);
				request.audioPath = resolvePath(value, cwd);
				i = next;
				break;
			}
			case "--audio-mode": {
				const [value, next] = takeValue(args, i, arg);
				if (value !== "mix" && value !== "replace") {
					throw new Error(`--audio-mode must be mix or replace, got "${value}"`);
				}
				request.audioMode = value;
				i = next;
				break;
			}
			case "--audio-offset": {
				const [value, next] = takeValue(args, i, arg);
				const seconds = Number(value);
				if (!Number.isFinite(seconds) || seconds < 0) {
					throw new Error(
						`--audio-offset must be a non-negative number of seconds, got "${value}"`,
					);
				}
				request.audioOffsetSec = seconds;
				i = next;
				break;
			}
			case "--json":
				request.json = true;
				break;
			default:
				if (arg.startsWith("-")) throw new Error(`Unknown export option: ${arg}`);
				if (request.projectPath) throw new Error(`Unexpected extra argument: ${arg}`);
				request.projectPath = resolvePath(arg, cwd);
		}
	}

	if (!request.projectPath) throw new Error("export requires a <project.openscreen> path");
	if (request.outPath) {
		const ext = path.extname(request.outPath).toLowerCase();
		const extFormat = ext.slice(1);
		if (extFormat !== "mp4" && extFormat !== "gif" && !isAudioExportFormat(extFormat)) {
			throw new Error(`--out must end in .mp4, .gif, .wav or .m4a, got "${request.outPath}"`);
		}
		if (request.format && request.format !== extFormat) {
			throw new Error(`--format ${request.format} conflicts with --out extension ${ext}`);
		}
		request.format = extFormat;
	}
	// After --out resolves the format, so `--audio … -o out.gif` is caught too.
	if (request.audioPath && (request.format === "gif" || isAudioExportFormat(request.format))) {
		throw new Error("--audio is only supported for MP4 exports");
	}
	if (request.audioTrackId && !isAudioExportFormat(request.format)) {
		throw new Error("--track is only supported for audio exports (.wav or .m4a)");
	}
	// The MP4 options: a GIF is sized from the source and has its own frame rate.
	if (request.format !== "mp4" && request.format !== null && request.quality) {
		throw new Error("--quality is only supported for MP4 exports");
	}
	if (request.format === "gif" && args.includes("--fps")) {
		throw new Error("--fps is only supported for MP4 exports (use --gif-fps)");
	}
	// And the GIF options, on an MP4 they would not change.
	const gifFlag = ["--gif-fps", "--gif-size", "--gif-loop", "--no-gif-loop"].find((flag) =>
		args.includes(flag),
	);
	if (request.format !== "gif" && request.format !== null && gifFlag) {
		throw new Error(`${gifFlag} is only supported for GIF exports`);
	}
	return request;
}

function parseRecord(args: string[], cwd: string): CliCommand {
	const request: CliRecordRequest & { json?: boolean } = {
		kind: "record",
		displayIndex: 0,
		windowTitle: null,
		mic: false,
		micDevice: null,
		systemAudio: false,
		camera: false,
		cameraDevice: null,
		cursorMode: "editable-overlay",
		durationMs: null,
		projectOut: null,
	};

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		switch (arg) {
			case "--display": {
				const [value, next] = takeValue(args, i, arg);
				const index = Number(value);
				if (!Number.isInteger(index) || index < 0) {
					throw new Error(`--display must be a non-negative integer, got "${value}"`);
				}
				request.displayIndex = index;
				i = next;
				break;
			}
			case "--window": {
				const [value, next] = takeValue(args, i, arg);
				request.windowTitle = value;
				i = next;
				break;
			}
			case "--mic":
				request.mic = true;
				break;
			case "--mic-device": {
				const [value, next] = takeValue(args, i, arg);
				request.mic = true;
				request.micDevice = value;
				i = next;
				break;
			}
			case "--system-audio":
				request.systemAudio = true;
				break;
			case "--camera":
				request.camera = true;
				break;
			case "--camera-device": {
				const [value, next] = takeValue(args, i, arg);
				request.camera = true;
				request.cameraDevice = value;
				i = next;
				break;
			}
			case "--cursor": {
				const [value, next] = takeValue(args, i, arg);
				if (value !== "editable-overlay" && value !== "system") {
					throw new Error(`--cursor must be editable-overlay or system, got "${value}"`);
				}
				request.cursorMode = value;
				i = next;
				break;
			}
			case "--duration": {
				const [value, next] = takeValue(args, i, arg);
				const seconds = Number(value);
				if (!Number.isFinite(seconds) || seconds <= 0) {
					throw new Error(`--duration must be a positive number of seconds, got "${value}"`);
				}
				request.durationMs = Math.round(seconds * 1000);
				i = next;
				break;
			}
			case "--project": {
				const [value, next] = takeValue(args, i, arg);
				if (!value.endsWith(".openscreen")) {
					throw new Error(`--project must end in .openscreen, got "${value}"`);
				}
				request.projectOut = resolvePath(value, cwd);
				i = next;
				break;
			}
			case "--json":
				request.json = true;
				break;
			default:
				throw new Error(`Unknown record option: ${arg}`);
		}
	}
	return request;
}

function parseSources(args: string[], cwd: string): CliCommand {
	let json = false;
	let jsonOutPath: string | undefined;
	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === "--json") {
			json = true;
		} else if (arg === "-o" || arg === "--out") {
			const [value, next] = takeValue(args, i, arg);
			jsonOutPath = resolvePath(value, cwd);
			i = next;
		} else {
			throw new Error(`Unknown sources option: ${arg}`);
		}
	}
	return { kind: "sources", json, jsonOutPath };
}

export interface CliPackCommand {
	kind: "pack";
	projectPath: string;
	outDir: string;
}

function parsePack(args: string[], cwd: string): CliCommand {
	let projectPath = "";
	let outDir = "";
	let json = false;
	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === "-o" || arg === "--out") {
			const [value, next] = takeValue(args, i, arg);
			outDir = resolvePath(value, cwd);
			i = next;
		} else if (arg === "--json") {
			json = true;
		} else if (arg.startsWith("-")) {
			throw new Error(`Unknown pack option: ${arg}`);
		} else if (projectPath) {
			throw new Error(`Unexpected extra argument: ${arg}`);
		} else {
			projectPath = resolvePath(arg, cwd);
		}
	}
	if (!projectPath) throw new Error("pack requires a <project.openscreen> path");
	if (!outDir) throw new Error("pack requires --out <directory>");
	return { kind: "pack", projectPath, outDir, json };
}

function parseCaptions(args: string[], cwd: string): CliCommand {
	let projectPath = "";
	let minWordsPerCaption = 2;
	let maxWordsPerCaption = 7;
	let json = false;
	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === "--min-words" || arg === "--max-words") {
			const [value, next] = takeValue(args, i, arg);
			const count = Number(value);
			// The editor's caption settings clamp to the same range, so a larger value would
			// write a project the editor then shows differently.
			if (
				!Number.isInteger(count) ||
				count < CAPTION_WORDS_PER_LINE_MIN ||
				count > CAPTION_WORDS_PER_LINE_MAX
			) {
				throw new Error(
					`${arg} must be an integer from ${CAPTION_WORDS_PER_LINE_MIN} to ${CAPTION_WORDS_PER_LINE_MAX}, got "${value}"`,
				);
			}
			if (arg === "--min-words") minWordsPerCaption = count;
			else maxWordsPerCaption = count;
			i = next;
		} else if (arg === "--json") {
			json = true;
		} else if (arg.startsWith("-")) {
			throw new Error(`Unknown captions option: ${arg}`);
		} else if (projectPath) {
			throw new Error(`Unexpected extra argument: ${arg}`);
		} else {
			projectPath = resolvePath(arg, cwd);
		}
	}
	if (!projectPath) throw new Error("captions requires a <project.openscreen> path");
	if (minWordsPerCaption > maxWordsPerCaption) {
		throw new Error("--min-words cannot exceed --max-words");
	}
	return { kind: "captions", projectPath, minWordsPerCaption, maxWordsPerCaption, json };
}

function parseInfo(args: string[], cwd: string): CliCommand {
	let projectPath = "";
	let json = false;
	for (const arg of args) {
		if (arg === "--json") {
			json = true;
		} else if (arg.startsWith("-")) {
			throw new Error(`Unknown info option: ${arg}`);
		} else if (projectPath) {
			throw new Error(`Unexpected extra argument: ${arg}`);
		} else {
			projectPath = resolvePath(arg, cwd);
		}
	}
	if (!projectPath) throw new Error("info requires a <project.openscreen> path");
	return { kind: "info", projectPath, json };
}

function parseLessonCommand(args: string[], cwd: string): CliCommand {
	const [action, file] = args;

	if (action === "verify-package") {
		if (
			!file ||
			file.startsWith("-") ||
			args.slice(2).some((v) => v !== "--json") ||
			args.slice(2).length > 1
		)
			throw new Error("Choose one explicit package directory");
		return {
			kind: "lesson",
			action,
			manifestPath: resolvePath(file, cwd),
			directory: resolvePath(file, cwd),
			json: args.includes("--json"),
		};
	}
	if (action === "package") {
		if (!file || file.startsWith("-")) throw new Error("Choose an explicit editable lesson");
		const request: Record<string, unknown> = {
			manifestPath: resolvePath(file, cwd),
			stepIds: [],
			media: [],
		};
		let json = false;
		for (let i = 2; i < args.length; i++) {
			const flag = args[i];
			if (flag === "--json") {
				if (json) throw new Error("Duplicate option");
				json = true;
				continue;
			}
			const [value, next] = takeValue(args, i, flag);
			i = next;
			if (flag === "--step") {
				(request.stepIds as string[]).push(value);
				continue;
			}
			if (flag === "--media") {
				const [mediaPath, second] = takeValue(args, i, "--media video"),
					[receiptPath, third] = takeValue(args, second, "--media receipt");
				i = third;
				(request.media as unknown[]).push({
					stepId: value,
					mediaPath: resolvePath(mediaPath, cwd),
					receiptPath: resolvePath(receiptPath, cwd),
				});
				continue;
			}
			const key =
				flag === "--code"
					? "includeCode"
					: flag === "--images"
						? "imagePolicy"
						: flag === "--out"
							? "outputDirectory"
							: undefined;
			if (!key || key in request) throw new Error("Unexpected or duplicate package option");
			if (flag === "--code" && value !== "include" && value !== "exclude")
				throw new Error("Choose include or exclude code");
			request[key] =
				flag === "--code"
					? value === "include"
					: flag === "--out"
						? resolvePath(value, cwd)
						: value;
		}
		const parsed = createLessonPackageSchema.safeParse(request);
		if (!parsed.success)
			throw new Error(
				"Choose explicit steps, --code include|exclude, --images exclude|include-external-provenance, explicit media/receipt pairs and existing --out directory",
			);
		return {
			kind: "lesson",
			action,
			manifestPath: parsed.data.manifestPath,
			request: parsed.data,
			json,
		};
	}

	if (action === "export-range") {
		if (!file || file.startsWith("-")) throw new Error("Choose an explicit lesson file");
		const request: Record<string, unknown> = {
			manifestPath: resolvePath(file, cwd),
			sourcePaths: [],
		};
		let json = false;
		const fields: Record<string, string> = {
			"--project": "projectPath",
			"--project-id": "projectId",
			"--step": "stepId",
			"--source": "sourcePaths",
			"--out": "outputDirectory",
		};
		for (let i = 2; i < args.length; i++) {
			const flag = args[i];
			if (flag === "--json") {
				if (json) throw new Error("Duplicate option");
				json = true;
				continue;
			}
			const field = fields[flag];
			if (!field) throw new Error("Unexpected range export option");
			const [value, next] = takeValue(args, i, flag);
			i = next;
			if (field === "sourcePaths") {
				(request.sourcePaths as string[]).push(resolvePath(value, cwd));
				continue;
			}
			if (field in request) throw new Error("Choose exactly one project, step and destination");
			request[field] =
				field === "projectPath" || field === "outputDirectory" ? resolvePath(value, cwd) : value;
		}
		request.includedStepIds = [request.stepId];
		const parsed = exportLessonRangeFileSchema.safeParse(request);
		if (!parsed.success)
			throw new Error(
				"Choose saved lesson/project, exactly one included step, explicit sources and an existing output directory",
			);
		return {
			kind: "lesson",
			action,
			manifestPath: parsed.data.manifestPath,
			request: parsed.data,
			json,
		};
	}
	if (action === "confirm-range") {
		if (!file || file.startsWith("-")) throw new Error("Choose an explicit lesson file");
		const request: Record<string, unknown> = {
			manifestPath: resolvePath(file, cwd),
			sourcePaths: [],
		};
		let json = false;
		const fields: Record<string, string> = {
			"--project": "projectPath",
			"--project-id": "projectId",
			"--step": "stepId",
			"--start": "startSec",
			"--end": "endSec",
			"--source": "sourcePaths",
			"--intent": "intent",
			"--out": "outputPath",
		};
		for (let i = 2; i < args.length; i++) {
			const flag = args[i];
			if (flag === "--json") {
				if (json) throw new Error("Duplicate option");
				json = true;
				continue;
			}
			const field = fields[flag];
			if (!field) throw new Error("Unexpected confirmation option");
			const [value, next] = takeValue(args, i, flag);
			i = next;
			if (field === "sourcePaths") {
				(request.sourcePaths as string[]).push(resolvePath(value, cwd));
				continue;
			}
			if (field in request) throw new Error("Duplicate confirmation option");
			request[field] =
				field === "startSec" || field === "endSec"
					? Number(value)
					: field === "projectPath" || field === "outputPath"
						? resolvePath(value, cwd)
						: value;
		}
		const parsed = confirmLessonFileRangeSchema.safeParse(request);
		if (!parsed.success)
			throw new Error("Choose explicit project, step, range, intent, sources and new output file");
		return {
			kind: "lesson",
			action,
			manifestPath: parsed.data.manifestPath,
			request: parsed.data,
			json,
		};
	}
	if ((action !== "query" && action !== "export") || !file || file.startsWith("-"))
		throw new Error(
			"Use lesson query <lesson.json> or lesson export <lesson.json> --out <existing-dir> --step <UUID>",
		);
	const manifestPath = resolvePath(file, cwd);
	let json = false;
	const query: Record<string, unknown> = {};
	let outputDirectory: string | undefined;
	const stepIds: string[] = [];
	for (let i = 2; i < args.length; i++) {
		const flag = args[i];
		if (flag === "--json") {
			json = true;
			continue;
		}
		if (action === "query" && flag === "--problems-only") {
			query.problemsOnly = true;
			continue;
		}
		if (action === "query" && ["--title", "--status", "--source"].includes(flag)) {
			const [value, next] = takeValue(args, i, flag);
			i = next;
			query[flag.slice(2)] = value;
			continue;
		}
		if (action === "export" && (flag === "--out" || flag === "-o" || flag === "--step")) {
			const [value, next] = takeValue(args, i, flag);
			i = next;
			if (flag === "--step") stepIds.push(value);
			else {
				if (outputDirectory) throw new Error("Choose one output directory");
				outputDirectory = resolvePath(value, cwd);
			}
			continue;
		}
		throw new Error("Unexpected lesson option");
	}
	if (action === "query") {
		const parsed = lessonQuerySchema.safeParse(query);
		if (!parsed.success) throw new Error("Invalid lesson query options");
		return { kind: "lesson", action, manifestPath, query: parsed.data, json };
	}
	const parsed = exportLessonFileSchema.safeParse({ manifestPath, outputDirectory, stepIds });
	if (!parsed.success)
		throw new Error("Lesson export requires an output directory and 1–200 unique step UUIDs");
	return { kind: "lesson", action, ...parsed.data, json };
}
