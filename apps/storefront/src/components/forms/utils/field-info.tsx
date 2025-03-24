import { AnyFieldApi } from "@tanstack/react-form";

export function FieldInfo({
  field,
  filterName,
}: {
  field: AnyFieldApi;
  filterName?: string;
}) {
  return (
    <>
      {field.state.meta.errors.length ? (
        <em className="text-red-500">
          {filterName
            ? field.state.meta.errors.map((item) =>
                item.message.includes(filterName) ? item.message : null,
              )
            : field.state.meta.errors.map((err) => err.message).join(",")}
        </em>
      ) : null}
      {field.state.meta.isValidating ? "Validating..." : null}
    </>
  );
}
