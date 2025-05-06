import { Button } from "@workspace/ui/components/button";
import { ShoppingCart } from "lucide-react";

export const PaymentButton = ({
  handlePayment,
}: {
  handlePayment: () => void;
}) => {
  return (
    <>
      <div className="flex flex-col w-full items-center gap-4 relative z-1">
        <Button
          variant="secondary"
          className="w-full font-bold text-slate-900 shadow-md outline-1 outline-black"
          onClick={handlePayment}
        >
          <ShoppingCart />
          <p>Buy</p>
        </Button>
      </div>
    </>
  );
};
