import {
	type EdgeWithPort,
	type NodeWithPort,
	db,
	findWorkspaceBySlug,
} from "@/drizzle/db";
import {
	dataKnots as dataKnotsSchema,
	dataRoutes,
	type nodes as nodesSchema,
	runSteps,
	runTriggerRelations,
	runs,
	steps as stepsSchema,
	workflows,
} from "@/drizzle/schema";
import { workflowTask } from "@/trigger/workflow";
import { asc, eq } from "drizzle-orm";
import invariant from "tiny-invariant";

type Step = typeof stepsSchema.$inferInsert;

const inferSteps = (nodes: NodeWithPort[], edges: EdgeWithPort[]) => {
	const steps: Omit<Step, "workflowId">[] = [];
	const visited = new Set<number>();
	const dfs = (nodeId: number, order: number) => {
		if (visited.has(nodeId)) return;
		visited.add(nodeId);

		const node = nodes.find((n) => n.id === nodeId);
		if (!node) return;

		steps.push({
			nodeId: node.id,
			order,
		});

		const outgoingEdges = edges.filter((e) => e.outputPort.nodeId === nodeId);
		for (const edge of outgoingEdges) {
			dfs(edge.inputPort.nodeId, order + 1);
		}
	};
	const targetNodeIds = new Set(edges.map((edge) => edge.inputPort.nodeId));
	const startNode = nodes.find((node) => !targetNodeIds.has(node.id));
	invariant(startNode != null, "Not found");
	dfs(startNode.id, 0);
	return steps;
};
export type ResponseJson = { id: number };
export const POST = async (
	req: Request,
	{ params }: { params: { slug: string } },
) => {
	const workspace = await findWorkspaceBySlug(params.slug);

	const insertedWorkflows = await db
		.insert(workflows)
		.values({
			workspaceId: workspace.id,
		})
		.returning({
			insertedId: workflows.id,
		});
	const inferedSteps = inferSteps(workspace.nodes, workspace.edges);
	const workflowId = insertedWorkflows[0].insertedId;
	const insertedSteps = await db
		.insert(stepsSchema)
		.values(inferedSteps.map((step) => ({ ...step, workflowId })))
		.returning({
			insertedId: stepsSchema.id,
		});
	const steps = await db.query.steps.findMany({
		where: eq(stepsSchema.workflowId, workflowId),
		orderBy: [asc(stepsSchema.order)],
	});

	const dataEdges = workspace.edges.filter(
		({ edgeType }) => edgeType === "data",
	);
	for (const dataEdge of dataEdges) {
		const inputStep = steps.find(
			(step) => step.nodeId === dataEdge.inputPort.nodeId,
		);
		const outputStep = steps.find(
			(step) => step.nodeId === dataEdge.outputPort.nodeId,
		);
		const [inputDataKnot, outputDataKnot] = await db
			.insert(dataKnotsSchema)
			.values([
				{ stepId: inputStep?.id, portId: dataEdge.inputPort.id },
				{ stepId: outputStep?.id, portId: dataEdge.outputPort.id },
			])
			.returning({
				insertedId: dataKnotsSchema.id,
			});
		await db.insert(dataRoutes).values({
			originKnotId: outputDataKnot.insertedId,
			destinationKnotId: inputDataKnot.insertedId,
		});
	}
	const insertedRun = await db
		.insert(runs)
		.values({
			workflowId,
			status: "running",
		})
		.returning({ insertedId: runs.id });
	const runId = insertedRun[0].insertedId;
	await db.insert(runSteps).values(
		insertedSteps.map<typeof runSteps.$inferInsert>((step) => ({
			runId,
			stepId: step.insertedId,
			status: "idle",
		})),
	);

	const handle = await workflowTask.trigger({
		runId,
		steps: steps.map((step) => {
			const node = workspace.nodes.find((n) => n.id === step.nodeId);
			invariant(node != null, "Not found node");
			return {
				...step,
				node,
			};
		}),
	});

	await db.insert(runTriggerRelations).values({
		runId,
		triggerId: handle.id,
	});

	return Response.json({ id: workflowId }, { status: 201 });
};
