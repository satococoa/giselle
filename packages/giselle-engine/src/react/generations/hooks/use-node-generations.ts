import {
	type Generation,
	GenerationOrigin,
	type NodeId,
} from "@giselle-sdk/data-type";
import { useCallback, useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { useFeatureFlag } from "../../feature-flags";
import { useGiselleEngine } from "../../use-giselle-engine";
import { useGenerationRunnerSystem } from "../contexts";

/**
 * Hook to fetch and manage node generations.
 * Uses object destructuring with nested destructuring in the parameters to avoid
 * reference equality issues that could cause infinite re-renders.
 * Provides generations filtered by nodeId and origin (id and type), sorted by creation time.
 */
export function useNodeGenerations({
	nodeId,
	origin: { id: originId, type: originType },
}: {
	nodeId: NodeId;
	origin: GenerationOrigin;
}) {
	const {
		generations: allGenerations,
		createGeneration,
		startGeneration,
		createAndStartGeneration,
		stopGeneration: stopGenerationSystem,
		setGenerations,
	} = useGenerationRunnerSystem();
	const client = useGiselleEngine();
	const { experimental_storage } = useFeatureFlag();
	/** @todo fetch on server */
	const { data, isLoading } = useSWR(
		() => {
			const origin = GenerationOrigin.parse({
				id: originId,
				type: originType,
			});
			return {
				api: "node-generations",
				origin,
				nodeId,
				useExperimentalStorage: experimental_storage,
			};
		},
		(args) => client.getNodeGenerations(args),
		{
			revalidateIfStale: false,
			revalidateOnFocus: false,
			revalidateOnReconnect: false,
		},
	);
	useEffect(() => {
		if (isLoading || data === undefined) {
			return;
		}
		const excludeCancelled = data.filter(
			(generation) => generation.status !== "cancelled",
		);
		setGenerations((prev) => {
			const filtered = prev.filter(
				(p) => !excludeCancelled.some((g) => g.id === p.id),
			);
			return [...filtered, ...excludeCancelled].sort(
				(a, b) => a.createdAt - b.createdAt,
			);
		});
	}, [isLoading, data, setGenerations]);

	const [currentGeneration, setCurrentGeneration] = useState<
		Generation | undefined
	>();

	const generations = useMemo(
		() =>
			allGenerations
				.filter(
					(generation) =>
						generation.context.operationNode.id === nodeId &&
						generation.context.origin.type === originType &&
						generation.context.origin.id === originId,
				)
				.sort(
					(a, b) =>
						new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
				),
		[allGenerations, nodeId, originId, originType],
	);

	useEffect(() => {
		if (generations.length === 0) {
			setCurrentGeneration(undefined);
		} else {
			// Since generations are sorted by creation time, the last one is the latest
			const latestGeneration = generations[generations.length - 1];
			setCurrentGeneration(latestGeneration);
		}
	}, [generations]);

	const isGenerating = useMemo(() => {
		const latestGeneration = generations[generations.length - 1];
		return (
			latestGeneration?.status === "running" ||
			latestGeneration?.status === "created" ||
			latestGeneration?.status === "queued"
		);
	}, [generations]);

	const stopGeneration = useCallback(() => {
		const latestGeneration = generations[generations.length - 1];
		if (latestGeneration !== undefined) {
			stopGenerationSystem(latestGeneration.id);
		}
	}, [generations, stopGenerationSystem]);

	return {
		generations,
		createGeneration,
		startGeneration,
		createAndStartGeneration,
		isGenerating,
		currentGeneration,
		stopGeneration,
	};
}
