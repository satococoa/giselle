import {
	integer,
	jsonb,
	pgTable,
	pgView,
	serial,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";

export const workspaces = pgTable(
	"workspaces",
	{
		id: serial("id").primaryKey(),
		slug: text("slug").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(workspaces) => {
		return {
			uniqueIdx: uniqueIndex("unique_idx").on(workspaces.slug),
		};
	},
);

export const nodes = pgTable("nodes", {
	id: serial("id").primaryKey(),
	workspaceId: integer("workspace_id")
		.notNull()
		.references(() => workspaces.id),
	type: text("type").notNull(),
	position: jsonb("position").$type<{ x: number; y: number }>().notNull(),
	createdAt: timestamp("created_at").defaultNow().notNull(),
});

type PortDirection = "input" | "output";
type PortType = "data" | "execution";
export const ports = pgTable("ports", {
	id: serial("id").primaryKey(),
	nodeId: integer("node_id")
		.notNull()
		.references(() => nodes.id),
	name: text("name").notNull(),
	direction: text("direction").$type<PortDirection>().notNull(),
	type: text("type").$type<PortType>().notNull(),
	order: integer("order").notNull(),
});

type EdgeType = "data" | "execution";
export const edges = pgTable("edges", {
	id: serial("id").primaryKey(),
	workspaceId: integer("workspace_id")
		.notNull()
		.references(() => workspaces.id),
	inputPortId: integer("input_port_id")
		.notNull()
		.references(() => ports.id),
	outputPortId: integer("output_port_id")
		.notNull()
		.references(() => ports.id),
	edgeType: text("edge_type").$type<EdgeType>().notNull(),
});

export const workflows = pgTable("workflows", {
	id: serial("id").primaryKey(),
	workspaceId: integer("workspace_id")
		.notNull()
		.references(() => workspaces.id),
	createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const steps = pgTable("steps", {
	id: serial("id").primaryKey(),
	workflowId: integer("workflow_id")
		.notNull()
		.references(() => workflows.id),
	nodeId: integer("node_id")
		.notNull()
		.references(() => nodes.id),
	order: integer("order").notNull(),
});

export const dataKnots = pgTable("data_knots", {
	id: serial("id").primaryKey(),
	stepId: integer("step_id").references(() => steps.id),
	portId: integer("port_id")
		.notNull()
		.references(() => ports.id),
});

export const dataRoutes = pgTable("data_routes", {
	id: serial("id").primaryKey(),
	originKnotId: integer("origin_knot_id")
		.notNull()
		.references(() => dataKnots.id),
	destinationKnotId: integer("destination_knot_id")
		.notNull()
		.references(() => dataKnots.id),
});

export type RunStatus = "creating" | "running" | "success" | "failed";
export const runs = pgTable("runs", {
	id: serial("id").primaryKey(),
	workflowId: integer("workflow_id")
		.notNull()
		.references(() => workflows.id),
	status: text("status").$type<RunStatus>().notNull(),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	startedAt: timestamp("started_at"),
	finishedAt: timestamp("finished_at"),
});

export type RunStepStatus = "idle" | "running" | "success" | "failed";
export const runSteps = pgTable("run_steps", {
	id: serial("id").primaryKey(),
	runId: integer("run_id")
		.notNull()
		.references(() => runs.id),
	stepId: integer("step_id")
		.notNull()
		.references(() => steps.id),
	status: text("status").$type<RunStepStatus>().notNull(),
	startedAt: timestamp("started_at"),
	finishedAt: timestamp("finished_at"),
});

export const runDataKnotMessages = pgTable("run_data_knot_messages", {
	id: serial("id").primaryKey(),
	runId: integer("run_id")
		.notNull()
		.references(() => runs.id),
	dataKnotId: integer("data_knot_id")
		.notNull()
		.references(() => dataKnots.id),
	message: jsonb("message").notNull(),
});

export const runTriggerRelations = pgTable("run_trigger_relations", {
	id: serial("id").primaryKey(),
	runId: integer("run_id")
		.notNull()
		.references(() => runs.id),
	triggerId: text("trigger_id").notNull(),
});

export const stepDataKnots = pgView("step_data_knots", {
	stepId: integer("step_id").notNull(),
	nodeId: integer("node_id").notNull(),
	portId: integer("port_id").notNull(),
	portName: text("port_name").notNull(),
	portDirection: text("port_direction").notNull(),
	dataKnotId: integer("data_knot_id").notNull(),
}).existing();

// Create `stepDataKnots` view
//
// CREATE OR REPLACE VIEW
//   "step_data_knots" AS
// SELECT
//   steps.id AS step_id,
//   steps.node_id AS node_id,
//   ports.id AS port_id,
//   ports.name AS port_name,
//   ports.direction as port_direction,
//   data_knots.id AS data_knot_id
// FROM
//   steps
//   INNER JOIN nodes ON nodes.id = steps.node_id
//   INNER JOIN ports ON ports.node_id = nodes.id
//   INNER JOIN data_knots ON data_knots.port_id = ports.id
//   AND data_knots.step_id = steps.id

export const stepStrands = pgView("step_strands", {
	stepId: integer("step_id").notNull(),
	nodeId: integer("node_id").notNull(),
	portName: text("port_name").notNull(),
	runId: integer("run_id").notNull(),
	message: jsonb("message").notNull(),
}).existing();

// Create `stepStrands` view
//
// CREATE OR REPLACE VIEW
//   "step_strands" AS
// SELECT
//   steps.id AS step_id,
//   steps.node_id AS node_id,
//   ports.name AS port_name,
//   run_data_knot_messages.run_id AS run_id,
//   run_data_knot_messages.message AS message
// FROM
//   steps
//   INNER JOIN nodes ON nodes.id = steps.node_id
//   INNER JOIN ports ON ports.node_id = nodes.id
//   INNER JOIN data_knots ON data_knots.port_id = ports.id
//   AND data_knots.step_id = steps.id
//   INNER JOIN data_routes ON data_routes.destination_knot_id = data_knots.id
//   INNER JOIN data_knots origin_data_knots ON origin_data_knots.id = data_routes.origin_knot_id
//   INNER JOIN run_data_knot_messages ON run_data_knot_messages.data_knot_id = origin_data_knots.id
