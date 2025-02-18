import { z } from "zod";

export const updateProfileSchema = z.object({
  fullname: z.string().min(2).max(100).optional(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
