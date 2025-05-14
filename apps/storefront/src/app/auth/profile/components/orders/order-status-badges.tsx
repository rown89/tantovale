import { Badge } from "@workspace/ui/components/badge";

export const getStatusBadge = (status: string) => {
  switch (status) {
    case "payment_pending":
      return (
        <Badge
          variant="outline"
          className="bg-yellow-50 text-yellow-700 border-yellow-200 font-bold"
        >
          Pending Payment
        </Badge>
      );
    case "payment_confirmed":
      return (
        <Badge
          variant="outline"
          className="bg-blue-50 text-blue-700 border-blue-200 font-bold"
        >
          Payment Confirmed
        </Badge>
      );
    case "payment_failed":
      return (
        <Badge
          variant="outline"
          className="bg-red-50 text-red-700 border-red-200 font-bold"
        >
          Payment Failed
        </Badge>
      );
    case "payment_refunded":
      return (
        <Badge
          variant="outline"
          className="bg-red-50 text-red-700 border-red-200 font-bold"
        >
          Payment Refunded
        </Badge>
      );
    case "shipping_pending":
      return (
        <Badge
          variant="outline"
          className="bg-yellow-50 text-yellow-700 border-yellow-200 font-bold"
        >
          Shipping Pending
        </Badge>
      );
    case "shipping_confirmed":
      return (
        <Badge
          variant="outline"
          className="bg-blue-50 text-blue-700 border-blue-200 font-bold"
        >
          Shipping Confirmed
        </Badge>
      );
    case "completed":
      return (
        <Badge
          variant="outline"
          className="bg-green-50 text-green-700 border-green-200 font-bold"
        >
          Completed
        </Badge>
      );
    case "cancelled":
      return (
        <Badge
          variant="outline"
          className="bg-red-50 text-red-500 border-red-200 font-bold"
        >
          Cancelled
        </Badge>
      );
    case "expired":
      return (
        <Badge
          variant="outline"
          className="bg-red-50 text-red-500 border-red-200 font-bold"
        >
          Expired
        </Badge>
      );
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
};
