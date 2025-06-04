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
import { getCurrentValue, updatePropertiesArray } from "../utils";
import { PropertyType } from "../types";

interface DynamicPropertiesProps {
  property: PropertyType;
  field: AnyFieldApi;
}

export function DynamicProperties({ property, field }: DynamicPropertiesProps) {
  return (
    <div className="space-y-2">
      {/* select */}
      {property.type === "select" && (
        <>
          <Label htmlFor={field.name} className="block">
            {property.name}{" "}
            {property.on_item_create_required && (
              <span className="text-red-500">*</span>
            )}
          </Label>
          <Select
            name={field.name}
            onValueChange={(value) => {
              updatePropertiesArray({
                // If "reset" is selected, clear the selection
                value: value === "reset" ? [] : value,
                property,
                field,
              });
            }}
            defaultValue={getCurrentValue(field, property.id)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder={`Select a ${property.name}`} />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {!property.on_item_create_required && (
                  <SelectItem value="reset">--</SelectItem>
                )}
                {property.options?.map((item, i) => (
                  <SelectItem key={i} value={item.id?.toString()}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          {property.on_item_create_required && (
            <FieldInfo field={field} propertyName={property.name} />
          )}
        </>
      )}

      {/* select_multi */}
      {property.type === "select_multi" && (
        <>
          <Label htmlFor={field.name} className="block">
            {property.name}{" "}
            {property.on_item_create_required && (
              <span className="text-red-500">*</span>
            )}
          </Label>
          <MultiSelect
            options={property.options.map(({ id, name: label, value }) => ({
              id,
              label,
              // Multiselect requires id as a value instead of the original value variable
              value: id?.toString() ?? "",
            }))}
            onValueChange={(value) => {
              updatePropertiesArray({
                value,
                property,
                field,
              });
            }}
            defaultValue={getCurrentValue(field, property.id)}
            placeholder={`Select ${property.name}`}
            variant="inverted"
            maxCount={3}
          />
          {property.on_item_create_required && (
            <FieldInfo field={field} propertyName={property.name} />
          )}
        </>
      )}

      {/* boolean */}
      {property.type === "boolean" && (
        <div className="flex flex-col gap-2">
          <Label htmlFor={field.name} className="block">
            {property.name}{" "}
            {property.on_item_create_required && (
              <span className="text-red-500">*</span>
            )}
          </Label>
          <Switch
            checked={
              getCurrentValue(field, property.id) !== undefined
                ? getCurrentValue(field, property.id)
                : false
            }
            onCheckedChange={(checked) =>
              updatePropertiesArray({
                value: checked,
                property,
                field,
              })
            }
          />
          {property.on_item_create_required && (
            <FieldInfo field={field} propertyName={property.name} />
          )}
        </div>
      )}

      {/* number */}
      {property.type === "number" && (
        <>
          <Label htmlFor={field.name}>
            {property.name}{" "}
            {property.on_item_create_required && (
              <span className="text-red-500">*</span>
            )}
          </Label>
          <Input
            type="number"
            id={field.name}
            value={
              getCurrentValue(field, property.id) !== undefined
                ? getCurrentValue(field, property.id).toString()
                : ""
            }
            onChange={(e) => {
              // Convert string to number for number inputs
              const numValue =
                e.target.value === "" ? "" : Number(e.target.value);
              updatePropertiesArray({
                value: numValue,
                property,
                field,
              });
            }}
          />
          {property.on_item_create_required && (
            <FieldInfo field={field} propertyName={property.name} />
          )}
        </>
      )}

      {/* checkbox */}
      {property.type === "checkbox" && (
        <div className="flex flex-col gap-2">
          <Label htmlFor={field.name}>
            {property.name}{" "}
            {property.on_item_create_required && (
              <span className="text-red-500">*</span>
            )}
          </Label>
          <div
            className={`flex gap-4 ${
              property.options.length > 3 ? "flex-col" : "flex-row"
            }`}
          >
            {property.options.map((item) => (
              <div key={item.id} className="flex items-center gap-2">
                <Checkbox
                  id={`${field.name}-${item.id}`}
                  checked={
                    Array.isArray(getCurrentValue(field, property.id)) &&
                    getCurrentValue(field, property.id)?.includes(
                      item.id.toString(),
                    )
                  }
                  onCheckedChange={(checked) => {
                    const currentValues = Array.isArray(
                      getCurrentValue(field, property.id),
                    )
                      ? [...getCurrentValue(field, property.id)]
                      : [];

                    if (checked) {
                      // Add the item.id if it's not already in the array
                      if (!currentValues.includes(item.id.toString())) {
                        updatePropertiesArray({
                          value: [...currentValues, item.id.toString()],
                          property,
                          field,
                        });
                      }
                    } else {
                      // Remove the item.id from the array
                      updatePropertiesArray({
                        value: currentValues.filter(
                          (id) => id !== item.id.toString(),
                        ),
                        property,
                        field,
                      });
                    }
                  }}
                />
                <Label htmlFor={`${field.name}-${item.id}`}>{item.name}</Label>
              </div>
            ))}
          </div>

          {property.on_item_create_required && (
            <FieldInfo field={field} propertyName={property.name} />
          )}
        </div>
      )}

      {/* radio */}
      {property.type === "radio" && (
        <div className="flex gap-4 flex-col">
          <Label htmlFor={field.name}>
            {property.name}{" "}
            {property.on_item_create_required && (
              <span className="text-red-500">*</span>
            )}
          </Label>
          <RadioGroup
            value={(getCurrentValue(field, property.id) || "").toString()}
            onValueChange={(val) =>
              updatePropertiesArray({
                value: val,
                property,
                field,
              })
            }
            className={`flex gap-4 ${
              property.options.length > 3 ? "flex-col" : "flex-row"
            }`}
          >
            {property.options.map((item) => (
              <div key={item.id} className="flex items-center gap-2">
                <RadioGroupItem
                  id={`${field.name}-${item.id}`}
                  value={item.id?.toString()}
                />
                <Label htmlFor={`${field.name}-${item.id}`}>{item.name}</Label>
              </div>
            ))}
          </RadioGroup>
          {property.on_item_create_required && (
            <FieldInfo field={field} propertyName={property.name} />
          )}
        </div>
      )}
      <FieldInfo field={field} />
    </div>
  );
}
