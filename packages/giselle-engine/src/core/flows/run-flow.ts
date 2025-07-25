import {
	type FailedGeneration,
	type GenerationContextInput,
	GenerationId,
	type Job,
	type QueuedGeneration,
	type RunId,
	type Workflow,
	type WorkspaceId,
} from "@giselle-sdk/data-type";
import { AISDKError } from "ai";
import { generateImage, generateText, setGeneration } from "../generations";
import { executeAction } from "../operations";
import { executeQuery } from "../operations/execute-query";
import type { GiselleEngineContext } from "../types";
import { patchRun } from "./patch-run";
import { resolveTrigger } from "./resolve-trigger";
import type { FlowRunId } from "./run/object";

export interface RunFlowCallbacks {
	jobStart?: (args: { job: Job }) => void | Promise<void>;
	jobFail?: (args: { job: Job }) => void | Promise<void>;
	jobComplete?: (args: { job: Job }) => void | Promise<void>;
	jobSkip?: (args: { job: Job }) => void | Promise<void>;
}

function createQueuedGeneration(args: {
	operation: Job["operations"][number];
	runId: RunId;
	workspaceId: WorkspaceId;
	triggerInputs?: GenerationContextInput[];
}) {
	const { operation, runId, workspaceId, triggerInputs } = args;
	return {
		id: GenerationId.generate(),
		context: {
			operationNode: operation.node,
			connections: operation.connections,
			sourceNodes: operation.sourceNodes,
			origin: { type: "run", id: runId, workspaceId },
			inputs:
				operation.node.content.type === "trigger" ? (triggerInputs ?? []) : [],
		},
		status: "queued",
		createdAt: Date.now(),
		queuedAt: Date.now(),
	} satisfies QueuedGeneration;
}

async function executeOperation(args: {
	context: GiselleEngineContext;
	generation: QueuedGeneration;
	node: Job["operations"][number]["node"];
	flowRunId: FlowRunId;
	useExperimentalStorage: boolean;
}): Promise<boolean> {
	const { context, generation, node, flowRunId, useExperimentalStorage } = args;
	switch (node.content.type) {
		case "action":
			await executeAction({ context, generation });
			return false;
		case "imageGeneration":
			await generateImage({ context, generation, useExperimentalStorage });
			return false;
		case "textGeneration": {
			let hadError = false;
			const result = await generateText({
				context,
				generation,
				useExperimentalStorage,
			});
			await result.consumeStream({
				onError: async (error) => {
					hadError = true;
					if (AISDKError.isInstance(error)) {
						const failedGeneration = {
							...generation,
							status: "failed",
							startedAt: Date.now(),
							failedAt: Date.now(),
							messages: [],
							error: {
								name: error.name,
								message: error.message,
							},
						} satisfies FailedGeneration;
						await Promise.all([
							setGeneration({
								context,
								generation: failedGeneration,
								useExperimentalStorage,
							}),
							patchRun({
								context,
								flowRunId,
								delta: {
									annotations: {
										push: [
											{
												level: "error",
												message: error.message,
											},
										],
									},
								},
							}),
						]);
					}
				},
			});
			return hadError;
		}
		case "trigger":
			await resolveTrigger({ context, generation });
			return false;
		case "query":
			await executeQuery({ context, generation });
			return false;
		default: {
			const _exhaustiveCheck: never = node.content;
			throw new Error(`Unhandled operation type: ${_exhaustiveCheck}`);
		}
	}
}

async function runJob(args: {
	job: Job;
	context: GiselleEngineContext;
	flowRunId: FlowRunId;
	runId: RunId;
	workspaceId: WorkspaceId;
	triggerInputs?: GenerationContextInput[];
	callbacks?: RunFlowCallbacks;
	useExperimentalStorage: boolean;
}): Promise<boolean> {
	const {
		job,
		context,
		flowRunId,
		runId,
		workspaceId,
		triggerInputs,
		callbacks,
		useExperimentalStorage,
	} = args;

	await callbacks?.jobStart?.({ job });
	await patchRun({
		context,
		flowRunId,
		delta: {
			"steps.inProgress": { increment: 1 },
			"steps.queued": { decrement: 1 },
		},
	});

	let hasJobError = false;

	const operationDurations = await Promise.all(
		job.operations.map(async (operation) => {
			const generation = createQueuedGeneration({
				operation,
				runId,
				workspaceId,
				triggerInputs,
			});

			const operationStart = Date.now();
			const errored = await executeOperation({
				context,
				generation,
				node: operation.node,
				flowRunId,
				useExperimentalStorage,
			});
			const duration = Date.now() - operationStart;

			if (errored) {
				hasJobError = true;
			}

			return duration;
		}),
	);

	const totalTaskDuration = operationDurations.reduce((sum, d) => sum + d, 0);

	if (hasJobError) {
		await Promise.all([
			callbacks?.jobFail?.({ job }),
			patchRun({
				context,
				flowRunId,
				delta: {
					"steps.inProgress": { decrement: 1 },
					"steps.failed": { increment: 1 },
					"duration.totalTask": { increment: totalTaskDuration },
				},
			}),
		]);
	} else {
		await Promise.all([
			callbacks?.jobComplete?.({ job }),
			patchRun({
				context,
				flowRunId,
				delta: {
					"steps.inProgress": { decrement: 1 },
					"steps.completed": { increment: 1 },
					"duration.totalTask": { increment: totalTaskDuration },
				},
			}),
		]);
	}

	return hasJobError;
}

export async function runFlow(args: {
	flow: Workflow;
	context: GiselleEngineContext;
	flowRunId: FlowRunId;
	runId: RunId;
	workspaceId: WorkspaceId;
	triggerInputs?: GenerationContextInput[];
	callbacks?: RunFlowCallbacks;
	useExperimentalStorage: boolean;
}) {
	const flowStart = Date.now();

	for (let i = 0; i < args.flow.jobs.length; i++) {
		const job = args.flow.jobs[i];
		const errored = await runJob({
			job,
			context: args.context,
			flowRunId: args.flowRunId,
			runId: args.runId,
			workspaceId: args.workspaceId,
			triggerInputs: args.triggerInputs,
			callbacks: args.callbacks,
			useExperimentalStorage: args.useExperimentalStorage,
		});

		if (errored) {
			// Skip remaining jobs
			for (let j = i + 1; j < args.flow.jobs.length; j++) {
				await args.callbacks?.jobSkip?.({ job: args.flow.jobs[j] });
			}

			await patchRun({
				context: args.context,
				flowRunId: args.flowRunId,
				delta: {
					status: { set: "failed" },
					"duration.wallClock": { set: Date.now() - flowStart },
				},
			});
			return;
		}
	}

	// All jobs completed successfully
	await patchRun({
		context: args.context,
		flowRunId: args.flowRunId,
		delta: {
			status: { set: "completed" },
			"duration.wallClock": { set: Date.now() - flowStart },
		},
	});
}
