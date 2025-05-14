import { AnyFieldApi } from "@tanstack/react-form";

export function FieldInfo({
  field,
  propertyName,
}: {
  field: AnyFieldApi;
  propertyName?: string;
}) {
  return (
    <>
      {field.state.meta.errors.length ? (
        <em className="text-red-500">
          {propertyName
            ? field.state.meta.errors.map((item) =>
                item.message.includes(propertyName) ? item.message : null,
              )
            : field.state.meta.errors.map((err) => err.message).join(",")}
        </em>
      ) : null}
      {field.state.meta.isValidating ? "Validating..." : null}
    </>
  );
}
