"use client";

import { useQuery } from "@tanstack/react-query";
import { getProduct } from "../../queries/getProducts";

export default function Products() {
  const { data, error, isFetching } = useQuery({
    queryKey: ["product"],
    queryFn: getProduct,
  });

  if (isFetching) <div> Loading </div>;

  if (error) <div> Error </div>;

  return (
    <div>
      <p>{data?.products.map((item) => item.title)}</p>
    </div>
  );
}
