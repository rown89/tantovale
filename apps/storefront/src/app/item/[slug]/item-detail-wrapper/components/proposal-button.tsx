import { Button } from "@workspace/ui/components/button";
import { HandHelping } from "lucide-react";

export const ProposalButton = ({
  handleProposal,
}: {
  handleProposal: () => void;
}) => {
  return (
    <>
      <div className="flex flex-col w-full items-center gap-4 relative z-1">
        <Button
          variant="outline"
          className="w-full font-bold shadow-md border-amber-400 outline-black outline-1"
          onClick={handleProposal}
        >
          <HandHelping />
          <p>Propose</p>
        </Button>
      </div>
    </>
  );
};
