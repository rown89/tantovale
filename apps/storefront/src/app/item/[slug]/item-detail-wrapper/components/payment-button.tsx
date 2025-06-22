import { Button } from '@workspace/ui/components/button';
import { ShoppingCart } from 'lucide-react';

export const PaymentButton = ({ handlePayment }: { handlePayment: () => void }) => {
	return (
		<>
			<div className='z-1 relative flex w-full flex-col items-center gap-4'>
				<Button
					variant='secondary'
					className='w-full font-bold text-slate-900 shadow-md outline-1 outline-black'
					onClick={handlePayment}>
					<ShoppingCart />
					<p>Buy</p>
				</Button>
			</div>
		</>
	);
};
