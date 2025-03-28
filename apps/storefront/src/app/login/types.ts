import { User } from "#components/providers/AuthProvider";

export interface LoginFormData {
  email: string;
  password: string;
}

export interface LoginActionResponse {
  success: boolean;
  message: string;
  inputs?: LoginFormData;
  user?: User;
  errors?: {
    [K in keyof LoginFormData]?: string[];
  };
}
