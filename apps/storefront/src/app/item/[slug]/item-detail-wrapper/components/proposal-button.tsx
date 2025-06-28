import { HandHelping } from 'lucide-react';

import { Button } from '@workspace/ui/components/button';
import { Spinner } from '@workspace/ui/components/spinner';

export const ProposalButton = ({
	isLoading,
	handleProposal,
}: {
	isLoading: boolean;
	handleProposal: () => Promise<void>;
}) => {
	return (
		<>
			<div className='z-1 relative flex w-full flex-col items-center gap-4'>
				<Button
					variant='outline'
					className='w-full border-amber-400 font-bold shadow-md outline-1 outline-black'
					disabled={isLoading}
					onClick={handleProposal}>
					{isLoading ? (
						<Spinner />
					) : (
						<>
							<HandHelping />
							<p>Propose</p>
						</>
					)}
				</Button>
			</div>
		</>
	);
};
