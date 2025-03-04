import type { Octokit } from "@octokit/core";
import { z } from "zod";
import { defineTool } from "../tool-registry.js";

// Get file contents tool
export const getFileContentsTool = defineTool({
	name: "get_file_contents",
	description:
		"Gets the contents of a file or directory from a GitHub repository",
	purpose: "Retrieve file or directory contents from a GitHub repository",
	inputSchema: z.object({
		tool: z.literal("get_file_contents"),
		owner: z.string().describe("Repository owner"),
		repo: z.string().describe("Repository name"),
		path: z.string().describe("Path to the file or directory"),
		branch: z
			.string()
			.optional()
			.describe("Branch name (defaults to repository's default branch)"),
	}),
	execute: async (octokit: Octokit, input) => {
		const result = await octokit.request(
			"GET /repos/{owner}/{repo}/contents/{path}",
			{
				owner: input.owner,
				repo: input.repo,
				path: input.path,
				ref: input.branch,
			},
		);
		return result.data;
	},
	constraints: [
		"Files between 1-100 MB only support raw or object media types",
		"Files over 100 MB are not supported",
		"Binary files are base64 encoded",
		"Symlinks are dereferenced",
		"Directory listings are returned as arrays and limited to 1000 files",
		"Private repositories require authentication",
		"Download URLs for private repositories expire after 5 minutes",
		"Create/update and delete operations must be executed serially to avoid conflicts",
	],
});

// Get issue tool
export const getIssueTool = defineTool({
	name: "get_issue",
	description: "Gets details of a specific issue in a GitHub repository",
	purpose: "Retrieve detailed information about a specific issue",
	inputSchema: z.object({
		tool: z.literal("get_issue"),
		owner: z.string().describe("Repository owner"),
		repo: z.string().describe("Repository name"),
		issue_number: z.number().describe("Issue number"),
	}),
	execute: async (octokit: Octokit, input) => {
		const result = await octokit.request(
			"GET /repos/{owner}/{repo}/issues/{issue_number}",
			{
				owner: input.owner,
				repo: input.repo,
				issue_number: input.issue_number,
			},
		);
		return result.data;
	},
	constraints: [
		"Issue numbers are repository-specific",
		"Returns both issues and pull requests",
		"Requires read access to the repository",
		"Returns 404 if issue number doesn't exist",
		"Body supports markdown format",
	],
});

// List issues tool
export const listIssuesTool = defineTool({
	name: "list_issues",
	description: "Lists issues in a GitHub repository with filtering options",
	purpose: "Retrieve a list of issues from a repository with optional filters",
	inputSchema: z.object({
		tool: z.literal("list_issues"),
		owner: z.string().describe("Repository owner"),
		repo: z.string().describe("Repository name"),
		state: z.enum(["open", "closed", "all"]).optional().describe("Issue state"),
		labels: z.array(z.string()).optional().describe("List of label names"),
		assignee: z.string().optional().describe("GitHub username of assignee"),
		creator: z.string().optional().describe("GitHub username of issue creator"),
		mentioned: z
			.string()
			.optional()
			.describe("GitHub username mentioned in issues"),
		since: z
			.string()
			.optional()
			.describe("ISO 8601 timestamp to filter by updated date"),
		page: z.number().optional().describe("Page number of results"),
		per_page: z
			.number()
			.min(1)
			.max(100)
			.optional()
			.describe("Number of results per page"),
	}),
	execute: async (octokit: Octokit, input) => {
		const result = await octokit.request("GET /repos/{owner}/{repo}/issues", {
			owner: input.owner,
			repo: input.repo,
			state: input.state,
			labels: input.labels?.join(","),
			assignee: input.assignee,
			creator: input.creator,
			mentioned: input.mentioned,
			since: input.since,
			page: input.page,
			per_page: input.per_page,
		});
		return result.data;
	},
	constraints: [
		"Default state is 'open'",
		"Multiple labels are combined with AND logic",
		"Returns both issues and pull requests by default",
		"Maximum of 100 results per page",
		"Results are sorted by created date in descending order",
		"Since parameter filters by updated date",
		"Requires read access to the repository",
	],
});

// List commits tool
export const listCommitsTool = defineTool({
	name: "list_commits",
	description: "Gets list of commits of a branch in a GitHub repository",
	purpose: "Retrieve commit history of a repository branch",
	inputSchema: z.object({
		tool: z.literal("list_commits"),
		owner: z.string().describe("Repository owner"),
		repo: z.string().describe("Repository name"),
		sha: z
			.string()
			.optional()
			.describe("SHA or branch name to start listing commits from"),
		path: z
			.string()
			.optional()
			.describe("Only commits containing this file path will be returned"),
		author: z
			.string()
			.optional()
			.describe("GitHub username, name, or email of author"),
		since: z
			.string()
			.optional()
			.describe(
				"ISO 8601 timestamp - only commits after this date will be returned",
			),
		until: z
			.string()
			.optional()
			.describe(
				"ISO 8601 timestamp - only commits before this date will be returned",
			),
		page: z.number().optional().describe("Page number of results"),
		per_page: z
			.number()
			.min(1)
			.max(100)
			.optional()
			.describe("Number of results per page"),
	}),
	execute: async (octokit: Octokit, input) => {
		const result = await octokit.request("GET /repos/{owner}/{repo}/commits", {
			owner: input.owner,
			repo: input.repo,
			sha: input.sha,
			path: input.path,
			author: input.author,
			since: input.since,
			until: input.until,
			page: input.page,
			per_page: input.per_page,
		});
		return result.data;
	},
	constraints: [
		"SHA can be branch name, tag name, or commit SHA",
		"Path filters commits affecting specific file/directory",
		"Author can be GitHub username, name, or email",
		"Date filters use ISO 8601 format",
		"Maximum of 100 results per page",
		"Results are sorted by commit date in descending order",
		"Requires read access to the repository",
		"Dereferences git tags",
	],
});

// Get pull request diff tool
export const getPullRequestDiffTool = defineTool({
	name: "get_pull_request_diff",
	description: "Gets the diff content of a specific pull request",
	purpose:
		"Retrieve the changes (diff) made in a pull request in unified diff format",
	inputSchema: z.object({
		tool: z.literal("get_pull_request_diff"),
		owner: z.string().describe("Repository owner"),
		repo: z.string().describe("Repository name"),
		pull_number: z.number().describe("Pull request number"),
	}),
	execute: async (octokit: Octokit, input) => {
		const result = await octokit.request(
			"GET /repos/{owner}/{repo}/pulls/{pull_number}",
			{
				owner: input.owner,
				repo: input.repo,
				pull_number: input.pull_number,
				headers: {
					accept: "application/vnd.github.v3.diff",
				},
			},
		);
		// https://github.com/octokit/request.js/issues/463#issuecomment-1164800010
		return result.data as unknown as string;
	},
	constraints: [
		"Returns diff in unified diff format",
		"Shows file additions, deletions, and modifications",
		"Includes context lines around changes",
		"Shows file mode changes and renames",
		"Requires read access to the repository",
		"Returns 404 if pull request number doesn't exist",
		"Can handle large diffs",
		"Response includes both metadata and diff content",
		"Diff shows line-by-line changes with + and - markers",
		"Headers indicate binary file changes when applicable",
	],
});

// Get pull request tool
export const getPullRequestTool = defineTool({
	name: "get_pull_request",
	description: "Gets details of a specific pull request",
	purpose:
		"Retrieve detailed information about a pull request including its status",
	inputSchema: z.object({
		tool: z.literal("get_pull_request"),
		owner: z.string().describe("Repository owner"),
		repo: z.string().describe("Repository name"),
		pull_number: z.number().describe("Pull request number"),
	}),
	execute: async (octokit: Octokit, input) => {
		const result = await octokit.request(
			"GET /repos/{owner}/{repo}/pulls/{pull_number}",
			{
				owner: input.owner,
				repo: input.repo,
				pull_number: input.pull_number,
			},
		);
		return result.data;
	},
	constraints: [
		"Returns detailed pull request information",
		"Includes merge status and review status",
		"Returns 404 if pull request number doesn't exist",
		"Requires read access to the repository",
	],
});

// List pull requests tool
export const listPullRequestsTool = defineTool({
	name: "list_pull_requests",
	description: "Lists and filters pull requests in a repository",
	purpose: "Retrieve a filtered list of pull requests",
	inputSchema: z.object({
		tool: z.literal("list_pull_requests"),
		owner: z.string().describe("Repository owner"),
		repo: z.string().describe("Repository name"),
		state: z
			.enum(["open", "closed", "all"])
			.optional()
			.describe("Pull request state"),
		head: z.string().optional().describe("Filter by head user/org and branch"),
		base: z.string().optional().describe("Filter by base branch"),
		sort: z
			.enum(["created", "updated", "popularity", "long-running"])
			.optional()
			.describe("Sort field"),
		direction: z.enum(["asc", "desc"]).optional().describe("Sort direction"),
		per_page: z
			.number()
			.min(1)
			.max(100)
			.optional()
			.describe("Results per page"),
		page: z.number().optional().describe("Page number"),
	}),
	execute: async (octokit: Octokit, input) => {
		const result = await octokit.request("GET /repos/{owner}/{repo}/pulls", {
			owner: input.owner,
			repo: input.repo,
			state: input.state,
			head: input.head,
			base: input.base,
			sort: input.sort,
			direction: input.direction,
			per_page: input.per_page,
			page: input.page,
		});
		return result.data;
	},
	constraints: [
		"Default state is 'open'",
		"Maximum 100 results per page",
		"Sort defaults to 'created'",
		"Direction defaults to 'desc'",
	],
});

// Get pull request files tool
export const getPullRequestFilesTool = defineTool({
	name: "get_pull_request_files",
	description: "Gets the list of files changed in a pull request",
	purpose: "Retrieve details about files modified in a pull request",
	inputSchema: z.object({
		tool: z.literal("get_pull_request_files"),
		owner: z.string().describe("Repository owner"),
		repo: z.string().describe("Repository name"),
		pull_number: z.number().describe("Pull request number"),
	}),
	execute: async (octokit: Octokit, input) => {
		const result = await octokit.request(
			"GET /repos/{owner}/{repo}/pulls/{pull_number}/files",
			{
				owner: input.owner,
				repo: input.repo,
				pull_number: input.pull_number,
			},
		);
		return result.data;
	},
	constraints: [
		"Returns details about added, modified, and deleted files",
		"Includes file status and patch information",
		"Limited to 300 files per page",
	],
});

// Get pull request status tool
export const getPullRequestStatusTool = defineTool({
	name: "get_pull_request_status",
	description:
		"Gets the combined status of all status checks for a pull request",
	purpose: "Retrieve status check results for a pull request",
	inputSchema: z.object({
		tool: z.literal("get_pull_request_status"),
		owner: z.string().describe("Repository owner"),
		repo: z.string().describe("Repository name"),
		pull_number: z.number().describe("Pull request number"),
	}),
	execute: async (octokit: Octokit, input) => {
		const pr = await octokit.request(
			"GET /repos/{owner}/{repo}/pulls/{pull_number}",
			{
				owner: input.owner,
				repo: input.repo,
				pull_number: input.pull_number,
			},
		);
		const result = await octokit.request(
			"GET /repos/{owner}/{repo}/commits/{ref}/status",
			{
				owner: input.owner,
				repo: input.repo,
				ref: pr.data.head.sha,
			},
		);
		return result.data;
	},
	constraints: [
		"Returns combined status of all checks",
		"Includes individual check details",
		"Status can be success, failure, pending",
	],
});

// Get pull request comments tool
export const getPullRequestCommentsTool = defineTool({
	name: "get_pull_request_comments",
	description: "Gets the review comments on a pull request",
	purpose: "Retrieve review comments from a pull request",
	inputSchema: z.object({
		tool: z.literal("get_pull_request_comments"),
		owner: z.string().describe("Repository owner"),
		repo: z.string().describe("Repository name"),
		pull_number: z.number().describe("Pull request number"),
	}),
	execute: async (octokit: Octokit, input) => {
		const result = await octokit.request(
			"GET /repos/{owner}/{repo}/pulls/{pull_number}/comments",
			{
				owner: input.owner,
				repo: input.repo,
				pull_number: input.pull_number,
			},
		);
		return result.data;
	},
	constraints: [
		"Returns inline review comments",
		"Includes comment location in diff",
		"Comments are ordered by creation time",
	],
});

// Get pull request reviews tool
export const getPullRequestReviewsTool = defineTool({
	name: "get_pull_request_reviews",
	description: "Gets the reviews on a pull request",
	purpose: "Retrieve review information for a pull request",
	inputSchema: z.object({
		tool: z.literal("get_pull_request_reviews"),
		owner: z.string().describe("Repository owner"),
		repo: z.string().describe("Repository name"),
		pull_number: z.number().describe("Pull request number"),
	}),
	execute: async (octokit: Octokit, input) => {
		const result = await octokit.request(
			"GET /repos/{owner}/{repo}/pulls/{pull_number}/reviews",
			{
				owner: input.owner,
				repo: input.repo,
				pull_number: input.pull_number,
			},
		);
		return result.data;
	},
	constraints: [
		"Returns all reviews on the pull request",
		"Includes review state (APPROVED, CHANGES_REQUESTED, etc.)",
		"Reviews are ordered by submission time",
	],
});
