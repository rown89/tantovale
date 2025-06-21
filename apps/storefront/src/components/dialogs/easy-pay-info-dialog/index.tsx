import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog";
import { Info } from "lucide-react";

export default function EasyPayInfoDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <div className="flex gap-2 items-center">
          <p className={`font-bold text-lg text-primary`}>Easy Pay</p>
          <Info className="h-4 w-4 text-blue-500" />
        </div>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>What is Easy Pay?</DialogTitle>
          <DialogDescription className="my-2">
            With Easy Pay, selling your items online is simple and secure.
            <br />
            <br />
            Once a buyer completes the purchase, the payment is safely held by
            our system until you ship the item.
            <br />
            After the buyer confirms delivery, we promptly release the funds to
            your account.
            <br />
            <br />
            This process helps protect both you and the buyer, ensuring a smooth
            and trustworthy transaction.
          </DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );
}
