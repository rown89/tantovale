import { useForm } from "@tanstack/react-form";
import { Label } from "@workspace/ui/components/label";
import { Input } from "@workspace/ui/components/input";
import { FieldInfo } from "#components/forms/utils/field-info";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectItem,
} from "@workspace/ui/components/select";
import { CitySelector } from "#components/forms/commons/city-selector";

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

  return (
    <div className="flex flec-col w-full justify-center">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          form.handleSubmit();
        }}
      >
        <div className="space-y-4">
          <form.Field name="fullname">
            {(field) => {
              return (
                <div className="space-y-2">
                  <Label htmlFor={field.name} className="block">
                    Full name <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id={field.name}
                    name={field.name}
                    disabled={true}
                    value={
                      field.state.value !== undefined
                        ? field.state.value?.toString()
                        : ""
                    }
                  />
                </div>
              );
            }}
          </form.Field>

          <form.Field name="gender">
            {(field) => {
              return (
                <>
                  <Label htmlFor={field.name} className="block">
                    Gender <span className="text-red-500">*</span>
                  </Label>
                  <Select name={field.name} defaultValue={""}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={`Select your gender`} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="reset">--</SelectItem>
                        {["male", "female"]?.map((item, i) => (
                          <SelectItem key={i} value={item}>
                            {item}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </>
              );
            }}
          </form.Field>

          <form.Field name="city">
            {(field) => {
              return (
                <div className="space-y-2">
                  <Label htmlFor={field.name} className="block">
                    Item location <span className="text-red-500">*</span>
                  </Label>
                  <CitySelector
                    value={Number(field.state.value)}
                    onChange={field.setValue}
                    onBlur={field.handleBlur}
                    name={field.name}
                    isTouched={field.state.meta.isTouched}
                    hasErrors={field.state.meta.errors?.length > 0}
                    cities={cities}
                    isLoadingCities={isLoadingCities}
                    isSubmittingForm={isSubmittingForm}
                    onSearchChange={setSearchedCityName}
                    isCityPopoverOpen={isCityPopoverOpen}
                    setIsCityPopoverOpen={setIsCityPopoverOpen}
                  />
                  <FieldInfo field={field} />
                </div>
              );
            }}
          </form.Field>
        </div>
      </form>
    </div>
  );
}
