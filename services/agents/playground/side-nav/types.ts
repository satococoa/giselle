export const sideNavs = {
	overview: "overview",
	knowledges: "knowledges",
} as const;

export type SideNav = (typeof sideNavs)[keyof typeof sideNavs];
type OpenSideNavState = {
	open: true;
	active: SideNav;
};
type CloseSideNavState = {
	open: false;
};
export type SideNavState = OpenSideNavState | CloseSideNavState;
