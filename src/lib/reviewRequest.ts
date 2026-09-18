import { z } from "zod";
import { ReviewContextInputSchema } from "./schemas";
import { MAX_BASE64_LENGTH, MAX_ORDER_FILES } from "./uploadLimits";

export const ReviewRequestSchema = z.strictObject({
  files: z.array(z.strictObject({
    name: z.string().min(1).max(255),
    mime: z.string().min(1).max(100),
    dataBase64: z.string().max(MAX_BASE64_LENGTH),
  })).min(1).max(MAX_ORDER_FILES),
  // The launched flow is customer-only, including direct requests.
  perspective: z.literal("customer").default("customer"),
  context: ReviewContextInputSchema,
});

export type ReviewRequest = z.output<typeof ReviewRequestSchema>;
