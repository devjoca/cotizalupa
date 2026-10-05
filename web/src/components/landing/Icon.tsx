import type { ReactNode } from "react";

type IconName =
  | "alert"
  | "arrow-right"
  | "arrow-up-right"
  | "check"
  | "copy"
  | "question"
  | "upload";

interface IconProps {
  name: IconName;
  className?: string;
}

const paths: Record<IconName, ReactNode> = {
  alert: (
    <>
      <path d="M12 3.5 21 20H3L12 3.5Z" />
      <path d="M12 9v5M12 17.25v.1" />
    </>
  ),
  "arrow-right": <path d="M4 12h15M13 6l6 6-6 6" />,
  "arrow-up-right": <path d="M5 19 19 5M9 5h10v10" />,
  check: <path d="m5 12.5 4.2 4.2L19 7" />,
  copy: (
    <>
      <rect x="8" y="8" width="10" height="10" rx="1.5" />
      <path d="M6 15H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v1" />
    </>
  ),
  question: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.8 9.3a2.3 2.3 0 1 1 3.6 1.9c-.9.6-1.4 1-1.4 2.2M12 16.5v.1" />
    </>
  ),
  upload: (
    <>
      <path d="M12 16V4M7.5 8.5 12 4l4.5 4.5M5 15.5v3h14v-3" />
    </>
  ),
};

export function Icon({ name, className }: IconProps) {
  return (
    <svg
      className={`icon${className ? ` ${className}` : ""}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {paths[name]}
    </svg>
  );
}
