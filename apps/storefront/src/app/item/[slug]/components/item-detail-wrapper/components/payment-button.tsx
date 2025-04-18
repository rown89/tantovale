import { Button } from "@workspace/ui/components/button";
import { ShoppingCart } from "lucide-react";

export const PaymentButton = ({
  is_payable,
  handlePayment,
}: {
  is_payable: boolean;
  handlePayment: () => void;
}) => {
  return (
    <>
      {is_payable && (
        <div className="flex flex-col w-full items-center gap-4 relative z-1">
          <Button
            variant="secondary"
            className="w-full font-bold text-slate-900 shadow-md"
            onClick={handlePayment}
          >
            <ShoppingCart />
            <p>Acquista</p>
          </Button>
        </div>
      )}
    </>
  );
};
