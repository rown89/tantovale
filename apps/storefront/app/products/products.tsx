"use client";

import { useQuery } from "@tanstack/react-query";
import { getProduct } from "./page";

export default function Products() {
  const { isPending, data, error, isFetching } = useQuery({
    queryKey: ["product"],
    queryFn: getProduct,
  });

  if (isPending) <div> Loading </div>;

  if (error) <div> Error </div>;

  return (
    <div>
      <p>{data?.products.map((item) => item.title)}</p>
    </div>
  );
}
