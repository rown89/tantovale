import { Button } from '@workspace/ui/components/button';
import { HandHelping } from 'lucide-react';

export const ProposalButton = ({ handleProposal }: { handleProposal: () => void }) => {
	return (
		<>
			<div className='z-1 relative flex w-full flex-col items-center gap-4'>
				<Button
					variant='outline'
					className='w-full border-amber-400 font-bold shadow-md outline-1 outline-black'
					onClick={handleProposal}>
					<HandHelping />
					<p>Propose</p>
				</Button>
			</div>
		</>
	);
};
