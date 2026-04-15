import { z } from "zod";

export const CompassDirectionSchema = z.enum(["safe", "growth", "bold", "wild"]);
export type CompassDirection = z.infer<typeof CompassDirectionSchema>;

export const CompassPickSchema = z.object({
  direction: CompassDirectionSchema,
  vaultSlug: z.string(),
  rationale: z.string().max(140),
});
export type CompassPick = z.infer<typeof CompassPickSchema>;

export const CompassResponseSchema = z.object({
  picks: z.array(CompassPickSchema).length(8),
  axes: z.object({ y: z.string(), x: z.string() }).optional(),
  generatedAt: z.string(),
});
export type CompassResponse = z.infer<typeof CompassResponseSchema>;

export const CompassRequestSchema = z.object({
  userAddress: z.string().optional(),
  asset: z.string().optional(),
});
export type CompassRequest = z.infer<typeof CompassRequestSchema>;
