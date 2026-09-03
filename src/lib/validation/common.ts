import { z } from "zod";

/** Reusable primitives. Every db helper validates its input with these. */

export const uuidSchema = z.string().uuid();

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Username must be at least 3 characters")
  .max(30, "Username must be at most 30 characters")
  .regex(/^[a-z0-9_]+$/, "Username may only contain lowercase letters, numbers and underscores");

export const paginationSchema = z.object({
  limit: z.number().int().min(1).max(50).default(20),
  offset: z.number().int().min(0).default(0),
});

export const cursorPageSchema = z.object({
  limit: z.number().int().min(1).max(50).default(20),
  /** ISO timestamp of the last item on the previous page. */
  cursor: z.string().datetime().nullish(),
});

export const searchQuerySchema = z.object({
  query: z.string().trim().min(1).max(80),
  limit: z.number().int().min(1).max(50).default(20),
  offset: z.number().int().min(0).default(0),
});

export type Pagination = z.infer<typeof paginationSchema>;
export type CursorPage = z.infer<typeof cursorPageSchema>;
export type SearchQuery = z.infer<typeof searchQuerySchema>;
