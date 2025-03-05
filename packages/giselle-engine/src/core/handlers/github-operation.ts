import {
	type CompletedGeneration,
	type FailedGeneration,
	type FileData,
	type GitHubNode,
	type NodeId,
	QueuedGeneration,
	type RunningGeneration,
	isGitHubNode,
} from "@giselle-sdk/data-type";
import {
	Agent,
	type AvailableToolName,
	isAvailableToolName,
} from "@giselle-sdk/github-agent";
import { Octokit } from "@octokit/core";
import { type CoreMessage, appendResponseMessages } from "ai";
import { z } from "zod";
import { createHandler } from "../create-handler";
import {
	buildGenerationMessageForGithubOperation,
	filePath,
	getGeneration,
	getNodeGenerationIndexes,
	githubAppAuth,
	githubAppInstallationAuth,
	setGeneration,
	setGenerationIndex,
	setNodeGenerationIndex,
} from "../helpers";

const input = z.object({
	generation: QueuedGeneration,
});
export type Input = z.infer<typeof input>;

export const githubOperationHandler = createHandler(
	{
		input,
	},
	async ({ input, context }) => {
		const runningGeneration = {
			...input.generation,
			status: "running",
			messages: [],
			ququedAt: Date.now(),
			requestedAt: Date.now(),
			startedAt: Date.now(),
		} satisfies RunningGeneration;
		if (!isGitHubNode(runningGeneration.context.actionNode)) {
			throw new Error("Action node is not a GitHub node");
		}

		await Promise.all([
			setGeneration({
				storage: context.storage,
				generation: runningGeneration,
			}),
			setGenerationIndex({
				storage: context.storage,
				generationIndex: {
					id: runningGeneration.id,
					origin: runningGeneration.context.origin,
				},
			}),
			setNodeGenerationIndex({
				storage: context.storage,
				nodeId: runningGeneration.context.actionNode.id,
				origin: runningGeneration.context.origin,
				nodeGenerationIndex: {
					id: runningGeneration.id,
					nodeId: runningGeneration.context.actionNode.id,
					status: "running",
					createdAt: runningGeneration.createdAt,
					ququedAt: runningGeneration.ququedAt,
					requestedAt: runningGeneration.requestedAt,
					startedAt: runningGeneration.startedAt,
				},
			}),
		]);

		try {
			const githubContent = runningGeneration.context.actionNode.content;
			if (githubContent.type !== "github") {
				throw new Error("GitHub content is not of type 'github'");
			}

			async function fileResolver(file: FileData) {
				const blob = await context.storage.getItemRaw(
					filePath({
						...runningGeneration.context.origin,
						fileId: file.id,
						fileName: file.name,
					}),
				);
				return blob === undefined ? undefined : blob;
			}

			async function generationContentResolver(nodeId: NodeId) {
				const nodeGenerationIndexes = await getNodeGenerationIndexes({
					origin: runningGeneration.context.origin,
					storage: context.storage,
					nodeId,
				});
				if (!nodeGenerationIndexes || nodeGenerationIndexes.length === 0) {
					return undefined;
				}
				const latestGeneration = await getGeneration({
					generationId:
						nodeGenerationIndexes[nodeGenerationIndexes.length - 1].id,
					storage: context.storage,
				});
				if (latestGeneration?.status !== "completed") {
					return undefined;
				}
				const assistantMessages = latestGeneration.messages.filter(
					(m) => m.role === "assistant",
				);
				return assistantMessages.length === 0
					? undefined
					: assistantMessages[assistantMessages.length - 1].content;
			}

			const messages = await buildGenerationMessageForGithubOperation(
				runningGeneration.context.actionNode,
				runningGeneration.context.sourceNodes,
				fileResolver,
				generationContentResolver,
			);

			const operationResult = await executeGitHubOperation(
				messages,
				runningGeneration.context.actionNode,
			);
			let responseMessage: string;
			switch (operationResult.type) {
				case "success": {
					const { json, md } = operationResult;
					responseMessage = `## Markdown:
\`\`\`markdown
${md}
\`\`\`

## JSON:
\`\`\`json
${JSON.stringify(JSON.parse(json), null, 2)}
\`\`\`
`;
					break;
				}

				case "failure": {
					const { error, userFeedback } = operationResult;
					responseMessage = `## Error:\n${error}`;
					if (userFeedback) {
						responseMessage += `\n\n## Feedback:\n${userFeedback}`;
					}
					break;
				}

				default: {
					const exhaustiveCheck: never = operationResult;
					throw new Error("Invalid operation result");
				}
			}

			const responseMessages = appendResponseMessages({
				messages: [
					{
						id: "id",
						role: "user",
						content: "",
					},
				],
				responseMessages: [
					{
						id: "id",
						role: "assistant",
						content: responseMessage,
					},
				],
			});

			const completedGeneration = {
				...runningGeneration,
				status: "completed",
				completedAt: Date.now(),
				messages: responseMessages,
			} satisfies CompletedGeneration;

			await Promise.all([
				setGeneration({
					storage: context.storage,
					generation: completedGeneration,
				}),
				setNodeGenerationIndex({
					storage: context.storage,
					nodeId: runningGeneration.context.actionNode.id,
					origin: runningGeneration.context.origin,
					nodeGenerationIndex: {
						id: completedGeneration.id,
						nodeId: completedGeneration.context.actionNode.id,
						status: "completed",
						createdAt: completedGeneration.createdAt,
						ququedAt: completedGeneration.ququedAt,
						requestedAt: completedGeneration.requestedAt,
						startedAt: completedGeneration.startedAt,
						completedAt: completedGeneration.completedAt,
					},
				}),
			]);

			return {
				messages: completedGeneration.messages,
			};
		} catch (error: unknown) {
			const failedGeneration = {
				...runningGeneration,
				status: "failed",
				failedAt: Date.now(),
				error: {
					name: error instanceof Error ? error.name : "Error",
					message:
						error instanceof Error ? error.message : "GitHub operation failed",
					dump: error,
				},
			} satisfies FailedGeneration;

			await Promise.all([
				setGeneration({
					storage: context.storage,
					generation: failedGeneration,
				}),
				setNodeGenerationIndex({
					storage: context.storage,
					nodeId: runningGeneration.context.actionNode.id,
					origin: runningGeneration.context.origin,
					nodeGenerationIndex: {
						id: failedGeneration.id,
						nodeId: failedGeneration.context.actionNode.id,
						status: "failed",
						createdAt: failedGeneration.createdAt,
						ququedAt: failedGeneration.ququedAt,
						requestedAt: failedGeneration.requestedAt,
						startedAt: failedGeneration.startedAt,
						failedAt: failedGeneration.failedAt,
					},
				}),
			]);

			throw error;
		}
	},
);

type OperationResult =
	| {
			type: "success";
			json: string;
			md: string;
	  }
	| {
			type: "failure";
			error: string;
			userFeedback?: string;
	  };
/**
 * Execute GitHub operation and return the result
 */
async function executeGitHubOperation(
	messages: CoreMessage[],
	node: GitHubNode,
): Promise<OperationResult> {
	if (messages.length === 0) {
		throw new Error("Invalid input: messages must be a non-empty array.");
	}
	if (!Array.isArray(messages[0].content)) {
		throw new Error("Invalid input: messages[0].content must be an array.");
	}
	const promptText = messages[0].content.find(
		(it) => it.type === "text" && it.text !== undefined,
	);
	if (promptText === undefined || promptText.type !== "text") {
		throw new Error(
			"Invalid input: messages[0].content must contain a text message.",
		);
	}
	const prompt = promptText.text;
	const toolName = node.content.toolName;
	const agent = await createAgent(toolName);
	const result = await agent.execute(prompt);
	if (result.type === "failure") {
		return {
			type: "failure",
			error: result.error,
			userFeedback: result.userFeedback,
		};
	}

	return {
		type: "success",
		json: result.json,
		md: result.md,
	};
}

async function createAgent(toolName: string) {
	const isValidToolName = (name: string): name is AvailableToolName => {
		return isAvailableToolName(name);
	};

	if (!isValidToolName(toolName)) {
		throw new Error("Invalid tool name provided.");
	}
	const installation = await findInstallation();
	const installationAuth = await githubAppInstallationAuth(installation.id);
	return Agent.builder()
		.withToken(installationAuth.token)
		.withTools([toolName])
		.build();
}

async function findInstallation() {
	// FIXME: hardcoded for now
	const hardcodedInstalledAccount = "r06-sandbox-edge";

	const appAuth = await githubAppAuth();
	const appClient = new Octokit({
		auth: appAuth.token,
	});
	const installations = await appClient.request("GET /app/installations");
	const hardCodedInstallation = installations.data.find(
		(it) => it.account?.login === hardcodedInstalledAccount,
	);
	if (hardCodedInstallation === undefined) {
		throw new Error("Hardcoded installation not found");
	}
	return hardCodedInstallation;
}
