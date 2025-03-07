import { flag } from "flags/next";

function takeLocalEnv(localEnvironemntKey: string) {
	if (process.env.NODE_ENV !== "development") {
		return false;
	}
	if (
		process.env[localEnvironemntKey] === undefined ||
		process.env[localEnvironemntKey] === "false"
	) {
		return false;
	}
	return true;
}

export const debugFlag = flag<boolean>({
	key: "debug",
	async decide() {
		return takeLocalEnv("DEBUG_FLAG");
	},
	description: "Enable debug mode",
	defaultValue: false,
	options: [
		{ value: false, label: "disable" },
		{ value: true, label: "Enable" },
	],
});

export const viewFlag = flag<boolean>({
	key: "view",
	async decide() {
		return takeLocalEnv("VIEW_FLAG");
	},
	description: "Enable view mode",
	defaultValue: false,
	options: [
		{ value: false, label: "disable" },
		{ value: true, label: "Enable" },
	],
});

export const playgroundV2Flag = flag<boolean>({
	key: "playground-v2",
	async decide() {
		return takeLocalEnv("PLAYGROUND_V2_FLAG");
	},
	description: "Enable Playground V2",
	defaultValue: false,
	options: [
		{ value: false, label: "disable" },
		{ value: true, label: "Enable" },
	],
});

export const googleOauthFlag = flag<boolean>({
	key: "google-oauth",
	async decide() {
		if (
			process.env.GOOGLE_OAUTH_FLAG === undefined ||
			process.env.GOOGLE_OAUTH_FLAG === "false"
		) {
			return false;
		}
		return true;
	},
	description: "Enable Google OAuth",
	defaultValue: false,
	options: [
		{ value: false, label: "disable" },
		{ value: true, label: "Enable" },
	],
});

export const developerFlag = flag<boolean>({
	key: "developer",
	async decide() {
		return takeLocalEnv("DEVELOPER_FLAG");
	},
	description: "Enable Developer",
	defaultValue: false,
	options: [
		{ value: false, label: "disable" },
		{ value: true, label: "Enable" },
	],
});

export const settingsV2Flag = flag<boolean>({
	key: "settings-v2",
	async decide() {
		return takeLocalEnv("SETTINGS_V2_FLAG");
	},
	description: "Enable Settings V2",
	defaultValue: false,
	options: [
		{ value: false, label: "disable" },
		{ value: true, label: "Enable" },
	],
});

export const newUiFlag = flag<boolean>({
	key: "new-ui",
	async decide() {
		return takeLocalEnv("NEW_UI_FLAG");
	},
	description: "Enable New UI",
	defaultValue: false,
	options: [
		{ value: false, label: "disable" },
		{ value: true, label: "Enable" },
	],
});
