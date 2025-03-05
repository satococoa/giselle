import type {
	GenerationId,
	GenerationOrigin,
	NodeId,
	QueuedGeneration,
	Workspace,
	WorkspaceId,
} from "@giselle-sdk/data-type";
import { getLanguageModelProviders } from "./configurations/get-language-model-providers";
import {
	cancelGeneration,
	generateText,
	getGeneration,
	getNodeGenerations,
} from "./generations";
import type { GiselleEngineConfig, GiselleEngineContext } from "./types";
import { createWorkspace, getWorkspace, updateWorkspace } from "./workspaces";
export * from "./types";

export function GiselleEngine(config: GiselleEngineConfig) {
	const context: GiselleEngineContext = {
		storage: config.storage,
		llmProviders: config.llmProviders ?? [],
	};
	return {
		createWorkspace: async () => {
			return await createWorkspace({ context });
		},
		getWorkspace: async (workspaceId: WorkspaceId) => {
			return await getWorkspace({ context, workspaceId });
		},
		updateWorkspace: async (workspace: Workspace) => {
			return await updateWorkspace({ context, workspace });
		},
		getLanguageModelProviders: async () => {
			return await getLanguageModelProviders({ context });
		},
		generateText: async (generation: QueuedGeneration) => {
			return await generateText({
				context,
				generation,
			});
		},
		getGeneration: async (generationId: GenerationId) => {
			return await getGeneration({ context, generationId });
		},
		getNodeGenerations: async (origin: GenerationOrigin, nodeId: NodeId) => {
			return await getNodeGenerations({ context, origin, nodeId });
		},
		cancelGeneration: async (generationId: GenerationId) => {
			return await cancelGeneration({ context, generationId });
		},
	};
}

export type GiselleEngine = ReturnType<typeof GiselleEngine>;
