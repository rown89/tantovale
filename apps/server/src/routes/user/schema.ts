import * as z from "zod";

const UserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(100),
  firstName: z.string().min(2).max(50),
  lastName: z.string().min(2).max(50),
});

const createUserSchema = UserSchema;

export default UserSchema;

export { createUserSchema };
