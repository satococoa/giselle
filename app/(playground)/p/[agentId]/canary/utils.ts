import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { createId } from "@paralleldrive/cuid2";
import type { LanguageModelV1 } from "ai";
import { vercelBlobGraphFolder } from "./constants";
import type {
	ArtifactId,
	ConnectionId,
	File,
	FileId,
	Graph,
	GraphId,
	Node,
	NodeHandleId,
	NodeId,
	Text,
	TextGenerateActionContent,
	TextGeneration,
} from "./types";

export function createNodeId(): NodeId {
	return `nd_${createId()}`;
}
export function createArtifactId(): ArtifactId {
	return `artf_${createId()}`;
}

export function createGraphId(): GraphId {
	return `grph_${createId()}`;
}

export function createNodeHandleId(): NodeHandleId {
	return `ndh_${createId()}`;
}

export function createConnectionId(): ConnectionId {
	return `cnnc_${createId()}`;
}

export function createFileId(): FileId {
	return `fl_${createId()}`;
}

export function resolveLanguageModel(
	llm: TextGenerateActionContent["llm"],
): LanguageModelV1 {
	const [provider, model] = llm.split(":");
	if (provider === "openai") {
		return openai(model);
	}
	if (provider === "anthropic") {
		return anthropic(model);
	}
	throw new Error("Unsupported model provider");
}

export function isTextGeneration(node: Node): node is TextGeneration {
	return node.content.type === "textGeneration";
}

export function isText(node: Node): node is Text {
	return node.content.type === "text";
}

export function isFile(node: Node): node is File {
	return node.content.type === "file";
}

interface Element {
	type: string;
	element_id: string;
	text: string;
	metadata: {
		languages: string[];
		page_number: number;
		filename: string;
		filetype: string;
		parent_id?: string;
	};
}

/**
 * Check if the given object is an Unstructured Element.
 * Now, it's not check metadata field because it's not used in the function.
 */
function isElement(obj: unknown): obj is Element {
	return (
		typeof obj === "object" &&
		obj !== null &&
		typeof (obj as Element).type === "string" &&
		typeof (obj as Element).element_id === "string" &&
		typeof (obj as Element).text === "string"
		// typeof (obj as Element).metadata === "object" &&
		// (obj as Element).metadata !== null &&
		// Array.isArray((obj as Element).metadata.languages) &&
		// typeof (obj as Element).metadata.page_number === "number" &&
		// typeof (obj as Element).metadata.filename === "string" &&
		// typeof (obj as Element).metadata.filetype === "string" &&
		// (typeof (obj as Element).metadata.parent_id === "string" ||
		// 	(obj as Element).metadata.parent_id === undefined)
	);
}

export function elementsToMarkdown(elementLikes: unknown[]): string {
	let markdown = "";
	let currentTitle = "";

	for (const elementLike of elementLikes) {
		if (!isElement(elementLike)) {
			continue;
		}
		switch (elementLike.type) {
			case "Title": {
				const titleLevel = currentTitle ? "##" : "#";
				markdown += `${titleLevel} ${elementLike.text}\n\n`;
				currentTitle = elementLike.text;
				break;
			}
			case "Header":
				markdown += `### ${elementLike.text}\n\n`;
				break;
			case "NarrativeText":
			case "UncategorizedText":
				markdown += `${elementLike.text}\n\n`;
				break;
			default:
				// Handle other types if needed
				break;
		}
	}

	return markdown.trim();
}

export function pathJoin(...parts: string[]): string {
	const filteredParts = parts.filter((part) => part !== "");

	const processedParts = filteredParts.map((pathPart, index) => {
		let processed = pathPart;
		if (index > 0) {
			processed = processed.replace(/^\/+/, "");
		}
		if (index < filteredParts.length - 1) {
			processed = processed.replace(/\/+$/, "");
		}
		return processed;
	});

	return processedParts.join("/");
}

export function initGraph(): Graph {
	return {
		id: createGraphId(),
		nodes: [],
		connections: [],
		artifacts: [],
	};
}

export function buildGraphFolderPath(graphId: GraphId) {
	return pathJoin(vercelBlobGraphFolder, graphId);
}
export function buildGraphPath(graphId: GraphId) {
	return pathJoin(buildGraphFolderPath(graphId), "graph.json");
}

export function langfuseModel(llm: TextGenerateActionContent["llm"]) {
	const [_, model] = llm.split(":");
	return model;
}

/**
 * Formats a timestamp number into common English date string formats
 */
export const formatTimestamp = {
	/**
	 * Format: Nov 25, 2024 10:30:45 AM
	 */
	toLongDateTime: (timestamp: number): string => {
		return new Date(timestamp).toLocaleString("en-US", {
			year: "numeric",
			month: "short",
			day: "numeric",
			hour: "numeric",
			minute: "2-digit",
			second: "2-digit",
			hour12: true,
		});
	},

	/**
	 * Format: 11/25/2024 10:30 AM
	 */
	toShortDateTime: (timestamp: number): string => {
		return new Date(timestamp).toLocaleString("en-US", {
			year: "numeric",
			month: "numeric",
			day: "numeric",
			hour: "numeric",
			minute: "2-digit",
			hour12: true,
		});
	},

	/**
	 * Format: November 25, 2024
	 */
	toLongDate: (timestamp: number): string => {
		return new Date(timestamp).toLocaleDateString("en-US", {
			year: "numeric",
			month: "long",
			day: "numeric",
		});
	},

	/**
	 * Format: 11/25/2024
	 */
	toShortDate: (timestamp: number): string => {
		return new Date(timestamp).toLocaleDateString("en-US", {
			year: "numeric",
			month: "numeric",
			day: "numeric",
		});
	},

	/**
	 * Format: 10:30:45 AM
	 */
	toTime: (timestamp: number): string => {
		return new Date(timestamp).toLocaleTimeString("en-US", {
			hour: "numeric",
			minute: "2-digit",
			second: "2-digit",
			hour12: true,
		});
	},

	/**
	 * Format: ISO 8601 (2024-11-25T10:30:45Z)
	 * Useful for APIs and database storage
	 */
	toISO: (timestamp: number): string => {
		return new Date(timestamp).toISOString();
	},

	/**
	 * Returns relative time like "2 hours ago", "in 3 days", etc.
	 * Supports both past and future dates
	 */
	toRelativeTime: (timestamp: number): string => {
		const now = Date.now();
		const diff = timestamp - now;
		const absMs = Math.abs(diff);
		const isPast = diff < 0;

		// Time units in milliseconds
		const minute = 60 * 1000;
		const hour = 60 * minute;
		const day = 24 * hour;
		const week = 7 * day;
		const month = 30 * day;
		const year = 365 * day;

		// Helper function to format the time with proper pluralization
		const formatUnit = (value: number, unit: string): string => {
			const plural = value === 1 ? "" : "s";
			return isPast
				? `${value} ${unit}${plural} ago`
				: `in ${value} ${unit}${plural}`;
		};

		if (absMs < minute) {
			return isPast ? "just now" : "in a few seconds";
		}

		if (absMs < hour) {
			const mins = Math.floor(absMs / minute);
			return formatUnit(mins, "minute");
		}

		if (absMs < day) {
			const hrs = Math.floor(absMs / hour);
			return formatUnit(hrs, "hour");
		}

		if (absMs < week) {
			const days = Math.floor(absMs / day);
			return formatUnit(days, "day");
		}

		if (absMs < month) {
			const weeks = Math.floor(absMs / week);
			return formatUnit(weeks, "week");
		}

		if (absMs < year) {
			const months = Math.floor(absMs / month);
			return formatUnit(months, "month");
		}

		const years = Math.floor(absMs / year);
		return formatUnit(years, "year");
	},
};
