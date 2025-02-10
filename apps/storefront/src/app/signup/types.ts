export interface SignupFormData {
  username: string;
  email: string;
  password: string;
}

export interface SignupActionResponse {
  success: boolean;
  message: string;
  inputs?: SignupFormData;
  errors?: {
    [K in keyof SignupFormData]?: string[];
  };
}
