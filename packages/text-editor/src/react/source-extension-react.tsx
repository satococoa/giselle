import { Node as GiselleNode } from "@giselle-sdk/data-type";
import {
	type NodeViewProps,
	NodeViewWrapper,
	ReactNodeViewRenderer,
} from "@tiptap/react";
import clsx from "clsx/lite";
import { useMemo } from "react";
import { SourceExtension } from "../extensions/source-extension";

function defaultName(node: GiselleNode) {
	switch (node.type) {
		case "action":
			switch (node.content.type) {
				case "textGeneration":
					return node.name ?? node.content.llm.model;
				case "github":
					return node.name ?? "GitHub";
				default: {
					const _exhaustiveCheck: never = node.content;
					throw new Error(`Unhandled action content type: ${_exhaustiveCheck}`);
				}
			}
		case "variable":
			return node.name ?? node.content.type;
		default: {
			const _exhaustiveCheck: never = node;
			throw new Error(`Unhandled node type: ${_exhaustiveCheck}`);
		}
	}
}

const Component = (props: NodeViewProps) => {
	const node = useMemo(
		() =>
			GiselleNode.array()
				.parse(props.editor.storage.Source.nodes)
				.find((node) => node.id === props.node.attrs.node.id),
		[props.editor, props.node.attrs.node],
	);

	const output = useMemo(
		() =>
			node?.outputs.find((output) => output.id === props.node.attrs.outputId),
		[node, props.node.attrs.outputId],
	);
	if (node === undefined || output === undefined) {
		return null;
	}

	return (
		<NodeViewWrapper className="inline">
			<span
				contentEditable={false}
				data-selected={props.selected}
				data-type={node.type}
				data-content-type={node.content.type}
				className={clsx(
					"rounded-[4px] px-[4px] py-[2px] border-[1px] transition-colors",
					"data-[content-type=textGeneration]:bg-primary-900/20 data-[content-type=textGeneration]:text-primary-900",
					"data-[content-type=github]:bg-primary-900/20 data-[content-type=github]:text-primary-900",
					"data-[content-type=text]:bg-node-plaintext-900/20 data-[content-type=text]:text-node-plaintext-900",
					"data-[content-type=file]:bg-node-data-900/20 data-[content-type=file]:text-node-data-900",
					"border-transparent data-[selected=true]:border-primary-900",
					"text-[12px] ",
				)}
			>
				{defaultName(node)} / {output?.label}
			</span>
		</NodeViewWrapper>
	);
};

interface SourceExtensionReactOptions {
	nodes: GiselleNode[];
}
interface SourceExtensionReactStorage {
	nodes: GiselleNode[];
}

export const SourceExtensionReact = SourceExtension.extend<
	SourceExtensionReactOptions,
	SourceExtensionReactStorage
>({
	addOptions() {
		return {
			nodes: [],
		};
	},

	addStorage() {
		return {
			nodes: [],
		};
	},

	onBeforeCreate() {
		this.storage.nodes = this.options.nodes;
	},

	onUpdate() {
		this.storage.nodes = this.options.nodes;
	},

	addNodeView() {
		return ReactNodeViewRenderer(Component);
	},
});
