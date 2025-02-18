import clsx from "clsx/lite";
import type { SVGProps } from "react";

export function ViewIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
	return (
		<svg
			width="18"
			height="17"
			viewBox="0 0 18 17"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
			role="graphics-symbol"
			className={clsx("fill-current", className)}
			{...props}
		>
			<path d="M13.0428 14.882H2.30826V4.96563H15.301V7.37109C15.301 7.82109 15.6692 8.18927 16.1192 8.18927C16.5692 8.18927 16.9374 7.82109 16.9374 7.37109V1.13654C16.9374 0.686541 16.5692 0.318359 16.1192 0.318359H1.49008C1.04008 0.318359 0.671898 0.686541 0.671898 1.13654V3.82018C0.630989 3.91836 0.606445 4.02472 0.606445 4.14745C0.606445 4.27018 0.630989 4.36836 0.671898 4.47472V15.7002C0.671898 16.1502 1.04008 16.5184 1.49008 16.5184H13.0428C13.4928 16.5184 13.861 16.1502 13.861 15.7002C13.861 15.2502 13.4928 14.882 13.0428 14.882ZM15.301 1.95472V3.32927H2.30826V1.95472H15.301Z" />
			<path d="M17.1094 14.3011L14.4094 11.6011C14.2376 11.4293 14.0166 11.3557 13.7957 11.3638C14.1803 10.7911 14.4012 10.1038 14.4012 9.35929C14.4012 7.35474 12.773 5.72656 10.7685 5.72656C8.76392 5.72656 7.13574 7.35474 7.13574 9.35929C7.13574 11.3638 8.76392 12.992 10.7685 12.992C11.6194 12.992 12.3967 12.6893 13.0103 12.1902C13.0103 12.3947 13.0921 12.5911 13.2476 12.7466L15.9476 15.4466C16.1112 15.6102 16.3157 15.6838 16.5285 15.6838C16.7412 15.6838 16.9457 15.602 17.1094 15.4466C17.4285 15.1275 17.4285 14.612 17.1094 14.2929V14.3011ZM10.7685 11.3638C9.6721 11.3638 8.77211 10.472 8.77211 9.36747C8.77211 8.26293 9.66392 7.37111 10.7685 7.37111C11.873 7.37111 12.7648 8.26293 12.7648 9.36747C12.7648 10.472 11.873 11.3638 10.7685 11.3638Z" />
		</svg>
	);
}
