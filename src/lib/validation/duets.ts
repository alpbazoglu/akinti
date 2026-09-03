import { z } from "zod";

import { uuidSchema } from "./common";

export const createDuetRequestSchema = z.object({
  waveId: uuidSchema,
  message: z.string().trim().max(500).nullable().default(null),
});

export const respondToDuetRequestSchema = z.object({
  requestId: uuidSchema,
  /** Only the recipient may accept or decline. */
  decision: z.enum(["accepted", "declined"]),
});

export const cancelDuetRequestSchema = z.object({ requestId: uuidSchema });

export type CreateDuetRequestInput = z.infer<typeof createDuetRequestSchema>;
export type RespondToDuetRequestInput = z.infer<typeof respondToDuetRequestSchema>;
export type CancelDuetRequestInput = z.infer<typeof cancelDuetRequestSchema>;
