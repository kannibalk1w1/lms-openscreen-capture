import { useEffect, useRef, useState } from "react";
import { useScopedT } from "@/contexts/I18nContext";
import { type ArrowPoint, connectorPatch } from "@/lib/ai-edition/annotations/connectors";
import type { AxcutAnnotationRegion } from "@/lib/ai-edition/schema";
export function ArrowDrawingLayer({
	onDraw,
	onCancel,
}: {
	onDraw: (patch: Partial<AxcutAnnotationRegion>) => void;
	onCancel: () => void;
}) {
	const t = useScopedT("settings");
	const start = useRef<ArrowPoint | null>(null);
	const [end, setEnd] = useState<ArrowPoint | null>(null);
	useEffect(() => {
		const cancel = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				e.preventDefault();
				e.stopImmediatePropagation();
				onCancel();
			}
		};
		window.addEventListener("keydown", cancel, true);
		return () => window.removeEventListener("keydown", cancel, true);
	}, [onCancel]);
	const at = (e: React.PointerEvent<HTMLDivElement>) => {
		const r = e.currentTarget.getBoundingClientRect();
		return {
			x: Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100)),
			y: Math.max(0, Math.min(100, ((e.clientY - r.top) / r.height) * 100)),
		};
	};
	return (
		<div
			role="application"
			aria-label={t("annotation.drawArrowHint")}
			style={{
				position: "absolute",
				inset: 0,
				zIndex: 10000,
				cursor: "crosshair",
				touchAction: "none",
			}}
			onPointerDown={(e) => {
				if (e.button !== 0) return;
				e.preventDefault();
				e.stopPropagation();
				e.currentTarget.setPointerCapture(e.pointerId);
				start.current = at(e);
				setEnd(start.current);
			}}
			onPointerMove={(e) => {
				if (start.current) setEnd(at(e));
			}}
			onPointerCancel={() => {
				start.current = null;
				onCancel();
			}}
			onPointerUp={(e) => {
				const a = start.current;
				start.current = null;
				if (!a) return;
				const b = at(e);
				const rect = e.currentTarget.getBoundingClientRect();
				if (Math.hypot(((a.x - b.x) * rect.width) / 100, ((a.y - b.y) * rect.height) / 100) < 8) {
					setEnd(null);
					return;
				}
				onDraw({
					type: "figure",
					content: "",
					...connectorPatch(a, b, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, "straight"),
				});
			}}
		>
			{start.current && end && (
				<svg
					aria-hidden="true"
					width="100%"
					height="100%"
					viewBox="0 0 100 100"
					preserveAspectRatio="none"
				>
					<defs>
						<marker
							id="draft-arrow-head"
							markerWidth="8"
							markerHeight="8"
							refX="7"
							refY="4"
							orient="auto"
						>
							<path d="M0 0 L8 4 L0 8" fill="none" stroke="var(--accent)" />
						</marker>
					</defs>
					<path
						d={`M${start.current.x} ${start.current.y} L${end.x} ${end.y}`}
						stroke="var(--accent)"
						strokeWidth="2"
						vectorEffect="non-scaling-stroke"
						markerEnd="url(#draft-arrow-head)"
					/>
				</svg>
			)}
		</div>
	);
}
