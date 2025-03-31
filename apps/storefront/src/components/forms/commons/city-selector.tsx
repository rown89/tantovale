"use client";

import { useState } from "react";
import { Check, ChevronsUpDown, SearchIcon } from "lucide-react";

import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@workspace/ui/components/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@workspace/ui/components/command";
import { cn } from "@workspace/ui/lib/utils";

export interface City {
  id: number;
  name: string;
}

interface CitySelectorProps {
  value: number;
  onChange: (value: number) => void;
  onBlur?: () => void;
  name?: string;
  isTouched?: boolean;
  hasErrors?: boolean;
  cities: City[] | undefined;
  isLoadingCities: boolean;
  isSubmittingForm: boolean;
  onSearchChange: (searchTerm: string) => void;
  isCityPopoverOpen: boolean;
  setIsCityPopoverOpen: (isOpen: boolean) => void;
}

export function CitySelector({
  value,
  onChange,
  onBlur,
  name,
  isTouched,
  hasErrors,
  cities,
  isLoadingCities,
  isSubmittingForm,
  onSearchChange,
  isCityPopoverOpen,
  setIsCityPopoverOpen,
}: CitySelectorProps) {
  const [searchedCityName, setSearchedCityName] = useState("");

  return (
    <div className="space-y-2">
      <Popover open={isCityPopoverOpen} onOpenChange={setIsCityPopoverOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={isCityPopoverOpen}
            className="w-full justify-between"
          >
            {cities?.find((city) => city.id === value)?.name ?? "Location..."}
            <ChevronsUpDown className="opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="min-w-[300px] flex p-0">
          <Command>
            <div className="flex items-center gap-2 mx-2">
              <SearchIcon width={20} />
              <Input
                id={name}
                name={name}
                disabled={isSubmittingForm}
                onBlur={onBlur}
                onChange={(e) => {
                  setSearchedCityName(e.target.value);
                  onSearchChange(e.target.value);
                }}
                aria-invalid={isTouched && hasErrors ? "true" : "false"}
                className={`my-2 ${
                  isTouched && hasErrors ? "border-red-500" : ""
                }`}
                placeholder="Search a city name"
              />
            </div>
            {cities && cities?.length > 0 && (
              <CommandList>
                {!isLoadingCities &&
                  searchedCityName.length > 2 &&
                  !cities?.length && (
                    <CommandEmpty>No places found.</CommandEmpty>
                  )}
                <CommandGroup>
                  {cities?.map((city, i) => {
                    return (
                      <CommandItem
                        key={i}
                        value={city.id?.toString()}
                        className="hover:font-bold"
                        onSelect={(currentValue) => {
                          onChange(
                            currentValue === value.toString()
                              ? 0
                              : Number(currentValue),
                          );
                          setIsCityPopoverOpen(false);
                        }}
                      >
                        {city.name}
                        <Check
                          className={cn(
                            "ml-auto",
                            value === city.id ? "opacity-100" : "opacity-0",
                          )}
                        />
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </CommandList>
            )}
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
