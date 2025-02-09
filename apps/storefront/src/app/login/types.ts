export interface LoginFormData {
  email: string;
  password: string;
}

export interface LoginActionResponse {
  success: boolean;
  message: string;
  inputs?: LoginFormData;
  errors?: {
    [K in keyof LoginFormData]?: string[];
  };
}
