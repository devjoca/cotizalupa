import React from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";

import { getRouter } from "./router";
import "./styles.css";
import "./styles/landing.css";
import "./styles/legal.css";
import "./styles/report.css";
import "./styles/report-document.css";

const root = document.getElementById("app");
if (root) {
  const router = getRouter();
  // Load before rendering so the prerendered HTML stays on screen until the
  // client can paint the same page, instead of flashing an empty pending state.
  await router.load();
  // HeadContent manages head tags from here on; drop the prerendered copies.
  document.head.querySelectorAll("[data-prerender]").forEach((node) => node.remove());
  createRoot(root).render(<React.StrictMode><RouterProvider router={router} /></React.StrictMode>);
}
