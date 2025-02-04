import * as z from "zod";

const UserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(100),
});

const createUserSchema = UserSchema;

export { UserSchema };

export { createUserSchema };
