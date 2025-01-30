import { api } from "../lib/api";

export async function getItems() {
  const res = await api.items.$get();
  if (!res.ok) {
    throw new Error("Something went wrong");
  }

  const data = res.json();
  return data;
}
