import {
  dehydrate,
  HydrationBoundary,
  QueryClient,
} from "@tanstack/react-query";
import Products from "./products";
import { api } from "../../lib/api";

export async function getProduct() {
  const res = await api.product.$get();
  if (!res.ok) {
    throw new Error("Something went wrong");
  }

  const data = res.json();
  return data;
}

export default async function ProductsPage() {
  const queryClient = new QueryClient();

  await queryClient.prefetchQuery({
    queryKey: ["products"],
    queryFn: getProduct,
  });

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <Products />
    </HydrationBoundary>
  );
}
