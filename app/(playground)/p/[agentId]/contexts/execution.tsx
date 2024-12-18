"use client";

import { type StreamableValue, readStreamableValue } from "ai/rsc";
import {
	type ReactNode,
	createContext,
	useCallback,
	useContext,
	useState,
} from "react";
import {
	createArtifactId,
	createExecutionId,
	createExecutionSnapshotId,
	createJobExecutionId,
	createStepExecutionId,
	toErrorWithMessage,
} from "../lib/utils";
import type {
	Artifact,
	ArtifactId,
	CompletedExecution,
	CompletedJobExecution,
	CompletedStepExecution,
	Connection,
	Execution,
	ExecutionId,
	ExecutionSnapshot,
	FailedExecution,
	FailedJobExecution,
	FailedStepExecution,
	Flow,
	FlowId,
	JobExecution,
	Node,
	NodeId,
	SkippedJobExecution,
	StepExecution,
	StepId,
	TextArtifactObject,
} from "../types";
import { useGraph } from "./graph";
import { usePlaygroundMode } from "./playground-mode";
import { usePropertiesPanel } from "./properties-panel";
import { useToast } from "./toast";

export function createExecutionSnapshot({
	flow,
	execution,
	nodes,
	connections,
}: {
	flow: Flow;
	execution: Execution;
	nodes: Node[];
	connections: Connection[];
}) {
	return {
		id: createExecutionSnapshotId(),
		execution,
		nodes,
		connections,
		flow,
	} as ExecutionSnapshot;
}

function buildExecutionsFromSnapshot({
	executionSnapshot,
	forceRetryStepId,
}: { executionSnapshot: ExecutionSnapshot; forceRetryStepId?: StepId }) {
	function buildJobExecutionsFromSnapshot(): JobExecution[] {
		return executionSnapshot.execution.jobExecutions.map((jobExecution) => {
			const hasForceRetryStep = jobExecution.stepExecutions.some(
				(stepExecution) => stepExecution.stepId === forceRetryStepId,
			);
			if (hasForceRetryStep || jobExecution.status !== "completed") {
				return {
					...jobExecution,
					status: "pending",
					stepExecutions: jobExecution.stepExecutions.map((stepExecution) =>
						stepExecution.stepId === forceRetryStepId ||
						stepExecution.status !== "completed"
							? {
									...stepExecution,
									status: "pending",
								}
							: stepExecution,
					),
				};
			}
			return jobExecution;
		});
	}
	function buildArtifacts() {
		const retryStepNodeId = executionSnapshot.flow.jobs
			.flatMap((job) => job.steps)
			.find((step) => step.id === forceRetryStepId)?.nodeId;
		return executionSnapshot.execution.artifacts.filter(
			(artifact) => artifact.creatorNodeId !== retryStepNodeId,
		);
	}
	return {
		id: createExecutionId(),
		flowId: executionSnapshot.flow.id,
		status: "pending",
		artifacts: buildArtifacts(),
		jobExecutions: buildJobExecutionsFromSnapshot(),
	} as Execution;
}

// Helper functions for execution state management
const createInitialJobExecutions = (flow: Flow): JobExecution[] => {
	return flow.jobs.map((job) => ({
		id: createJobExecutionId(),
		jobId: job.id,
		status: "pending",
		stepExecutions: job.steps.map((step) => ({
			id: createStepExecutionId(),
			stepId: step.id,
			nodeId: step.nodeId,
			status: "pending",
		})),
	}));
};

const createInitialExecution = (
	flowId: FlowId,
	executionId: ExecutionId,
	jobExecutions: JobExecution[],
): Execution => ({
	id: executionId,
	status: "running",
	runStartedAt: Date.now(),
	flowId,
	jobExecutions,
	artifacts: [],
});

const processStreamContent = async (
	stream: StreamableValue<TextArtifactObject, unknown>,
	updateArtifact: (content: TextArtifactObject) => void,
): Promise<TextArtifactObject> => {
	let textArtifactObject: TextArtifactObject = {
		type: "text",
		title: "",
		content: "",
		messages: { plan: "", description: "" },
	};

	for await (const streamContent of readStreamableValue(stream)) {
		if (streamContent === undefined) continue;
		textArtifactObject = { ...textArtifactObject, ...streamContent };
		updateArtifact(textArtifactObject);
	}

	return textArtifactObject;
};

const executeStep = async (
	stepExecution: StepExecution,
	executeStepAction: (
		stepId: StepId,
	) => Promise<StreamableValue<TextArtifactObject, unknown>>,
	updateExecution: (
		updater: (prev: Execution | null) => Execution | null,
	) => void,
): Promise<CompletedStepExecution | FailedStepExecution> => {
	if (stepExecution.status === "completed") {
		return stepExecution;
	}
	const stepRunStartedAt = Date.now();
	const artifactId = createArtifactId();

	// Initialize step execution
	updateExecution((prev) => {
		if (!prev) return null;
		return {
			...prev,
			jobExecutions: prev.jobExecutions.map((prevJob) => ({
				...prevJob,
				stepExecutions: prevJob.stepExecutions.map((prevStep) =>
					prevStep.id === stepExecution.id
						? { ...prevStep, status: "running", runStartedAt: stepRunStartedAt }
						: prevStep,
				),
			})),
			artifacts: [
				...prev.artifacts,
				{
					id: artifactId,
					type: "streamArtifact",
					creatorNodeId: stepExecution.nodeId,
					object: {
						type: "text",
						title: "",
						content: "",
						messages: { plan: "", description: "" },
					},
				},
			],
		};
	});

	try {
		// Execute step and process stream
		const stream = await executeStepAction(stepExecution.stepId);
		const finalArtifact = await processStreamContent(stream, (content) => {
			updateExecution((prev) => {
				if (!prev || prev.status !== "running") return null;
				return {
					...prev,
					artifacts: prev.artifacts.map((artifact) =>
						artifact.id === artifactId
							? { ...artifact, object: content }
							: artifact,
					),
				};
			});
		});

		// Complete step execution
		const stepDurationMs = Date.now() - stepRunStartedAt;

		const successStepExecution: CompletedStepExecution = {
			...stepExecution,
			status: "completed",
			runStartedAt: stepRunStartedAt,
			durationMs: stepDurationMs,
		};
		updateExecution((prev) => {
			if (!prev || prev.status !== "running") return null;

			return {
				...prev,
				jobExecutions: prev.jobExecutions.map((job) => ({
					...job,
					stepExecutions: job.stepExecutions.map((step) =>
						step.id === stepExecution.id ? successStepExecution : step,
					),
				})),
				artifacts: prev.artifacts.map((artifact) =>
					artifact.id === artifactId
						? {
								id: artifactId,
								type: "generatedArtifact",
								creatorNodeId: stepExecution.nodeId,
								createdAt: Date.now(),
								object: finalArtifact,
							}
						: artifact,
				),
			};
		});

		return successStepExecution;
	} catch (unknownError) {
		const error = toErrorWithMessage(unknownError).message;
		const stepDurationMs = Date.now() - stepRunStartedAt;
		const failedStepExecution: FailedStepExecution = {
			...stepExecution,
			status: "failed",
			runStartedAt: stepRunStartedAt,
			durationMs: stepDurationMs,
			error,
		};
		updateExecution((prev) => {
			if (!prev || prev.status !== "running") return null;

			return {
				...prev,
				jobExecutions: prev.jobExecutions.map((job) => ({
					...job,
					stepExecutions: job.stepExecutions.map((step) =>
						step.id === stepExecution.id ? failedStepExecution : step,
					),
				})),
				artifacts: prev.artifacts.filter(
					(prevArtifact) => prevArtifact.creatorNodeId !== stepExecution.nodeId,
				),
			};
		});
		return failedStepExecution;
	}
};

const executeJob = async (
	jobExecution: JobExecution,
	executeStepAction: (
		stepId: StepId,
	) => Promise<StreamableValue<TextArtifactObject, unknown>>,
	updateExecution: (
		updater: (prev: Execution | null) => Execution | null,
	) => void,
): Promise<CompletedJobExecution | FailedJobExecution> => {
	const jobRunStartedAt = Date.now();

	// Start job execution
	updateExecution((prev) => {
		if (!prev) return null;
		return {
			...prev,
			jobExecutions: prev.jobExecutions.map((job) =>
				job.id === jobExecution.id
					? { ...job, status: "running", runStartedAt: jobRunStartedAt }
					: job,
			),
		};
	});

	// Execute all steps in parallel
	const stepExecutions = await Promise.all(
		jobExecution.stepExecutions.map((step) =>
			executeStep(step, executeStepAction, updateExecution),
		),
	);

	const jobDurationMs = stepExecutions.reduce(
		(sum, duration) => sum + duration.durationMs,
		0,
	);
	const allStepsCompleted = stepExecutions.every(
		(step) => step.status === "completed",
	);

	if (allStepsCompleted) {
		// Complete job execution
		const completedJobExecution: CompletedJobExecution = {
			...jobExecution,
			stepExecutions,
			status: "completed",
			runStartedAt: jobRunStartedAt,
			durationMs: jobDurationMs,
		};
		updateExecution((prev) => {
			if (!prev) return null;
			return {
				...prev,
				jobExecutions: prev.jobExecutions.map((job) =>
					job.id === jobExecution.id ? completedJobExecution : job,
				),
			};
		});
		return completedJobExecution;
	}

	const failedJobExecution: FailedJobExecution = {
		...jobExecution,
		stepExecutions,
		status: "failed",
		runStartedAt: jobRunStartedAt,
		durationMs: jobDurationMs,
	};
	updateExecution((prev) => {
		if (!prev) return null;
		return {
			...prev,
			jobExecutions: prev.jobExecutions.map((job) =>
				job.id === jobExecution.id ? failedJobExecution : job,
			),
		};
	});
	return failedJobExecution;
};

interface ExecutionContextType {
	execution: Execution | null;
	execute: (nodeId: NodeId) => Promise<void>;
	executeFlow: (flowId: FlowId) => Promise<void>;
	retryFlowExecution: (
		executionId: ExecutionId,
		forceRetryStepId?: StepId,
	) => Promise<void>;
}

const ExecutionContext = createContext<ExecutionContextType | undefined>(
	undefined,
);

type ExecuteStepAction = (
	flowId: FlowId,
	executionId: ExecutionId,
	stepId: StepId,
	artifacts: Artifact[],
) => Promise<StreamableValue<TextArtifactObject, unknown>>;

type RetryStepAction = (
	retryExecutionSnapshotUrl: string,
	executionId: ExecutionId,
	stepId: StepId,
	artifacts: Artifact[],
) => Promise<StreamableValue<TextArtifactObject, unknown>>;
interface ExecutionProviderProps {
	children: ReactNode;
	executeAction: (
		artifactId: ArtifactId,
		nodeId: NodeId,
	) => Promise<StreamableValue<TextArtifactObject, unknown>>;
	executeStepAction: ExecuteStepAction;
	putExecutionAction: (
		executionSnapshot: ExecutionSnapshot,
	) => Promise<{ blobUrl: string }>;
	retryStepAction: RetryStepAction;
}

export function ExecutionProvider({
	children,
	executeAction,
	executeStepAction,
	putExecutionAction,
	retryStepAction,
}: ExecutionProviderProps) {
	const { dispatch, flush, graph } = useGraph();
	const { setTab } = usePropertiesPanel();
	const { addToast } = useToast();
	const { setPlaygroundMode } = usePlaygroundMode();
	const [execution, setExecution] = useState<Execution | null>(null);

	const execute = useCallback(
		async (nodeId: NodeId) => {
			const artifactId = createArtifactId();
			dispatch({
				type: "upsertArtifact",
				input: {
					nodeId,
					artifact: {
						id: artifactId,
						type: "streamArtifact",
						creatorNodeId: nodeId,
						object: {
							type: "text",
							title: "",
							content: "",
							messages: {
								plan: "",
								description: "",
							},
						},
					},
				},
			});
			setTab("Result");
			await flush();
			try {
				const stream = await executeAction(artifactId, nodeId);

				let textArtifactObject: TextArtifactObject = {
					type: "text",
					title: "",
					content: "",
					messages: {
						plan: "",
						description: "",
					},
				};
				for await (const streamContent of readStreamableValue(stream)) {
					if (streamContent === undefined) {
						continue;
					}
					dispatch({
						type: "upsertArtifact",
						input: {
							nodeId,
							artifact: {
								id: artifactId,
								type: "streamArtifact",
								creatorNodeId: nodeId,
								object: streamContent,
							},
						},
					});
					textArtifactObject = {
						...textArtifactObject,
						...streamContent,
					};
				}
				dispatch({
					type: "upsertArtifact",
					input: {
						nodeId,
						artifact: {
							id: artifactId,
							type: "generatedArtifact",
							creatorNodeId: nodeId,
							createdAt: Date.now(),
							object: textArtifactObject,
						},
					},
				});
			} catch (error) {
				addToast({
					type: "error",
					title: "Execution failed",
					message: toErrorWithMessage(error).message,
				});
				dispatch({
					type: "upsertArtifact",
					input: {
						nodeId,
						artifact: null,
					},
				});
			}
		},
		[executeAction, dispatch, flush, setTab, addToast],
	);

	const executeFlow = useCallback(
		async (flowId: FlowId) => {
			const flow = graph.flows.find((flow) => flow.id === flowId);
			if (!flow) throw new Error("Flow not found");

			setPlaygroundMode("viewer");
			await flush();
			const executionId = createExecutionId();
			const jobExecutions = createInitialJobExecutions(flow);
			const flowRunStartedAt = Date.now();

			// Initialize flow execution
			let currentExecution = createInitialExecution(
				flowId,
				executionId,
				jobExecutions,
			);
			setExecution(currentExecution);

			let totalFlowDurationMs = 0;
			let hasFailed = false;

			// Execute jobs sequentially
			for (const jobExecution of jobExecutions) {
				if (hasFailed) {
					const skippedJob: SkippedJobExecution = {
						...jobExecution,
						status: "skipped",
						stepExecutions: jobExecution.stepExecutions.map((step) => ({
							...step,
							status: "skipped",
						})),
					};
					currentExecution = {
						...currentExecution,
						jobExecutions: currentExecution.jobExecutions.map((job) =>
							job.id === jobExecution.id ? skippedJob : job,
						),
					};
					setExecution(currentExecution);
					continue;
				}
				const executedJob = await executeJob(
					jobExecution,
					(stepExecutionId) =>
						executeStepAction(
							flowId,
							executionId,
							stepExecutionId,
							currentExecution.artifacts,
						),
					(updater) => {
						const updated = updater(currentExecution);
						if (updated) {
							currentExecution = updated;
							setExecution(updated);
						}
					},
				);
				totalFlowDurationMs += executedJob.durationMs;
				if (executedJob.status === "failed") {
					hasFailed = true;
				}
			}
			if (hasFailed) {
				const failedExecution: FailedExecution = {
					...currentExecution,
					status: "failed",
					runStartedAt: flowRunStartedAt,
					durationMs: totalFlowDurationMs,
				};
				currentExecution = failedExecution;
			} else {
				const completedExecution: CompletedExecution = {
					...currentExecution,
					status: "completed",
					runStartedAt: flowRunStartedAt,
					durationMs: totalFlowDurationMs,
					resultArtifact:
						currentExecution.artifacts[currentExecution.artifacts.length - 1],
				};
				currentExecution = completedExecution;
			}

			setExecution(currentExecution);
			const executionSnapshot = createExecutionSnapshot({
				flow,
				execution: currentExecution,
				nodes: graph.nodes,
				connections: graph.connections,
			});
			const { blobUrl } = await putExecutionAction(executionSnapshot);
			dispatch({
				type: "addExecutionIndex",
				input: {
					executionIndex: {
						executionId,
						blobUrl,
						completedAt: Date.now(),
					},
				},
			});
		},
		[
			setPlaygroundMode,
			executeStepAction,
			putExecutionAction,
			dispatch,
			flush,
			graph,
		],
	);

	const retryFlowExecution = useCallback(
		async (retryExecutionId: ExecutionId, forceRetryStepId?: StepId) => {
			const executionIndex = graph.executionIndexes.find(
				(executionIndex) => executionIndex.executionId === retryExecutionId,
			);
			if (executionIndex === undefined) {
				throw new Error("Execution not found");
			}
			const retryExecutionSnapshot = (await fetch(executionIndex.blobUrl).then(
				(res) => res.json(),
			)) as unknown as ExecutionSnapshot;

			await flush();
			const flowRunStartedAt = Date.now();
			let currentExecution = buildExecutionsFromSnapshot({
				executionSnapshot: retryExecutionSnapshot,
				forceRetryStepId,
			});
			currentExecution = {
				...currentExecution,
				status: "running",
				runStartedAt: flowRunStartedAt,
			};
			setExecution(currentExecution);

			let totalFlowDurationMs = 0;
			let hasFailed = false;

			// Execute jobs sequentially
			for (const jobExecution of currentExecution.jobExecutions) {
				if (hasFailed) {
					const skippedJob: SkippedJobExecution = {
						...jobExecution,
						status: "skipped",
						stepExecutions: jobExecution.stepExecutions.map((step) => ({
							...step,
							status: "skipped",
						})),
					};
					currentExecution = {
						...currentExecution,
						jobExecutions: currentExecution.jobExecutions.map((job) =>
							job.id === jobExecution.id ? skippedJob : job,
						),
					};
					setExecution(currentExecution);
					continue;
				}
				// if retrying, skip completed jobs
				if (jobExecution.status === "completed") {
					continue;
				}
				const executedJob = await executeJob(
					jobExecution,
					(stepId) =>
						retryStepAction(
							executionIndex.blobUrl,
							currentExecution.id,
							stepId,
							currentExecution.artifacts,
						),
					(updater) => {
						const updated = updater(currentExecution);
						if (updated) {
							currentExecution = updated;
							setExecution(updated);
						}
					},
				);
				totalFlowDurationMs += executedJob.durationMs;
				if (executedJob.status === "failed") {
					hasFailed = true;
				}
			}
			if (hasFailed) {
				const failedExecution: FailedExecution = {
					...currentExecution,
					status: "failed",
					durationMs: totalFlowDurationMs,
				};
				currentExecution = failedExecution;
			} else {
				const completedExecution: CompletedExecution = {
					...currentExecution,
					status: "completed",
					runStartedAt: flowRunStartedAt,
					durationMs: totalFlowDurationMs,
					resultArtifact:
						currentExecution.artifacts[currentExecution.artifacts.length - 1],
				};
				currentExecution = completedExecution;
			}

			setExecution(currentExecution);
			const executionSnapshot = createExecutionSnapshot({
				flow: retryExecutionSnapshot.flow,
				execution: currentExecution,
				nodes: retryExecutionSnapshot.nodes,
				connections: retryExecutionSnapshot.connections,
			});
			const { blobUrl } = await putExecutionAction(executionSnapshot);
			dispatch({
				type: "addExecutionIndex",
				input: {
					executionIndex: {
						executionId: currentExecution.id,
						blobUrl,
						completedAt: Date.now(),
					},
				},
			});
		},
		[
			graph.executionIndexes,
			dispatch,
			graph,
			flush,
			putExecutionAction,
			retryStepAction,
		],
	);

	return (
		<ExecutionContext.Provider
			value={{ execution, execute, executeFlow, retryFlowExecution }}
		>
			{children}
		</ExecutionContext.Provider>
	);
}

export function useExecution() {
	const context = useContext(ExecutionContext);
	if (!context) {
		throw new Error("useExecution must be used within an ExecutionProvider");
	}
	return context;
}
