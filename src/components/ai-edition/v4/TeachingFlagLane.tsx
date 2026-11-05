import { Flag, Trash2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useScopedT } from "@/contexts/I18nContext";
import { useProjectStore } from "@/lib/ai-edition/store/projectStore";
import { editTeachingFlag } from "@/lib/ai-edition/store/teachingFlags";
import { formatSec } from "@/lib/ai-edition/timeline/format";
import { timelineFlags } from "@/lib/ai-edition/timeline/teachingFlags";
import styles from "./TeachingFlagLane.module.css";

export function TeachingFlagLane({
	total,
	onSeek,
	shortcut,
}: {
	total: number;
	onSeek: (time: number) => void;
	shortcut: string;
}) {
	const t = useScopedT("timeline");
	const document = useProjectStore((s) => s.document);
	const flags = document ? timelineFlags(document) : [];
	return (
		<div className={styles.lane} data-track-kind="flags" role="group" aria-label={t("flags.title")}>
			<span className={styles.caption}>
				{t("flags.title")}
				{!flags.length ? ` · ${t("flags.empty", { key: shortcut })}` : ""}
			</span>
			{flags.map((flag) => {
				const label = flag.label || t("flags.defaultLabel", { number: flag.number });
				return (
					<Popover key={`${flag.clipId}:${flag.id}`}>
						<PopoverTrigger asChild>
							<button
								type="button"
								className={styles.flag}
								style={{ left: `${(flag.timeSec / total) * 100}%` }}
								title={`${label} · ${formatSec(flag.timeSec)}`}
								aria-label={`${label} · ${formatSec(flag.timeSec)}`}
								onPointerDown={(e) => e.stopPropagation()}
								onClick={(e) => {
									e.stopPropagation();
									onSeek(flag.timeSec);
								}}
								onKeyDown={(e) => {
									if (["Delete", "Backspace"].includes(e.key)) {
										e.preventDefault();
										e.stopPropagation();
										void editTeachingFlag(flag.assetId, flag.id, null);
									}
									if (["Enter", " "].includes(e.key)) e.stopPropagation();
								}}
							>
								<Flag size={15} fill="currentColor" />
								<span className={styles.stem} />
							</button>
						</PopoverTrigger>
						<PopoverContent
							className={styles.editor}
							onKeyDown={(e) => e.stopPropagation()}
							onPointerDown={(e) => e.stopPropagation()}
						>
							<label>
								{t("flags.label")}
								<input
									aria-label={t("flags.label")}
									defaultValue={flag.label}
									placeholder={label}
									maxLength={200}
									onKeyDown={(e) => {
										if (e.key === "Enter") e.currentTarget.blur();
									}}
									onBlur={(e) => {
										if (e.target.value !== flag.label)
											void editTeachingFlag(flag.assetId, flag.id, e.target.value);
									}}
								/>
							</label>
							<span>{formatSec(flag.timeSec)}</span>
							<button
								type="button"
								onClick={() => void editTeachingFlag(flag.assetId, flag.id, null)}
							>
								<Trash2 size={14} />
								{t("flags.remove")}
							</button>
						</PopoverContent>
					</Popover>
				);
			})}
		</div>
	);
}
