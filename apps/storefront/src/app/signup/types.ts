export interface SignupFormData {
  fullname: string;
  gender: "male" | "female";
  city: number;
  username: string;
  email: string;
  password: string;
  privacy_policy: boolean;
  marketing_policy: boolean;
}

export interface SignupActionResponse {
  success: boolean;
  message: string;
  inputs?: SignupFormData;
  errors?: {
    [K in keyof SignupFormData]?: string[];
  };
}
