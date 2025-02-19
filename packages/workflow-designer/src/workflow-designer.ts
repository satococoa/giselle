import {
	ConnectionId,
	type FileId,
	type InputPort,
	type Node,
	type NodeBase,
	NodeId,
	NodeUIState,
	type OutputPort,
	type UploadedFileData,
	type Workspace,
	generateInitialWorkspace,
} from "@giselle-sdk/data-type";
import {
	callGetLLMProvidersApi,
	callRemoveFileApi,
	callSaveWorkspaceApi,
	callUploadFileApi,
} from "@giselle-sdk/giselle-engine/client";
import { getLLMProviders } from "@giselle-sdk/giselle-engine/schema";
import { buildWorkflowMap } from "@giselle-sdk/workflow-utils";

interface AddNodeOptions {
	ui?: NodeUIState;
}

export type WorkflowDesigner = ReturnType<typeof WorkflowDesigner>;

export function WorkflowDesigner({
	defaultValue = generateInitialWorkspace(),
	saveWorkflowApi = "/api/giselle/save-workspace",
	uploadFileApi = "/api/giselle/upload-file",
	removeFileApi = "/api/giselle/remove-file",
	getLLMProvidersApi = getLLMProviders.defaultApi,
}: {
	defaultValue?: Workspace;
	saveWorkflowApi?: string;
	uploadFileApi?: string;
	removeFileApi?: string;
	createOpenAiVectorStoreApi?: string;
	getLLMProvidersApi?: string;
	getNodeArtifactsApi?: string;
	getArtifactApi?: string;
}) {
	let nodes = defaultValue.nodes;
	let connections = defaultValue.connections;
	const ui = defaultValue.ui;
	let editingWorkflows = defaultValue.editingWorkflows;
	function updateWorkflowMap() {
		editingWorkflows = Array.from(
			buildWorkflowMap(
				new Map(nodes.map((node) => [node.id, node])),
				new Map(connections.map((connection) => [connection.id, connection])),
			).values(),
		);
	}
	function addNode(nodeData: Omit<Node, "id">, options?: AddNodeOptions) {
		const node = {
			id: NodeId.generate(),
			...nodeData,
		} as Node;
		nodes = [...nodes, node];
		if (options?.ui) {
			ui.nodeState[node.id] = options.ui;
		}
		updateWorkflowMap();
	}
	function getData() {
		return {
			id: defaultValue.id,
			nodes,
			connections,
			ui,
			editingWorkflows,
		} satisfies Workspace;
	}
	function updateNodeData<T extends Node>(node: T, data: Partial<T>) {
		nodes = [...nodes.filter((n) => n.id !== node.id), { ...node, ...data }];
		updateWorkflowMap();
	}
	function addConnection({
		input,
		output,
	}: {
		input: {
			node: NodeBase;
			port: InputPort;
		};
		output: {
			node: NodeBase;
			port: OutputPort;
		};
	}) {
		connections = [
			...connections,
			{
				id: ConnectionId.generate(),
				outputNodeId: output.node.id,
				outputNodeType: output.node.type,
				inputNodeId: input.node.id,
				inputNodeType: input.node.type,
				inputPortId: input.port.id,
			},
		];
	}
	function setUiNodeState(
		unsafeNodeId: string | NodeId,
		newUiState: Partial<NodeUIState>,
	): void {
		const inputNodeId = NodeId.parse(unsafeNodeId);
		const nodeState = ui.nodeState[inputNodeId];
		ui.nodeState[inputNodeId] = NodeUIState.parse({
			...nodeState,
			...newUiState,
		});
	}
	function deleteConnection(connectionId: ConnectionId) {
		connections = connections.filter(
			(connection) => connection.id !== connectionId,
		);
	}
	function deleteNode(unsafeNodeId: string | NodeId) {
		const deleteNodeId = NodeId.parse(unsafeNodeId);
		const deleteNode = nodes.find((node) => node.id === deleteNodeId);
		delete ui.nodeState[deleteNodeId];
		nodes = nodes.filter((node) => node.id !== deleteNodeId);
		updateWorkflowMap();
		return deleteNode;
	}
	async function uploadFile(file: File, fileId: FileId) {
		return await callUploadFileApi({
			api: uploadFileApi,
			workspaceId: defaultValue.id,
			file,
			fileId,
			fileName: file.name,
		});
	}
	async function removeFile(uploadedFile: UploadedFileData) {
		await callRemoveFileApi({
			api: removeFileApi,
			workspaceId: defaultValue.id,
			uploadedFile,
		});
	}
	async function saveWorkspace() {
		await callSaveWorkspaceApi({
			api: saveWorkflowApi,
			workspaceId: defaultValue.id,
			workspace: getData(),
		});
	}
	async function getAvailableLLMProviders() {
		const result = await callGetLLMProvidersApi({ api: getLLMProvidersApi });
		return result.llmProviders;
	}
	return {
		addNode,
		addConnection,
		getData,
		updateNodeData,
		setUiNodeState,
		deleteNode,
		deleteConnection,
		uploadFile,
		saveWorkspace,
		removeFile,
		getAvailableLLMProviders,
	};
}
