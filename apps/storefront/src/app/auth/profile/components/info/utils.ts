import { formOptions } from "@tanstack/react-form";

export const formOpts = formOptions({
  defaultValues: {
    fullname: "",
    username: "",
    email: "",
    address: "",
    phone: "",
    gender: "",
    city: 0,
  },
});
