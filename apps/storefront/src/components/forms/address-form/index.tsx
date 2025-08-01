import { useEffect } from 'react';
import { toast } from 'sonner';

import { Label } from '@workspace/ui/components/label';
import { Button } from '@workspace/ui/components/button';
import { useLocationData } from '@workspace/shared/hooks/use-locations-data';
import { Input } from '@workspace/ui/components/input';
import { ExtendedAddress } from '@workspace/server/extended_schemas';
import { Checkbox } from '@workspace/ui/components/checkbox';

import { CitySelector } from '#components/city-selector';
import useAddressForm from './use-address-form';
import { FieldInfo } from '../utils/field-info';

export default function AddressForm({
	firstAddress = false,
	mode,
	values,
	onComplete,
}: {
	firstAddress?: boolean;
	mode: 'add' | 'edit';
	// if address_id is 0, it means the address is new
	values?: ExtendedAddress;
	onComplete?: () => void;
}) {
	const {
		form,
		searchedCityName,
		searchedProvinceName,
		selectedCity,
		selectedProvince,
		isCityPopoverOpen,
		isProvincePopoverOpen,
		addAddressError,
		isAddingAddress,
		isUpdatingAddress,
		updateAddressError,
		setSearchedProvinceName,
		setSelectedProvince,
		setSelectedCity,
		setSearchedCityName,
		setIsCityPopoverOpen,
		setIsProvincePopoverOpen,
	} = useAddressForm(onComplete);

	const { provinces, isLoadingLocations: isLoadingProvinces } = useLocationData({
		locationType: 'province',
		locationName: searchedProvinceName,
	});
	const { cities, isLoadingLocations: isLoadingCities } = useLocationData({
		locationType: 'city',
		locationName: searchedCityName,
		locationCountryCode: 'IT',
		locationStateCode: provinces.find((province) => province.id === selectedProvince)?.state_code ?? undefined,
	});

	useEffect(() => {
		if (values && mode === 'edit') {
			form.setFieldValue('address_id', values.address_id);
			form.setFieldValue('label', values.label);
			form.setFieldValue('province_id', values.province_id);
			form.setFieldValue('city_id', values.city_id);
			form.setFieldValue('street_address', values.street_address);
			form.setFieldValue('civic_number', values.civic_number);
			form.setFieldValue('postal_code', values.postal_code);
			form.setFieldValue('country_code', values.country_code ?? 'IT');
			form.setFieldValue('phone', values.phone ?? '');
			form.setFieldValue('status', values.status ?? 'inactive');

			setSelectedCity(values.city_id);
			setSelectedProvince(values.province_id);
		}

		if (mode === 'add') {
			form.setFieldValue('mode', 'add');
		}

		if (firstAddress) {
			form.setFieldValue('status', 'active');
		}
	}, [values, mode]);

	// Sync form values with selected province and city
	useEffect(() => {
		if (selectedProvince > 0) {
			form.setFieldValue('province_id', selectedProvince);
		}
	}, [selectedProvince]);

	useEffect(() => {
		if (selectedCity > 0) {
			form.setFieldValue('city_id', selectedCity);
		}
	}, [selectedCity]);

	useEffect(() => {
		if (addAddressError) {
			toast.error(`Oops!`, {
				description: `Something went wrong, address not added correctly.\n ${addAddressError.message}`,
				duration: 8000,
			});
		}
	}, [addAddressError]);

	useEffect(() => {
		if (updateAddressError) {
			toast.error(`Oops!`, {
				description: `Something went wrong, address not updated correctly.\n ${updateAddressError.message}`,
				duration: 8000,
			});
		}
	}, [updateAddressError]);

	return (
		<div className='mb-4 flex flex-col gap-4'>
			<form
				onSubmit={(e) => {
					e.preventDefault();
					e.stopPropagation();
					form.handleSubmit();
				}}
				className='flex w-full flex-col justify-between space-y-4'>
				<form.Field name='label'>
					{(field) => {
						const { name, handleBlur, handleChange, state } = field;
						const { value } = state;

						return (
							<div className='space-y-2'>
								<Label htmlFor={field.name} className='block'>
									Label <span className='text-red-500'>*</span>
								</Label>
								<Input
									id={name}
									name={name}
									value={value}
									placeholder='Home'
									onChange={(e) => handleChange(e.target.value)}
									onBlur={handleBlur}
								/>
								<FieldInfo field={field} />
							</div>
						);
					}}
				</form.Field>

				<form.Field name='province_id'>
					{(field) => {
						const { name, handleBlur, setValue, state } = field;
						const { meta, value } = state;
						const { isTouched, errors } = meta;

						return (
							<div className='space-y-2'>
								<Label htmlFor={field.name} className='block'>
									Province <span className='text-red-500'>*</span>
								</Label>
								<CitySelector
									value={Number(value)}
									onChange={(newValue) => {
										setValue(newValue);
										setSelectedProvince(newValue);

										setSelectedCity(0);
										form.setFieldValue('city_id', 0);
									}}
									onBlur={handleBlur}
									name={name}
									isTouched={isTouched}
									hasErrors={errors?.length > 0}
									cities={
										provinces.length > 0
											? provinces
											: [
													{
														id: values?.province_id,
														name: values?.province_name,
														country_code: values?.province_country_code,
													},
												]
									}
									isLoadingCities={isLoadingProvinces}
									isSubmittingForm={form.state.isSubmitting}
									onSearchChange={setSearchedProvinceName}
									isCityPopoverOpen={isProvincePopoverOpen}
									setIsCityPopoverOpen={setIsProvincePopoverOpen}
								/>
								<FieldInfo field={field} />
							</div>
						);
					}}
				</form.Field>

				<form.Field name='city_id'>
					{(field) => {
						const { name, handleBlur, setValue, state } = field;
						const { meta, value } = state;
						const { isTouched, errors } = meta;

						return (
							<div className='space-y-2'>
								<Label
									htmlFor={field.name}
									className={`block ${form.state.isSubmitting || !selectedProvince ? 'opacity-50' : ''}`}>
									City <span className='text-red-500'>*</span>
								</Label>
								{form.state.isSubmitting ||
									(!selectedProvince && <span className='py-2'>Select a province first</span>)}
								<CitySelector
									value={Number(value)}
									onChange={setValue}
									onBlur={handleBlur}
									name={name}
									isDisabled={form.state.isSubmitting || !selectedProvince}
									isTouched={isTouched}
									hasErrors={errors?.length > 0}
									cities={
										cities.length > 0
											? cities
											: selectedCity
												? [
														{
															id: values?.city_id,
															name: values?.city_name,
															country_code: values?.city_country_code,
														},
													]
												: []
									}
									isLoadingCities={isLoadingCities}
									isSubmittingForm={form.state.isSubmitting}
									onSearchChange={setSearchedCityName}
									isCityPopoverOpen={isCityPopoverOpen}
									setIsCityPopoverOpen={setIsCityPopoverOpen}
								/>
								<FieldInfo field={field} />
							</div>
						);
					}}
				</form.Field>

				<form.Field name='street_address'>
					{(field) => {
						const { name, handleBlur, handleChange, state } = field;
						const { value } = state;

						return (
							<div className='space-y-2'>
								<Label htmlFor={field.name} className='block'>
									Street address <span className='text-red-500'>*</span>
									<p className='text-muted-foreground text-sm'>Please exclude the civic number from this field.</p>
								</Label>
								<Input
									id={name}
									name={name}
									value={value}
									placeholder='Via Roma'
									onChange={(e) => handleChange(e.target.value)}
									onBlur={handleBlur}
								/>
								<FieldInfo field={field} />
							</div>
						);
					}}
				</form.Field>

				<form.Field name='civic_number'>
					{(field) => {
						const { name, handleBlur, handleChange, state } = field;
						const { value } = state;

						return (
							<div className='space-y-2'>
								<Label htmlFor={field.name} className='block'>
									Civic number <span className='text-red-500'>*</span>
								</Label>
								<Input
									id={name}
									name={name}
									value={value}
									placeholder='12b'
									onChange={(e) => handleChange(e.target.value)}
									onBlur={handleBlur}
								/>
								<FieldInfo field={field} />
							</div>
						);
					}}
				</form.Field>

				<form.Field name='postal_code'>
					{(field) => {
						const { name, handleBlur, handleChange, state } = field;
						const { value } = state;

						return (
							<div className='space-y-2'>
								<Label htmlFor={field.name} className='block'>
									Postal code <span className='text-red-500'>*</span>
								</Label>
								<Input
									id={name}
									name={name}
									value={value}
									type='number'
									placeholder='12345'
									onChange={(e) => handleChange(e.target.valueAsNumber)}
									onBlur={handleBlur}
								/>
								<FieldInfo field={field} />
							</div>
						);
					}}
				</form.Field>

				<form.Field name='phone'>
					{(field) => {
						const { name, handleBlur, handleChange, state } = field;
						const { value } = state;

						return (
							<div className='space-y-2'>
								<Label htmlFor={field.name} className='block'>
									Phone related to this address <span className='text-red-500'>*</span>
								</Label>
								<Input
									id={name}
									name={name}
									value={value}
									type='tel'
									onChange={(e) => handleChange(e.target.value)}
									onBlur={handleBlur}
									placeholder='+39 333 333 3333'
								/>
							</div>
						);
					}}
				</form.Field>
				{!firstAddress && (
					<form.Field name='status'>
						{(field) => {
							const { name, handleBlur, handleChange, state } = field;
							const { value } = state;

							return (
								<div className='mb-7 mt-4 flex gap-3'>
									<Checkbox
										id={name}
										name={name}
										className='border-primary shadow-md'
										checked={value === 'active'}
										disabled={values?.status === 'active'}
										onCheckedChange={(checked) => {
											handleChange(checked ? 'active' : 'inactive');
										}}
										onBlur={handleBlur}
									/>

									<div className='grid gap-2'>
										<Label htmlFor={field.name}>Default address</Label>
										<p className='text-muted-foreground text-sm'>
											This address will be used as the default address when you sell a new item or make a proposal.
										</p>
									</div>
								</div>
							);
						}}
					</form.Field>
				)}

				{/* SUBMIT BUTTON */}
				<form.Subscribe
					selector={(formState) => ({
						canSubmit: formState.canSubmit,
						isSubmitting: formState.isSubmitting,
						isDirty: formState.isDirty,
					})}>
					{(state) => {
						const { canSubmit, isSubmitting } = state;

						const isSubmitDisabled = !canSubmit;

						return (
							<Button type='submit' disabled={isSubmitDisabled || isUpdatingAddress || isAddingAddress}>
								{isSubmitting || isUpdatingAddress || isAddingAddress
									? 'Saving...'
									: firstAddress
										? 'Continue'
										: 'Save'}
							</Button>
						);
					}}
				</form.Subscribe>
			</form>
		</div>
	);
}
