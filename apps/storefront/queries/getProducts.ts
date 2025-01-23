import { api } from "../lib/api";

export async function getProduct() {
  const res = await api.product.$get();
  if (!res.ok) {
    throw new Error("Something went wrong");
  }

  const data = res.json();
  return data;
}
