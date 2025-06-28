import { calculatePlatformFee } from './constants';
import { PaymentProviderService } from '../routes/payments/payment-provider.service';
import { ShipmentService } from '../routes/shipment-provider/shipment.service';
import { formatPrice, formatPriceToCents } from '#utils/price-formatter';

export interface PlatformCostsParams {
	item_id?: number;
	price?: number;
	buyer_profile_id?: number;
	buyer_email?: string;
}

export interface PlatformCostsConfig {
	calculateShipping?: boolean;
	calculatePaymentProviderCharge?: boolean;
	calculatePlatformCharge?: boolean;
}

export interface PlatformCostsResult {
	shipping_price?: number;
	payment_provider_charge?: number;
	payment_provider_charge_calculator_version?: number;
	platform_charge?: number;
}

/**
 * Calculates platform costs based on specified configuration
 * @param params - Parameters needed for calculation
 * @param config - Configuration specifying which calculations to perform
 * @returns Promise<PlatformCostsResult> - Object containing calculated costs based on config
 * @throws Error if any required calculation fails
 */
export async function calculatePlatformCosts(
	params: PlatformCostsParams,
	config: PlatformCostsConfig = {
		calculateShipping: true,
		calculatePaymentProviderCharge: true,
		calculatePlatformCharge: true,
	},
): Promise<PlatformCostsResult> {
	const { item_id, price, buyer_profile_id, buyer_email } = params;
	const result: PlatformCostsResult = {};

	// Calculate shipping price if requested
	if (config.calculateShipping && item_id && buyer_profile_id && buyer_email) {
		const shipmentService = new ShipmentService();
		const response_shipping_price = await shipmentService.calculateShippingCost(item_id, buyer_profile_id, buyer_email);

		if (!response_shipping_price) {
			throw new Error('Failed to calculate shipping fee');
		}

		result.shipping_price = formatPriceToCents(response_shipping_price);
	}

	// Calculate payment provider charge if requested
	if (config.calculatePaymentProviderCharge && price) {
		const paymentProviderService = new PaymentProviderService();
		const transactionFee = await paymentProviderService.calculateTransactionFee({
			price,
			currency: 'eur',
		});

		if (!transactionFee) {
			throw new Error('Failed to calculate transaction fee');
		}

		result.payment_provider_charge = transactionFee.charge ?? undefined;
		result.payment_provider_charge_calculator_version = transactionFee.charge_calculator_version ?? undefined;
	}

	// Calculate platform charge if requested
	if (config.calculatePlatformCharge && price) {
		result.platform_charge = calculatePlatformFee(price);
	}

	return result;
}
