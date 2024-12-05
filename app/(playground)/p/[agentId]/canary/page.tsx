import { agents, db } from "@/drizzle";
import { playgroundV2Flag } from "@/flags";
import { del, list } from "@vercel/blob";
import { ReactFlowProvider } from "@xyflow/react";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import type { AgentId } from "../beta-proto/types";
import { action, putGraph } from "./actions";
import { Editor } from "./components/editor";
import { AgentNameProvider } from "./contexts/agent-name";
import { ExecutionProvider } from "./contexts/execution";
import { GraphContextProvider } from "./contexts/graph";
import { MousePositionProvider } from "./contexts/mouse-position";
import { PropertiesPanelProvider } from "./contexts/properties-panel";
import { ToastProvider } from "./contexts/toast";
import { ToolbarContextProvider } from "./contexts/toolbar";
import type { ArtifactId, Graph, NodeId } from "./types";
import { buildGraphFolderPath } from "./utils";

// This page is experimental. it requires PlaygroundV2Flag to show this page
export default async function Page({
	params,
}: {
	params: Promise<{ agentId: AgentId }>;
}) {
	const [playgroundV2, { agentId }] = await Promise.all([
		playgroundV2Flag(),
		params,
	]);
	if (!playgroundV2) {
		return notFound();
	}
	const agent = await db.query.agents.findFirst({
		where: (agents, { eq }) => eq(agents.id, agentId),
	});
	// TODO: Remove graphUrl null check when add notNull constrain to graphUrl column
	if (agent === undefined || agent.graphUrl === null) {
		throw new Error("Agent not found");
	}
	// TODO: Add schema validation to verify parsed graph matches expected shape
	const graph = await fetch(agent.graphUrl).then(
		(res) => res.json() as unknown as Graph,
	);

	async function persistGraph(graph: Graph) {
		"use server";
		const { url } = await putGraph(graph);
		await db
			.update(agents)
			.set({
				graphUrl: url,
			})
			.where(eq(agents.id, agentId));
		const blobList = await list({
			prefix: buildGraphFolderPath(graph.id),
		});

		const oldBlobUrls = blobList.blobs
			.filter((blob) => blob.url !== url)
			.map((blob) => blob.url);
		if (oldBlobUrls.length > 0) {
			await del(oldBlobUrls);
		}
		return url;
	}

	async function updateAgentName(agentName: string) {
		"use server";
		await db
			.update(agents)
			.set({
				name: agentName,
			})
			.where(eq(agents.id, agentId));
		return agentName;
	}

	async function execute(
		artifactId: ArtifactId,
		graphUrl: string,
		nodeId: NodeId,
	) {
		"use server";
		return await action(artifactId, graphUrl, nodeId);
	}

	return (
		<GraphContextProvider
			defaultGraph={graph}
			onPersistAction={persistGraph}
			defaultGraphUrl={agent.graphUrl}
		>
			<PropertiesPanelProvider>
				<ReactFlowProvider>
					<ToolbarContextProvider>
						<MousePositionProvider>
							<ToastProvider>
								<AgentNameProvider
									defaultValue={agent.name ?? "Unnamed Agent"}
									updateAgentNameAction={updateAgentName}
								>
									<ExecutionProvider executeAction={execute}>
										<Editor />
									</ExecutionProvider>
								</AgentNameProvider>
							</ToastProvider>
						</MousePositionProvider>
					</ToolbarContextProvider>
				</ReactFlowProvider>
			</PropertiesPanelProvider>
		</GraphContextProvider>
	);
}
