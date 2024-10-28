import {
	type Connection,
	type EdgeChange,
	type NodeChange,
	type OnNodeDrag,
	type OnSelectionChangeFunc,
	applyEdgeChanges,
	applyNodeChanges,
	useOnSelectionChange,
	useReactFlow,
} from "@xyflow/react";
import { type KeyboardEventHandler, useCallback, useEffect } from "react";
import type { ConnectorId } from "../connector/types";
import { setNodes } from "../giselle-node/actions";
import {
	type GiselleNodeId,
	assertGiselleNodeId,
	panelTabs,
} from "../giselle-node/types";
import {
	addConnector,
	removeSelectedNodesOrFeedback,
	selectNode,
	selectNodeAndSetPanelTab,
	updateNodesUI,
} from "../graph/actions";
import { useGraph } from "../graph/context";
import type { Graph } from "../graph/types";
import { removeConnector } from "../graph/v2/composition/remove-connector";
import { removeNode } from "../graph/v2/composition/remove-node";
import { setXyFlowEdges, setXyFlowNodes } from "../graph/v2/xy-flow";
import type { ReactFlowEdge, ReactFlowNode } from "./types";

export const useReactFlowNodeEventHandler = () => {
	const { state, dispatch } = useGraph();

	const handleNodesChange = useCallback(
		(changes: NodeChange<ReactFlowNode>[]) => {
			const nonRemovedChanges = changes.filter(
				(change) => change.type !== "remove",
			);
			if (nonRemovedChanges.length > 0) {
				dispatch(
					setXyFlowNodes({
						input: {
							xyFlowNodes: applyNodeChanges(
								nonRemovedChanges,
								state.graph.xyFlow.nodes,
							),
						},
					}),
				);
			}
			changes.map((change) => {
				if (change.type === "select") {
					dispatch(
						updateNodesUI({
							nodes: [
								{
									id: change.id as GiselleNodeId,
									ui: { selected: change.selected },
								},
							],
						}),
					);
				} else if (change.type === "remove") {
					dispatch(
						removeNode({
							input: {
								nodeId: change.id as GiselleNodeId,
							},
						}),
					);
				}
			});
		},
		[dispatch, state.graph.xyFlow.nodes],
	);
	return { handleNodesChange };
};

export function useReacrFlowEdgeEventHandler() {
	const { state, dispatch } = useGraph();

	const handleEdgesChange = useCallback(
		(changes: EdgeChange<ReactFlowEdge>[]) => {
			dispatch(
				setXyFlowEdges({
					input: {
						xyFlowEdges: applyEdgeChanges(changes, state.graph.xyFlow.edges),
					},
				}),
			);
			changes.map((change) => {
				if (change.type === "remove") {
					dispatch(
						removeConnector({
							input: {
								connectorId: change.id as ConnectorId,
							},
						}),
					);
				}
			});
		},
		[dispatch, state.graph.xyFlow.edges],
	);

	return { handleEdgesChange };
}

type GiselleConnection = {
	source: GiselleNodeId;
	sourceHandle: string | null;
	target: GiselleNodeId;
	targetHandle: string;
};
function assertConnection(
	connection: Connection,
): asserts connection is GiselleConnection {
	assertGiselleNodeId(connection.source);
	assertGiselleNodeId(connection.target);
}

export const useConnectionHandler = () => {
	const { state, dispatch } = useGraph();

	const handleConnect = useCallback(
		(connection: Connection) => {
			assertConnection(connection);
			const sourceNode = state.graph.nodes.find(
				(node) => node.id === connection.source,
			);
			const targetNode = state.graph.nodes.find(
				(node) => node.id === connection.target,
			);
			if (sourceNode == null || targetNode == null) {
				return;
			}
			dispatch(
				addConnector({
					sourceNode: {
						id: sourceNode.id,
						category: sourceNode.category,
						archetype: sourceNode.archetype,
					},
					targetNode: {
						id: targetNode.id,
						handle: connection.targetHandle,
						category: targetNode?.category,
						archetype: targetNode?.archetype,
					},
				}),
			);
		},
		[dispatch, state.graph.nodes],
	);

	return {
		handleConnect,
	};
};

export const useNodeEventHandler = () => {
	const { dispatch } = useGraph();

	const handleNodeDragStop = useCallback<OnNodeDrag<ReactFlowNode>>(
		(_event, _node, nodes) => {
			dispatch(
				updateNodesUI({
					nodes: nodes.map((node) => ({
						id: node.id as GiselleNodeId,
						ui: { position: node.position },
					})),
				}),
			);
		},
		[dispatch],
	);

	return {
		handleNodeDragStop,
	};
};

export function useKeyUpHandler() {
	const { dispatch } = useGraph();
	const handleKeyUp = useCallback<KeyboardEventHandler>(
		(event) => {
			switch (event.code) {
				case "Backspace": {
					const isInputElement =
						event.target instanceof HTMLInputElement ||
						event.target instanceof HTMLTextAreaElement;

					// Skip the following process if the focus is on the input element.
					if (isInputElement) {
						return;
					}
					dispatch(removeSelectedNodesOrFeedback());
					break;
				}
			}
		},
		[dispatch],
	);

	return {
		handleKeyUp,
	};
}
