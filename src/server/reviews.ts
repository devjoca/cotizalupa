import { createServerFn } from "@tanstack/react-start";
import { reviewsDisabled } from "./reviews.server";

export const getReviewsAvailability = createServerFn({ method: "GET" })
  .handler(() => ({ reviewsDisabled: reviewsDisabled() }));
