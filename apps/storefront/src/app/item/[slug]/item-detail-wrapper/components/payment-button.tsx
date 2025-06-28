import { ShoppingCart } from 'lucide-react';

import { Button } from '@workspace/ui/components/button';
import { Spinner } from '@workspace/ui/components/spinner';

export const PaymentButton = ({
	isLoading,
	handlePayment,
}: {
	isLoading: boolean;
	handlePayment: () => Promise<void>;
}) => {
	return (
		<>
			<div className='z-1 relative flex w-full flex-col items-center gap-4'>
				<Button
					variant='secondary'
					className='w-full font-bold text-slate-900 shadow-md outline-1 outline-black'
					disabled={isLoading}
					onClick={handlePayment}>
					{isLoading ? (
						<Spinner />
					) : (
						<>
							<ShoppingCart />
							<p>Buy</p>
						</>
					)}
				</Button>
			</div>
		</>
	);
};
