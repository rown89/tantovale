import * as z from "zod";

const UserSchema = z.object({
  username: z.string().min(2).max(50).nonempty(),
  email: z.string().email("L'email non sembra essere valida").nonempty(),
  password: z
    .string()
    .min(8, "La password deve contenere almeno 8 caratteri")
    .max(100)
    .nonempty(),
});

const createUserSchema = UserSchema;

export { UserSchema, createUserSchema };
