import { Label } from "@workspace/ui/components/label";
import { Input } from "@workspace/ui/components/input";
import { Switch } from "@workspace/ui/components/switch";
import { Checkbox } from "@workspace/ui/components/checkbox";
import { MultiSelect } from "@workspace/ui/components/multi-select";
import {
  RadioGroup,
  RadioGroupItem,
} from "@workspace/ui/components/radio-group";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectItem,
} from "@workspace/ui/components/select";
import { FieldInfo } from "../../utils/field-info";
import { AnyFieldApi } from "@tanstack/react-form";
import { FilterType, getCurrentValue, updatePropertiesArray } from "../utils";

interface DynamicPropertiesProps {
  filter: FilterType;
  field: AnyFieldApi;
}

export function DynamicProperties({ filter, field }: DynamicPropertiesProps) {
  return (
    <div className="space-y-2">
      {/* select */}
      {filter.type === "select" && (
        <>
          <Label htmlFor={field.name} className="block">
            {filter.name}{" "}
            {filter.on_item_create_required && (
              <span className="text-red-500">*</span>
            )}
          </Label>
          <Select
            name={field.name}
            onValueChange={(value) => {
              updatePropertiesArray({
                // If "reset" is selected, clear the selection
                value: value === "reset" ? [] : value,
                filter,
                field,
              });
            }}
            defaultValue={getCurrentValue(field, filter.id)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder={`Select a ${filter.name}`} />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {!filter.on_item_create_required && (
                  <SelectItem value="reset">--</SelectItem>
                )}
                {filter.options?.map((item, i) => (
                  <SelectItem key={i} value={item.id?.toString()}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          {filter.on_item_create_required && (
            <FieldInfo field={field} filterName={filter.name} />
          )}
        </>
      )}

      {/* select_multi */}
      {filter.type === "select_multi" && (
        <>
          <Label htmlFor={field.name} className="block">
            {filter.name}{" "}
            {filter.on_item_create_required && (
              <span className="text-red-500">*</span>
            )}
          </Label>
          <MultiSelect
            options={filter.options.map(({ id, name: label, value }) => ({
              id,
              label,
              value: value?.toString() ?? "",
            }))}
            onValueChange={(value) =>
              updatePropertiesArray({
                value,
                filter,
                field,
              })
            }
            defaultValue={getCurrentValue(field, filter.id)}
            placeholder={`Select ${filter.name}`}
            variant="inverted"
            maxCount={3}
          />
          {filter.on_item_create_required && (
            <FieldInfo field={field} filterName={filter.name} />
          )}
        </>
      )}

      {/* boolean */}
      {filter.type === "boolean" && (
        <div className="flex flex-col gap-2">
          <Label htmlFor={field.name} className="block">
            {filter.name}{" "}
            {filter.on_item_create_required && (
              <span className="text-red-500">*</span>
            )}
          </Label>
          <Switch
            checked={
              getCurrentValue(field, filter.id) !== undefined
                ? getCurrentValue(field, filter.id)
                : false
            }
            onCheckedChange={(checked) =>
              updatePropertiesArray({
                value: checked,
                filter,
                field,
              })
            }
          />
          {filter.on_item_create_required && (
            <FieldInfo field={field} filterName={filter.name} />
          )}
        </div>
      )}

      {/* number */}
      {filter.type === "number" && (
        <>
          <Label htmlFor={field.name}>
            {filter.name}{" "}
            {filter.on_item_create_required && (
              <span className="text-red-500">*</span>
            )}
          </Label>
          <Input
            type="number"
            id={field.name}
            value={
              getCurrentValue(field, filter.id) !== undefined
                ? getCurrentValue(field, filter.id).toString()
                : ""
            }
            onChange={(e) => {
              // Convert string to number for number inputs
              const numValue =
                e.target.value === "" ? "" : Number(e.target.value);
              updatePropertiesArray({
                value: numValue,
                filter,
                field,
              });
            }}
          />
          {filter.on_item_create_required && (
            <FieldInfo field={field} filterName={filter.name} />
          )}
        </>
      )}

      {/* checkbox */}
      {filter.type === "checkbox" && (
        <div className="flex flex-col gap-2">
          <Label htmlFor={field.name}>
            {filter.name}{" "}
            {filter.on_item_create_required && (
              <span className="text-red-500">*</span>
            )}
          </Label>
          <div
            className={`flex gap-4 ${
              filter.options.length > 3 ? "flex-col" : "flex-row"
            }`}
          >
            {filter.options.map((item) => (
              <div key={item.id} className="flex items-center gap-2">
                <Checkbox
                  id={`${field.name}-${item.id}`}
                  checked={
                    Array.isArray(getCurrentValue(field, filter.id)) &&
                    getCurrentValue(field, filter.id)?.includes(
                      item.id.toString(),
                    )
                  }
                  onCheckedChange={(checked) => {
                    const currentValues = Array.isArray(
                      getCurrentValue(field, filter.id),
                    )
                      ? [...getCurrentValue(field, filter.id)]
                      : [];

                    if (checked) {
                      // Add the item.id if it's not already in the array
                      if (!currentValues.includes(item.id.toString())) {
                        updatePropertiesArray({
                          value: [...currentValues, item.id.toString()],
                          filter,
                          field,
                        });
                      }
                    } else {
                      // Remove the item.id from the array
                      updatePropertiesArray({
                        value: currentValues.filter(
                          (id) => id !== item.id.toString(),
                        ),
                        filter,
                        field,
                      });
                    }
                  }}
                />
                <Label htmlFor={`${field.name}-${item.id}`}>{item.name}</Label>
              </div>
            ))}
          </div>

          {filter.on_item_create_required && (
            <FieldInfo field={field} filterName={filter.name} />
          )}
        </div>
      )}

      {/* radio */}
      {filter.type === "radio" && (
        <div className="flex gap-4 flex-col">
          <Label htmlFor={field.name}>
            {filter.name}{" "}
            {filter.on_item_create_required && (
              <span className="text-red-500">*</span>
            )}
          </Label>
          <RadioGroup
            value={(getCurrentValue(field, filter.id) || "").toString()}
            onValueChange={(val) =>
              updatePropertiesArray({
                value: val,
                filter,
                field,
              })
            }
            className={`flex gap-4 ${
              filter.options.length > 3 ? "flex-col" : "flex-row"
            }`}
          >
            {filter.options.map((item) => (
              <div key={item.id} className="flex items-center gap-2">
                <RadioGroupItem
                  id={`${field.name}-${item.id}`}
                  value={item.id?.toString()}
                />
                <Label htmlFor={`${field.name}-${item.id}`}>{item.name}</Label>
              </div>
            ))}
          </RadioGroup>
          {filter.on_item_create_required && (
            <FieldInfo field={field} filterName={filter.name} />
          )}
        </div>
      )}
    </div>
  );
}
