import { PaymentProviderService } from '../routes/payments/payment-provider.service';
import { ShipmentService } from '../routes/shipment-provider/shipment.service';
import { formatPriceToCents } from '#utils/price-formatter';

export interface PlatformCostsParams {
	item_id?: number;
	price?: number; // always expressed in cents
	postage_fee?: number; // always expressed in cents
	payment_provider_charge?: number; // always expressed in cents
	buyer_profile_id?: number;
	buyer_email?: string;
}

export interface PlatformCostsConfig {
	shipping?: boolean;
	payment_provider_charge?: boolean;
	platform_charge_percentage?: boolean;
	platform_charge_amount?: boolean;
}

export interface PlatformCostsResult {
	shipping_price?: number | undefined;
	payment_provider_charge?: number;
	payment_provider_charge_calculator_version?: number;
	platform_charge_percentage?: number;
	platform_charge_amount?: number;
}

// Optional: Singleton service instances for better performance
let shipmentServiceInstance: ShipmentService | null = null;
let paymentProviderServiceInstance: PaymentProviderService | null = null;

function getShipmentService(): ShipmentService {
	if (!shipmentServiceInstance) {
		shipmentServiceInstance = new ShipmentService();
	}
	return shipmentServiceInstance;
}

function getPaymentProviderService(): PaymentProviderService {
	if (!paymentProviderServiceInstance) {
		paymentProviderServiceInstance = new PaymentProviderService();
	}
	return paymentProviderServiceInstance;
}

export function calculatePlatformFee(price: number): number {
	if (price <= 1000) return 0.01; // €10.00 - 1.00%
	if (price <= 5000) return 0.0095; // €50.00 - 0.95%
	if (price <= 10000) return 0.009; // €100.00 - 0.90%
	if (price <= 20000) return 0.0085; // €200.00 - 0.85%
	if (price <= 50000) return 0.008; // €500.00 - 0.80%
	if (price <= 100000) return 0.0075; // €1000.00 - 0.75%
	if (price <= 200000) return 0.007; // €2000.00 - 0.70%
	if (price <= 500000) return 0.0065; // €5000.00 - 0.65%
	return 0.006; // 0.60%
}

/**
 * Calculates platform costs based on specified configuration
 * Runs async operations in parallel for better performance
 * @param params - Parameters needed for calculation
 * @param config - Configuration: false/undefined = skip, true = optional, 'required' = required (throws on failure)
 * @returns Promise<PlatformCostsResult> - Object containing calculated costs based on config
 * @throws Error if any required calculation fails
 */
export async function calculatePlatformCosts(
	params: PlatformCostsParams,
	config: PlatformCostsConfig,
): Promise<PlatformCostsResult> {
	const { item_id, price, postage_fee, buyer_profile_id, buyer_email } = params;
	const result: PlatformCostsResult = {};

	// Create array of async operations to run in parallel
	const asyncOperations: Promise<void>[] = [];

	// Calculate shipping price if requested
	if (config.shipping && item_id && buyer_profile_id && buyer_email) {
		asyncOperations.push(
			(async () => {
				const shipmentService = getShipmentService();
				const response_shipping_price = await shipmentService.calculateShippingCost(
					item_id,
					buyer_profile_id,
					buyer_email,
				);

				result.shipping_price = response_shipping_price ? formatPriceToCents(response_shipping_price) : undefined;
			})(),
		);
	}

	// Calculate payment provider charge if requested
	if (config.payment_provider_charge && price && postage_fee) {
		asyncOperations.push(
			(async () => {
				const paymentProviderService = getPaymentProviderService();
				const transactionFee = await paymentProviderService.calculateTransactionFee({
					price,
					currency: 'eur',
				});
				result.payment_provider_charge = transactionFee?.charge ?? undefined;
				result.payment_provider_charge_calculator_version = transactionFee?.charge_calculator_version ?? undefined;
			})(),
		);
	}

	// Wait for all async operations to complete in parallel
	await Promise.all(asyncOperations);

	// Calculate platform charge (synchronous operation)
	if (config.platform_charge_percentage && price) {
		result.platform_charge_percentage = calculatePlatformFee(price);
	}

	if (config.platform_charge_amount && price) {
		result.platform_charge_amount = Math.round(price * calculatePlatformFee(price));
	}

	return result;
}
