import * as z from "zod";

const UserSchema = z.object({
  email: z.string().email("L'email non sembra essere valida").min(1),
  password: z
    .string()
    .min(8, "La password deve contenere almeno 8 caratteri")
    .max(100)
    .nonempty(),
});

const createUserSchema = UserSchema;

export { UserSchema, createUserSchema };
