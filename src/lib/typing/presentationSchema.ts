import { z } from "zod";
export const codePresentationSchema = z.object({
	takeId: z.string().min(1),
	sectionId: z.string().min(1),
	mode: z.enum(["clean", "faithful"]).default("clean"),
	pauseBackground: z.boolean().default(true),
	blurBackground: z.boolean().default(true),
	theme: z.enum(["dark", "light"]).default("dark"),
	fontSize: z.number().min(12).max(60).default(26),
	firstLine: z.number().int().min(1).max(200000).default(1),
	lineCount: z.number().int().min(1).max(60).default(20),
	lineNumbers: z.boolean().default(true),
});
export type CodePresentation = z.infer<typeof codePresentationSchema>;
