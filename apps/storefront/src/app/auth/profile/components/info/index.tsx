'use client';

import { Edit, Trash } from 'lucide-react';

import { Label } from '@workspace/ui/components/label';
import { Input } from '@workspace/ui/components/input';
import {
	Select,
	SelectTrigger,
	SelectValue,
	SelectContent,
	SelectGroup,
	SelectItem,
} from '@workspace/ui/components/select';
import { Button } from '@workspace/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle, CardContent } from '@workspace/ui/components/card';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from '@workspace/ui/components/dialog';
import { useAddressesRetrieval } from '@workspace/shared/hooks/use-user-address-retrieval';

import { FieldInfo } from '#components/forms/utils/field-info';
import AddressForm from '#components/forms/address-form';
import { AddressStatus } from '@workspace/server/enumerated_values';
import useAddressForm from '#components/forms/address-form/use-address-form';
import { useProfileInfoForm } from './use-profile-info';
import { UserProfileSchema } from '@workspace/server/extended_schemas';
import z from 'zod/v4';

const schema = UserProfileSchema.pick({
	name: true,
	surname: true,
	gender: true,
	username: true,
	email: true,
});

type profileSchema = z.infer<typeof schema>;

export default function UserInfoComponent({ profile }: { profile: profileSchema }) {
	const { profileForm, isSubmittingProfileForm } = useProfileInfoForm(profile);

	const { userAddress } = useAddressesRetrieval();

	const {
		deleteAddress,
		editAddressStates,
		toggleEditAddress,
		deleteAddressStates,
		toggleDeleteAddress,
		setDeleteAddressStates,
	} = useAddressForm((e) => {
		if (e?.id) {
			setDeleteAddressStates((prev) => {
				const newState = { ...prev };
				delete newState[e.id];
				return newState;
			});
		}
	});

	return (
		<div className='flex flex-col gap-4'>
			{/* Basic Informations */}
			<Card id='info'>
				<CardHeader>
					<CardTitle>Basic Informations</CardTitle>
					<CardDescription>Manage your basic informations</CardDescription>
				</CardHeader>
				<CardContent>
					<div className='flex flex-col gap-4'>
						<div className='mb-4 flex flex-col gap-3'>
							<>
								<Label htmlFor={'username'} className='block'>
									Username
								</Label>
								<Input id={'username'} name={'username'} disabled={true} value={profile.username} />
							</>

							<>
								<Label htmlFor={'email'} className='block'>
									Email
								</Label>
								<Input id={'email'} name={'email'} disabled={true} value={profile.email} />
							</>
						</div>
						<form
							className='flex w-full flex-col gap-8'
							onSubmit={(e) => {
								e.preventDefault();
								e.stopPropagation();
								profileForm.handleSubmit();
							}}>
							<profileForm.Field name='name'>
								{(field) => {
									const { name, state, handleChange } = field;
									const { value } = state;

									return (
										<div className='space-y-2'>
											<Label htmlFor={name} className='block'>
												Name <span className='text-red-500'>*</span>
											</Label>
											<Input
												id={name}
												name={name}
												disabled={isSubmittingProfileForm}
												onChange={(e) => handleChange(e.target.value)}
												value={value}
											/>
											<FieldInfo field={field} />
										</div>
									);
								}}
							</profileForm.Field>
							<profileForm.Field name='surname'>
								{(field) => {
									const { name, state, handleChange } = field;
									const { value } = state;

									return (
										<div className='space-y-2'>
											<Label htmlFor={name} className='block'>
												Surname <span className='text-red-500'>*</span>
											</Label>
											<Input
												id={name}
												name={name}
												disabled={isSubmittingProfileForm}
												onChange={(e) => handleChange(e.target.value)}
												value={value}
											/>
											<FieldInfo field={field} />
										</div>
									);
								}}
							</profileForm.Field>
							<profileForm.Field name='gender'>
								{(field) => {
									const { name, handleChange } = field;

									return (
										<>
											<Label htmlFor={name}>
												Gender <span className='text-red-500'>*</span>
											</Label>
											<Select
												name={name}
												disabled={isSubmittingProfileForm}
												defaultValue={profile.gender}
												onValueChange={(e: 'male' | 'female') => {
													console.log(e);
													handleChange(e);
												}}>
												<SelectTrigger className='w-full'>
													<SelectValue placeholder={`Select your gender`} />
												</SelectTrigger>
												<SelectContent>
													<SelectGroup>
														{['male', 'female']?.map((item, i) => (
															<SelectItem key={i} value={item}>
																{item}
															</SelectItem>
														))}
													</SelectGroup>
												</SelectContent>
											</Select>
											<FieldInfo field={field} />
										</>
									);
								}}
							</profileForm.Field>

							<div className='w-full'>
								<profileForm.Subscribe
									selector={(formState) => ({
										canSubmit: formState.canSubmit,
										isSubmitting: formState.isSubmitting,
										isDirty: formState.isDirty,
									})}>
									{(state) => {
										const { canSubmit, isSubmitting, isDirty } = state;
										return (
											<Button type='submit' disabled={isSubmitting || !isDirty || !canSubmit} className='w-full'>
												{isSubmitting ? 'Saving...' : 'Save'}
											</Button>
										);
									}}
								</profileForm.Subscribe>
							</div>
						</form>
					</div>
				</CardContent>
			</Card>
			{/* Addresses */}
			<Card id='address'>
				<CardHeader>
					<CardTitle>Addresses</CardTitle>
					<CardDescription>
						The default address will be used to calculate shipment cost when you buy or make a proposal
					</CardDescription>
				</CardHeader>
				<CardContent className='grid grid-cols-1 gap-4 xl:grid-cols-2'>
					{userAddress?.map((address, i) => {
						const activeStatus = address.status === 'active';
						const addressInfo = `${address.street_address} ${address.civic_number}, ${address.city_name} ${`(${address.province_name}) - ${address.postal_code} - (${address.country_code})`}`;

						return (
							<Card
								key={`${i}-${address.id}`}
								className={`${
									activeStatus ? 'border-primary to-primary/10 bg-gradient-to-r from-transparent shadow-md' : ''
								}`}>
								<CardHeader>
									<CardTitle>
										<div className='flex justify-between gap-2'>
											<p className='max-w-[250px] truncate text-lg'>{address.label}</p>
											<div className='flex items-center gap-5'>
												<Dialog
													key={`edit-address-${address.id}`}
													open={editAddressStates?.[address.id]}
													onOpenChange={() => {
														toggleEditAddress(address.id);
													}}>
													<DialogTrigger className='hover:text-accent flex items-center gap-2'>
														<Edit className='h-4 w-4' />
													</DialogTrigger>
													<DialogContent>
														<DialogHeader>
															<DialogTitle>{address.label}</DialogTitle>
														</DialogHeader>
														<DialogDescription>
															<Label htmlFor={'address'} className='block'>
																Edit your address information
															</Label>
														</DialogDescription>
														<AddressForm
															mode='edit'
															values={{
																...address,
																address_id: address.id,
																status: address.status as Exclude<AddressStatus, 'deleted'>,
															}}
															onComplete={() => toggleEditAddress(address.id)}
														/>
													</DialogContent>
												</Dialog>

												{!activeStatus && (
													<Dialog
														open={deleteAddressStates[address.id] || false}
														onOpenChange={(open) => {
															toggleDeleteAddress(address.id);
														}}>
														<DialogTrigger className='hover:text-accent flex items-center gap-2'>
															<Trash className='h-4 w-4' />
														</DialogTrigger>
														<DialogContent>
															<DialogHeader>
																<DialogTitle>Delete Address</DialogTitle>
															</DialogHeader>
															<DialogDescription>Are you sure you want to delete this address?</DialogDescription>
															<DialogFooter>
																<Button
																	variant='destructive'
																	onClick={() => {
																		deleteAddress({
																			address_id: address.id,
																		});
																	}}>
																	Delete
																</Button>
															</DialogFooter>
														</DialogContent>
													</Dialog>
												)}
											</div>
										</div>
									</CardTitle>
								</CardHeader>
								<CardContent>
									<CardDescription>{addressInfo}</CardDescription>
								</CardContent>
							</Card>
						);
					})}
					{/* TODO: Currently I want handle only one address at a time */}
					{/* 
					<div className="flex justify-end md:justify-start items-center">
						<Dialog
							open={addAddressStates}
							onOpenChange={(open) => {
								setAddAddressStates(open);
							}}
						>
							<DialogTrigger className="flex justify-center items-center w-full">
								<Plus className="w-4 h-4" />
								Add new
							</DialogTrigger>
							<DialogContent>
								<DialogHeader>
									<DialogTitle>Add Address</DialogTitle>
								</DialogHeader>
								<DialogDescription>
									New address will be added to your profile
								</DialogDescription>
								<AddressForm
									mode="add"
									onComplete={() => setAddAddressStates(false)}
								/>
							</DialogContent>
						</Dialog>
					</div>
				*/}
				</CardContent>
			</Card>
		</div>
	);
}
