'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useField } from '@tanstack/react-form';
import Link from 'next/link';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';

import { Button } from '@workspace/ui/components/button';
import { Input } from '@workspace/ui/components/input';
import { Label } from '@workspace/ui/components/label';
import { Textarea } from '@workspace/ui/components/textarea';
import { Spinner } from '@workspace/ui/components/spinner';
import MultiImageUpload from '@workspace/ui/components/image-uploader/multi-image-uploader';
import { useIsMobile } from '@workspace/ui/hooks/use-mobile';
import { useCategoriesData } from '@workspace/shared/hooks/use-categories-data';
import { CategorySelector } from '#components/category-selector';
import { DynamicProperties } from './components/dynamic-properties';
import { ItemDetailCard } from '@workspace/ui/components/item-detail-card/index';
import { Badge } from '@workspace/ui/components/badge';
import { formatPriceToCents } from '@workspace/server/price-formatter';
import { Switch } from '@workspace/ui/components/switch';
import { Alert, AlertTitle, AlertDescription } from '@workspace/ui/components/alert';
import { Progress } from '@workspace/ui/components/progress';
import { maxDescriptionLength, type Category } from '@workspace/server/extended_schemas';
import { Separator } from '@workspace/ui/components/separator';

import { useHandleItemForm } from './use-handle-item-form';
import { nestedSubCatHierarchy } from '../../../utils/nested-subcat-hierarchy';
import { isNextButtonEnabled, handleItemPreviewProperties } from './utils';
import { FieldInfo } from '../utils/field-info';
import { maxImages, step_one, step_two } from './constants';
import EasyPayInfoDialog from '#components/dialogs/easy-pay-info-dialog';

import type { PropertyFormValue, HandleItemFormComponent } from './types';

export default function HandleItemFormComponent({
	subcategory,
	formModel = 'create',
	profileAddress,
	defaultValues,
}: HandleItemFormComponent) {
	const [progress, setProgress] = useState(step_one);
	const [subcategoriesMenu, setSubcategoriesMenu] = useState<Partial<Category>[]>([]);
	const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
	const [selectedCondition, setSelectedCondition] = useState<Omit<PropertyFormValue, 'value'> | undefined>();
	const [selectedDeliveryMethod, setSelectedDeliveryMethod] = useState<Omit<PropertyFormValue, 'value'> | undefined>();

	const uploadInputRef = useRef<HTMLInputElement>(null);
	const isMobile = useIsMobile();

	const {
		allCategories,
		allSubcategories,
		subCatProperties,
		isLoadingCat,
		isLoadingSubCat,
		isLoadingSubCatProperties,
	} = useCategoriesData(subcategory?.id);

	const {
		form,
		isSubmittingForm,
		selectedSubCategory,
		isPickup,
		isManualShipping,
		deliveryMethodProperty,
		handleSubCategorySelect,
		handlePropertiesReset,
		handlePickupChange,
		handleEasyPayChange,
		setIsManualShipping,
		setEasyPay,
		handleManualShippingChange,
	} = useHandleItemForm({
		subcategory,
		subCatProperties,
		defaultValues,
	});

	const titleField = useField({ form, name: 'commons.title' });
	const title = titleField.state.value;
	const priceField = useField({ form, name: 'commons.price' });
	const price = priceField.state.value;
	const descriptionField = useField({ form, name: 'commons.description' });
	const description = descriptionField.state.value;
	const easyPayField = useField({ form, name: 'commons.easy_pay' });
	const easyPay = easyPayField.state.value;
	const imagesField = useField({ form, name: 'images' });
	const images = imagesField.state.value;
	const propertiesField = useField({ form, name: 'properties' });
	const properties = propertiesField.state.value;

	// Initialize some form fields
	useEffect(() => {
		// inizialize shipping_price
		form.setFieldValue('shipping.shipping_price', 0);

		// inizialize address_id
		if (profileAddress.id) {
			form.setFieldValue('commons.address_id', profileAddress.id);
		}

		// If we have one, set the subcategory from query params
		if (subcategory) {
			handleSubCategorySelect(subcategory);
		}
	}, []);

	// Handle part of Item preview
	useEffect(() => {
		if (!properties?.length) return;

		// Using the form, user has choosen easy pay for shipping
		if (easyPay) setEasyPay(easyPay);

		const { selectedCondition, selectedDeliveryMethods } = handleItemPreviewProperties({
			properties,
			subCatProperties,
		});

		if (selectedCondition) setSelectedCondition(selectedCondition);

		if (selectedDeliveryMethods) {
			setSelectedDeliveryMethod(selectedDeliveryMethods);
		}
	}, [properties, subCatProperties]);

	// build subcategories Menu Hierarchy:
	useEffect(() => {
		if (allCategories?.length && allSubcategories?.length) {
			const nestedMenu = nestedSubCatHierarchy(allSubcategories, allCategories);
			if (nestedMenu.length) setSubcategoriesMenu(nestedMenu);
		}
	}, [allCategories, allSubcategories]);

	// TODO: need to improve the slider component and remove this abomination
	// Close fullscreen image on Escape key
	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				setFullscreenImage(null);
			}
		};

		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	}, []);

	// Create image URLs for preview - properly formatted for the Slider component
	const imageUrls = useMemo(() => {
		if (!images || images.length === 0) return [];

		return images.map((file, i) => {
			const imageUrl = URL.createObjectURL(file as unknown as Blob);
			return (
				<div
					key={i}
					onClick={() => {
						setFullscreenImage(imageUrl);
					}}>
					<Image className='object-cover hover:cursor-pointer' fill src={imageUrl} alt='' />
				</div>
			);
		});
	}, [images]);

	return (
		<div className='container mx-auto h-[calc(100vh-56px)] px-6 py-6 lg:px-2 xl:px-0'>
			<div className='flex h-full gap-6'>
				{/* Left Column - Form */}
				<div className='h-full w-full break-words xl:max-w-[500px]'>
					{subcategory?.easy_pay && (
						<div className='sticky top-0 mb-4'>
							<Progress value={progress} />
						</div>
					)}
					<form
						onSubmit={(e) => {
							e.preventDefault();
							e.stopPropagation();
							form.handleSubmit();
						}}
						className='flex w-full flex-col justify-between space-y-4'>
						<div className='flex flex-col gap-6 overflow-auto p-0 md:pr-3'>
							{/* STEP ONE */}
							{progress === step_one && (
								<>
									<form.Field name='commons.subcategory_id' defaultValue={selectedSubCategory?.id}>
										{({ setValue }) => {
											return (
												<div>
													<Label className='mb-2 block text-slate-500 dark:text-slate-400'>
														Category <span className='text-red-500'>*</span>
													</Label>
													<CategorySelector
														isLoading={isLoadingCat || isLoadingSubCat}
														categories={subcategoriesMenu}
														selectedCategoryControlled={selectedSubCategory || subcategory}
														onSelect={(e) => {
															handlePropertiesReset();

															if (e) {
																handleSubCategorySelect(e);
																setValue(e.id ?? 0);
															}
														}}
													/>
												</div>
											);
										}}
									</form.Field>

									<form.Field name='images'>
										{(field) => {
											const { handleChange } = field;

											return (
												<div className='space-y-2'>
													<MultiImageUpload
														isError={field.state.meta.errors?.length > 0}
														fileInputRef={uploadInputRef}
														maxImages={maxImages}
														initialImages={images as unknown as File[]}
														onImagesChange={(images) => {
															if (images) handleChange(images as any);
														}}
													/>
													<FieldInfo field={field} />
												</div>
											);
										}}
									</form.Field>

									<form.Field name='commons.title'>
										{(field) => {
											const { name, handleBlur, handleChange, state } = field;
											const { meta, value } = state;

											return (
												<div className='space-y-2'>
													<Label htmlFor={name} className='block text-slate-500 dark:text-slate-400'>
														Title <span className='text-red-500'>*</span>
													</Label>
													<Input
														id={name}
														name={name}
														disabled={isSubmittingForm}
														value={value !== undefined ? value?.toString() : ''}
														onBlur={handleBlur}
														onChange={(e) => handleChange(e.target.value)}
														aria-invalid={meta.isTouched && meta.errors?.length ? 'true' : 'false'}
														className={meta.isTouched && meta.errors?.length ? 'border-red-500' : ''}
														placeholder='Title of your item'
													/>
													<FieldInfo field={field} />
												</div>
											);
										}}
									</form.Field>
									<form.Field name='commons.price'>
										{(field) => {
											const { name, handleBlur, handleChange, state } = field;
											const { meta, value } = state;
											const { isTouched, errors } = meta;

											return (
												<div className='space-y-2'>
													<Label htmlFor={name} className='block text-slate-500 dark:text-slate-400'>
														Price (€) <span className='text-red-500'>*</span>{' '}
													</Label>
													<Input
														id={name}
														name={name}
														disabled={isSubmittingForm}
														type='number'
														min='.01'
														step='.01'
														placeholder='0.20'
														value={value !== undefined ? ((value as number) / 100).toString() : ''}
														onBlur={handleBlur}
														onChange={(e) => {
															handleChange(e.target.value ? formatPriceToCents(e.target.valueAsNumber) : 0);
														}}
														aria-invalid={isTouched && errors?.length ? 'true' : 'false'}
														className={isTouched && errors?.length ? 'border-red-500' : ''}
													/>
													<FieldInfo field={field} />
												</div>
											);
										}}
									</form.Field>

									{/* hidden field */}
									<form.Field name='commons.address_id'>
										{(field) => {
											return (
												<div className='hidden'>
													<Label htmlFor={field.name}>Item location</Label>

													<FieldInfo field={field} />
												</div>
											);
										}}
									</form.Field>

									<form.Field name='commons.description'>
										{(field) => {
											const { name, handleBlur, handleChange, state } = field;
											const { meta, value } = state;
											const { isTouched, errors } = meta;

											return (
												<div className='space-y-2'>
													<Label htmlFor={name} className='flex justify-between text-slate-500 dark:text-slate-400'>
														<p>
															Description <span className='text-red-500'>*</span>{' '}
														</p>
														<span className='text-sm'>{`${value?.length || 0}/${maxDescriptionLength} chars`}</span>
													</Label>
													<Textarea
														id={name}
														name={name}
														disabled={isSubmittingForm}
														rows={6}
														minLength={50}
														maxLength={2500}
														value={value !== undefined ? value?.toString() : ''}
														onBlur={handleBlur}
														onChange={(e) => handleChange(e.target.value)}
														placeholder='Description of your item'
														aria-invalid={isTouched && errors?.length ? 'true' : 'false'}
														className={isTouched && errors?.length ? 'max-h-52 border-red-500' : 'max-h-52'}
													/>
													<FieldInfo field={field} />
												</div>
											);
										}}
									</form.Field>

									{/* DYNAMIC PROPERTIES FIELDS */}
									{selectedSubCategory &&
										(isLoadingCat || isLoadingSubCat || isLoadingSubCatProperties ? (
											<Spinner />
										) : (
											subCatProperties &&
											subCatProperties?.length > 0 &&
											subCatProperties
												?.filter((property) => property.slug !== 'delivery_method')
												.map((property) => {
													return (
														<form.Field key={property.id} name='properties'>
															{(field) => <DynamicProperties property={property} field={field} />}
														</form.Field>
													);
												})
										))}
								</>
							)}

							{/* STEP TWO */}
							{progress === step_two && (
								<>
									{(subcategory?.easy_pay || deliveryMethodProperty) && (
										<div className='flex flex-col gap-2'>
											{/* Easy Pay */}
											{subcategory?.easy_pay && (
												<form.Field name='commons.easy_pay'>
													{(field) => {
														const { name, state } = field;
														const { value } = state;

														return (
															<div className='space-y-2'>
																<Alert
																	className={`cursor-pointer py-4 ${easyPay ? 'border-1 border-primary' : ''}`}
																	onClick={() => handleEasyPayChange(!value, field, propertiesField)}>
																	<AlertTitle className='mb-2 flex justify-between gap-2'>
																		<div onClick={(e) => e.stopPropagation()}>
																			<EasyPayInfoDialog />
																		</div>
																		<div onClick={(e) => e.stopPropagation()}>
																			<Switch
																				id={name}
																				name={name}
																				onCheckedChange={(checked) => {
																					handleEasyPayChange(checked, field, propertiesField);
																					// When enabling Easy Pay, disable manual shipping
																					if (checked) {
																						setIsManualShipping(false);

																						form.setFieldValue('shipping.shipping_price', 0);
																					}
																				}}
																				checked={value !== undefined ? value : false}
																			/>
																		</div>
																	</AlertTitle>
																	<AlertDescription>
																		Enabling this option allows buyers to instantly purchase your item, with secure
																		payment processing and tracking from payment to shipment.
																		{easyPay && (
																			<>
																				<Separator className='my-4' />
																				<div className='mb-6 flex flex-col gap-3'>
																					<Label className='mb-2 leading-5 text-slate-500 dark:text-slate-400'>
																						Add approximate items dimensions to help the system to automatically
																						calculate the shipping price.
																					</Label>
																					<form.Field name='shipping.item_weight'>
																						{(field) => {
																							const { name } = field;
																							const { value } = field.state;
																							const { handleChange, handleBlur } = field;

																							return (
																								<>
																									<Label
																										htmlFor={field.name}
																										className='text-slate-500 dark:text-slate-400'>
																										Weight (KG) <span className='text-red-500'>*</span>
																									</Label>
																									<Input
																										id={name}
																										name={name}
																										type='number'
																										min='.01'
																										step='.01'
																										placeholder='ex: 1000'
																										value={value !== undefined ? value : ''}
																										onChange={(e) => {
																											handleChange(e.target.valueAsNumber);
																										}}
																										onBlur={handleBlur}
																										onClick={(e) => e.stopPropagation()}
																									/>
																									<FieldInfo field={field} />
																								</>
																							);
																						}}
																					</form.Field>

																					<form.Field name='shipping.item_length'>
																						{(field) => {
																							const { name } = field;
																							const { value } = field.state;
																							const { handleChange, handleBlur } = field;

																							return (
																								<>
																									<Label
																										htmlFor={field.name}
																										className='text-slate-500 dark:text-slate-400'>
																										Length (cm) <span className='text-red-500'>*</span>
																									</Label>
																									<Input
																										id={name}
																										name={name}
																										type='number'
																										min='.01'
																										step='.01'
																										placeholder='ex: 100'
																										value={value !== undefined ? value : ''}
																										onChange={(e) => {
																											handleChange(e.target.valueAsNumber);
																										}}
																										onBlur={handleBlur}
																										onClick={(e) => e.stopPropagation()}
																									/>
																									<FieldInfo field={field} />
																								</>
																							);
																						}}
																					</form.Field>

																					<form.Field name='shipping.item_width'>
																						{(field) => {
																							const { name } = field;
																							const { value } = field.state;
																							const { handleChange, handleBlur } = field;

																							return (
																								<>
																									<Label
																										htmlFor={field.name}
																										className='text-slate-500 dark:text-slate-400'>
																										Width (cm) <span className='text-red-500'>*</span>
																									</Label>
																									<Input
																										id={name}
																										name={name}
																										type='number'
																										min='.01'
																										step='.01'
																										placeholder='ex: 100'
																										value={value !== undefined ? value : ''}
																										onChange={(e) => {
																											handleChange(e.target.valueAsNumber);
																										}}
																										onBlur={handleBlur}
																										onClick={(e) => e.stopPropagation()}
																									/>
																									<FieldInfo field={field} />
																								</>
																							);
																						}}
																					</form.Field>

																					<form.Field name='shipping.item_height'>
																						{(field) => {
																							const { name } = field;
																							const { value } = field.state;
																							const { handleChange, handleBlur } = field;

																							return (
																								<>
																									<Label
																										htmlFor={field.name}
																										className='text-slate-500 dark:text-slate-400'>
																										Height (cm) <span className='text-red-500'>*</span>
																									</Label>
																									<Input
																										id={name}
																										name={name}
																										type='number'
																										min='.01'
																										step='.01'
																										placeholder='ex: 100'
																										value={value !== undefined ? value : ''}
																										onChange={(e) => {
																											handleChange(e.target.valueAsNumber);
																										}}
																										onBlur={handleBlur}
																										onClick={(e) => e.stopPropagation()}
																									/>
																									<FieldInfo field={field} />
																								</>
																							);
																						}}
																					</form.Field>
																				</div>
																			</>
																		)}
																	</AlertDescription>
																</Alert>
															</div>
														);
													}}
												</form.Field>
											)}

											{/* Manual shipping it's not a delivery method but sets the shipping price only if the user enables it */}
											<form.Field name='shipping.shipping_price'>
												{(field) => {
													const { name, handleChange, state } = field;
													const { value } = state;

													return (
														<>
															<Alert
																className={`cursor-pointer py-4 ${isManualShipping ? 'border-1 border-primary' : ''}`}
																onClick={() => {
																	const value = !isManualShipping;
																	handleManualShippingChange(value, propertiesField);
																}}>
																<AlertTitle className='mb-2 flex justify-between gap-2'>
																	<div onClick={(e) => e.stopPropagation()}>
																		<p className={`text-lg font-bold ${isManualShipping ? 'text-primary' : ''}`}>
																			Manual shipping
																		</p>
																	</div>
																	<div onClick={(e) => e.stopPropagation()}>
																		<Switch
																			onCheckedChange={(checked) => {
																				handleManualShippingChange(checked, propertiesField);
																			}}
																			checked={isManualShipping}
																		/>
																	</div>
																</AlertTitle>
																<AlertDescription>
																	Enable this option to arrange the shipment by yourself.
																	<br />
																	If you enable this option, you will be able to set the shipping price manually.
																	<br />
																	{isManualShipping && (
																		<div className='mt-4 flex flex-col gap-2'>
																			<Label htmlFor={field.name} className='text-slate-500 dark:text-slate-400'>
																				Shipping price <span className='text-red-500'>*</span>
																			</Label>
																			<Input
																				id={name}
																				name={name}
																				value={value !== undefined ? ((value as number) / 100).toString() : ''}
																				onChange={(e) => {
																					handleChange(e.target.value ? formatPriceToCents(e.target.valueAsNumber) : 0);
																				}}
																				onClick={(e) => e.stopPropagation()}
																				disabled={easyPay || !isManualShipping || isSubmittingForm}
																				type='number'
																				min='.01'
																				step='.01'
																				placeholder='ex: 15.50€'
																			/>

																			<FieldInfo field={field} />
																		</div>
																	)}
																</AlertDescription>
															</Alert>
														</>
													);
												}}
											</form.Field>

											{/* Pickup */}
											<form.Field name='properties'>
												{(field) => {
													return (
														<Alert
															className={`cursor-pointer py-4 ${isPickup ? 'border-1 border-primary' : ''}`}
															onClick={() => {
																const value = !isPickup;
																handlePickupChange(value, field);
															}}>
															<AlertTitle className='mb-2 flex justify-between gap-2'>
																<div onClick={(e) => e.stopPropagation()}>
																	<p className={`text-lg font-bold ${isPickup ? 'text-primary' : ''}`}>Pickup</p>
																</div>
																<div onClick={(e) => e.stopPropagation()}>
																	<Switch
																		onCheckedChange={(checked) => {
																			handlePickupChange(checked, field);
																		}}
																		checked={isPickup}
																	/>
																</div>
															</AlertTitle>
															<AlertDescription>
																Enable this option to let buyers pick up the item themselves from your location.
															</AlertDescription>
														</Alert>
													);
												}}
											</form.Field>

											{/* Show error if "delivery_method" property is not selected */}
											{form.state.errors.map((err, index) => {
												if (err?.['properties.delivery_method']) {
													return (
														<div key={index} className='text-red-500'>
															Select a delivery method
														</div>
													);
												}
											})}
										</div>
									)}
								</>
							)}
						</div>

						{/* SUBMIT BUTTONS */}
						<form.Subscribe
							selector={(formState) => ({
								canSubmit: formState.canSubmit,
								isSubmitting: formState.isSubmitting,
								isDirty: formState.isDirty,
							})}>
							{(state) => {
								const { canSubmit, isSubmitting } = state;

								const isSubmitDisabled =
									!selectedSubCategory ||
									isSubmittingForm ||
									isLoadingCat ||
									isLoadingSubCat ||
									isLoadingSubCatProperties ||
									!canSubmit;

								return (
									<div className='sticky bottom-2 flex gap-2 p-0 md:pr-3'>
										{/* If doesn't have easy pay and delivery method, Show submit button and ignore step two */}
										{subcategory && !subcategory?.easy_pay && !deliveryMethodProperty && (
											<Button className='flex-1' type='submit' disabled={isSubmitDisabled}>
												{isSubmitting ? (
													<>
														Submitting <Spinner className='h-4 w-4' />
													</>
												) : (
													'Submit'
												)}
											</Button>
										)}

										{/* Go to step two ( Shipping ) */}
										{subcategory && (subcategory?.easy_pay || deliveryMethodProperty) && progress === step_one && (
											<Button
												className='flex-1'
												variant='outline'
												type='button'
												disabled={
													!isNextButtonEnabled({
														form,
														subCatProperties,
														properties,
													})
												}
												onClick={() => {
													if (
														isNextButtonEnabled({
															form,
															subCatProperties,
															properties,
														})
													)
														setProgress(step_two);
												}}>
												Next
											</Button>
										)}

										{/* STEP TWO submit button */}
										{subcategory && (subcategory?.easy_pay || deliveryMethodProperty) && progress === step_two && (
											<div className='flex w-full gap-2'>
												<Button className='flex-1' variant='outline' onClick={() => setProgress(step_one)}>
													<ArrowLeft className='h-4 w-4' /> Back
												</Button>
												<Button className='flex-1' disabled={isSubmitDisabled} type='submit'>
													{isSubmitting ? (
														<>
															Submitting <Spinner className='h-4 w-4' />
														</>
													) : (
														'Submit'
													)}
												</Button>
											</div>
										)}
									</div>
								);
							}}
						</form.Subscribe>
					</form>
				</div>

				{/* Right Column - Item Preview */}
				{!isMobile && (
					<div className='mx-auto h-full w-full max-w-[760px] overflow-hidden'>
						{/* test debug output */}
						{JSON.stringify(form.state.errors, null, 4)}

						<ItemDetailCard
							isPreview
							imagesRef={uploadInputRef}
							maxImages={maxImages}
							item={{
								title: title !== undefined ? String(title) : '',
								price: price !== undefined ? Number(price) : 0,
								location: {
									city: {
										id: profileAddress.city_id,
										name: profileAddress.city_name,
									},
									province: {
										id: profileAddress.province_id,
										name: profileAddress.province_name,
									},
								},
								description: description !== undefined ? String(description) : '',
								images: imageUrls?.length ? imageUrls : [],
								subcategory: selectedSubCategory && (
									<Link href={`/items/condition/${selectedSubCategory.slug ?? '#'}`} target='_blank' className='mb-2'>
										<Badge variant='outline' className='bg-accent px-3 text-sm text-white'>
											{selectedSubCategory.name}
										</Badge>
									</Link>
								),
								condition: selectedCondition && (
									<Link href={`/items/category/${selectedCondition.slug ?? '#'}`} target='_blank' className='mb-2'>
										<Badge variant='outline' className='bg-primary px-3 text-sm text-white'>
											{selectedCondition.name}
										</Badge>
									</Link>
								),
								deliveryMethods: selectedDeliveryMethod?.name,
							}}
						/>

						{/* image Fullscreen Preview (doesn't work on initial placeholder images) */}
						<AnimatePresence>
							{fullscreenImage && (
								<motion.div
									className='fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-80'
									initial={{ opacity: 0 }}
									animate={{ opacity: 1 }}
									exit={{ opacity: 0 }}
									onClick={() => setFullscreenImage(null)}>
									<motion.img
										src={fullscreenImage}
										alt='Fullscreen'
										className='h-full object-contain p-12'
										initial={{ opacity: 0 }}
										animate={{ opacity: 1 }}
										exit={{ opacity: 0 }}
										transition={{ duration: 0.2, ease: 'easeInOut' }}
									/>
								</motion.div>
							)}
						</AnimatePresence>
					</div>
				)}
			</div>
		</div>
	);
}
