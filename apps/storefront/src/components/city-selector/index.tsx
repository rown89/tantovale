'use client';

import { useState } from 'react';
import { Check, ChevronsUpDown, SearchIcon } from 'lucide-react';

import { Button } from '@workspace/ui/components/button';
import { Input } from '@workspace/ui/components/input';
import { Popover, PopoverTrigger, PopoverContent } from '@workspace/ui/components/popover';
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from '@workspace/ui/components/command';
import { cn } from '@workspace/ui/lib/utils';
import { LocationTypes } from '@workspace/shared/hooks/use-locations-data';

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
	isDisabled?: boolean;
	hasErrors?: boolean;
	cities: LocationTypes[];
	isLoadingCities: boolean;
	isSubmittingForm: boolean;
	onSearchChange: (searchTerm: string) => void;
	defaultValue?: string;
	isCityPopoverOpen: boolean;
	setIsCityPopoverOpen: (isOpen: boolean) => void;
}

export function CitySelector({
	value,
	onChange,
	onBlur,
	name,
	isTouched,
	isDisabled,
	hasErrors,
	cities,
	isLoadingCities,
	isSubmittingForm,
	onSearchChange,
	defaultValue,
	isCityPopoverOpen,
	setIsCityPopoverOpen,
}: CitySelectorProps) {
	const [searchedCityName, setSearchedCityName] = useState('');

	return (
		<div className='space-y-2'>
			<Popover open={!isDisabled && isCityPopoverOpen} onOpenChange={setIsCityPopoverOpen}>
				<PopoverTrigger asChild>
					<Button
						variant='outline'
						role='combobox'
						aria-expanded={isCityPopoverOpen}
						disabled={isDisabled}
						className={`w-full justify-between`}>
						{cities?.find((city) => city.id === value)?.name ?? 'Location...'}
						<ChevronsUpDown className='opacity-50' />
					</Button>
				</PopoverTrigger>
				<PopoverContent align='start' className='flex min-w-[350px] p-0'>
					<Command>
						<div className='mx-4 my-2 flex items-center gap-2'>
							<SearchIcon width={20} />
							<Input
								id={name}
								name={name}
								defaultValue={defaultValue}
								disabled={isSubmittingForm || isDisabled}
								onBlur={onBlur}
								onChange={(e) => {
									setSearchedCityName(e.target.value);
									onSearchChange(e.target.value);
								}}
								aria-invalid={isTouched && hasErrors ? 'true' : 'false'}
								className={`my-2 ${isTouched && hasErrors ? 'border-red-500' : ''}`}
								placeholder='Search a city name'
							/>
						</div>
						{cities && cities?.length > 0 && (
							<CommandList>
								{!isLoadingCities && searchedCityName.length > 2 && !cities?.length && (
									<CommandEmpty>No places found.</CommandEmpty>
								)}
								<CommandGroup>
									{cities?.map((city, i) => {
										return (
											<CommandItem
												key={i}
												value={city.id?.toString()}
												className='hover:font-bold'
												onSelect={(currentValue) => {
													onChange(currentValue === value.toString() ? 0 : Number(currentValue));
													setIsCityPopoverOpen(false);
												}}>
												{city.name}
												<Check className={cn('ml-auto', value === city.id ? 'opacity-100' : 'opacity-0')} />
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
