import { useRef } from "react";
import { useScopedT } from "@/contexts/I18nContext";
import {
	type ArrowPoint,
	connectorPatch,
	connectorPath,
	connectorPoints,
} from "@/lib/ai-edition/annotations/connectors";
import type { AxcutAnnotationRegion } from "@/lib/ai-edition/schema";

export function ConnectorHandles({
	region,
	selected,
	onSelect,
	onChange,
	onCommit,
}: {
	region: AxcutAnnotationRegion;
	selected: boolean;
	onSelect: (id: string) => void;
	onChange: (id: string, patch: Partial<AxcutAnnotationRegion>) => void;
	onCommit: () => void;
}) {
	const t = useScopedT("settings");
	const root = useRef<HTMLDivElement>(null);
	const gesture = useRef<{
		kind: "tail" | "head" | "bend" | "move";
		start: ArrowPoint;
		points: ReturnType<typeof connectorPoints>;
		moved: boolean;
		original: AxcutAnnotationRegion;
	} | null>(null);
	const points = connectorPoints(region);
	const shape = region.figureData?.connector?.shape ?? "straight";
	const at = (e: { clientX: number; clientY: number }) => {
		const rect = root.current!.getBoundingClientRect();
		return {
			x: ((e.clientX - rect.left) / rect.width) * 100,
			y: ((e.clientY - rect.top) / rect.height) * 100,
		};
	};
	const begin = (e: React.PointerEvent, kind: "tail" | "head" | "bend" | "move") => {
		if (e.button !== 0) return;
		e.preventDefault();
		e.stopPropagation();
		onSelect(region.id);
		e.currentTarget.setPointerCapture(e.pointerId);
		gesture.current = { kind, start: at(e), points, moved: false, original: region };
	};
	return (
		<div
			ref={root}
			style={{
				position: "absolute",
				inset: 0,
				pointerEvents: "none",
				zIndex: region.zIndex + (selected ? 1100 : 0),
			}}
			onPointerMove={(e) => {
				const g = gesture.current;
				if (!g) return;
				const p = at(e);
				const next = { ...g.points };
				if (g.kind === "move") {
					for (const key of ["tail", "head", "bend"] as const)
						next[key] = {
							x: g.points[key].x + p.x - g.start.x,
							y: g.points[key].y + p.y - g.start.y,
						};
				} else
					next[g.kind] =
						g.kind === "bend" && shape === "elbow"
							? { x: p.x, y: (g.points.tail.y + g.points.head.y) / 2 }
							: p;
				g.moved = true;
				const patch = connectorPatch(next.tail, next.head, next.bend, shape);
				onChange(region.id, {
					...patch,
					figureData: {
						...patch.figureData,
						...region.figureData,
						connector: patch.figureData.connector,
						color: region.figureData!.color,
						strokeWidth: region.figureData!.strokeWidth,
					},
				});
			}}
			onPointerUp={() => {
				const g = gesture.current;
				gesture.current = null;
				if (g?.moved) onCommit();
			}}
			onPointerCancel={() => {
				const g = gesture.current;
				gesture.current = null;
				if (g?.moved) {
					onChange(region.id, {
						position: g.original.position,
						size: g.original.size,
						figureData: g.original.figureData,
					});
					onCommit();
				}
			}}
		>
			<svg
				width="100%"
				height="100%"
				viewBox="0 0 100 100"
				preserveAspectRatio="none"
				style={{ overflow: "visible" }}
				aria-hidden="true"
			>
				<path
					d={connectorPath({ shape, ...points })}
					fill="none"
					stroke="transparent"
					strokeWidth={14}
					vectorEffect="non-scaling-stroke"
					style={{ pointerEvents: "stroke", cursor: "move" }}
					onPointerDown={(e) => begin(e, "move")}
				/>
			</svg>
			{selected &&
				(["tail", "head", ...(shape !== "straight" ? ["bend"] : [])] as const).map((key) => {
					const p = points[key as keyof typeof points];
					return (
						<button
							key={key}
							type="button"
							aria-label={t(`annotation.connector${key[0].toUpperCase() + key.slice(1)}`)}
							style={{
								position: "absolute",
								left: `${p.x}%`,
								top: `${p.y}%`,
								transform: "translate(-50%,-50%)",
								width: 14,
								height: 14,
								padding: 0,
								border: "2px solid var(--accent)",
								borderRadius: key === "bend" ? 3 : "50%",
								background: "var(--surface-1)",
								pointerEvents: "auto",
								cursor: "crosshair",
								touchAction: "none",
							}}
							onPointerDown={(e) => begin(e, key as "tail" | "head" | "bend")}
							onKeyDown={(e) => {
								const delta: Record<string, ArrowPoint> = {
									ArrowLeft: { x: -1, y: 0 },
									ArrowRight: { x: 1, y: 0 },
									ArrowUp: { x: 0, y: -1 },
									ArrowDown: { x: 0, y: 1 },
								};
								if (!delta[e.key]) return;
								e.preventDefault();
								e.stopPropagation();
								const next = {
									...points,
									[key]: { x: p.x + delta[e.key].x, y: p.y + delta[e.key].y },
								};
								const patch = connectorPatch(next.tail, next.head, next.bend, shape);
								onChange(region.id, {
									...patch,
									figureData: {
										...region.figureData,
										...patch.figureData,
										color: region.figureData!.color,
										strokeWidth: region.figureData!.strokeWidth,
									},
								});
								onCommit();
							}}
						/>
					);
				})}
		</div>
	);
}
