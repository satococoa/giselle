import { createIdGenerator } from "@/lib/utils/generate-id";
import {
	WorkflowData,
	generateInitialWorkflowData,
	workflowId,
} from "@/lib/workflow-data";
import { z } from "zod";
import { setGraphToStorage } from "../helpers/set-graph-to-storage";
import type { WorkflowEngineHandlerArgs } from "./types";

const workflowIdGenerator = createIdGenerator("wf");
export const Output = z.object({
	workflowData: WorkflowData,
});

export async function createWorkflow({ context }: WorkflowEngineHandlerArgs) {
	const id = workflowId.generate();
	const workflowData = generateInitialWorkflowData();
	await setGraphToStorage({
		storage: context.storage,
		workflowId: id,
		workflowData,
	});
	return Output.parse({ workflowData });
}
