import type { TelemetrySettings } from "ai";
import type { Chunk } from "../chunk-store/types";

export interface QueryResult<
	TMetadata extends Record<string, unknown> = Record<string, never>,
> {
	chunk: Chunk;
	similarity: number;
	metadata: TMetadata;
}

export interface QueryService<
	TContext,
	TMetadata extends Record<string, unknown> = Record<string, never>,
> {
	/**
	 * vector similarity search
	 * @param query search query
	 * @param context search context (filtering)
	 * @param limit maximum number of results
	 * @param telemetry telemetry settings (optional)
	 */
	search(
		query: string,
		context: TContext,
		limit?: number,
		telemetry?: TelemetrySettings,
	): Promise<QueryResult<TMetadata>[]>;
}
