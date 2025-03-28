import { useForm } from "@tanstack/react-form";

export default function ProfileInfoComponent() {
  const form = useForm({
    defaultValues: {
      fullname: "",
      username: "",
      email: "",
      province: "",
      city: "",
      state: "",
      address: "",
      phone: "",
      birthday: "",
      gender: "",
    },
    onSubmit: () => {},
  });

  return <div>Profile info form</div>;
}
