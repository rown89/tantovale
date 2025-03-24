"use client";

import { useState } from "react";
import { Input } from "@workspace/ui/components/input";
import { ItemCard } from "@workspace/ui/components/item-card/item-card";
import { Search } from "lucide-react";

export interface Item {
  id: number;
  title: string;
  price: number;
  image: string;
  createdAt: Date;
}

const itemList = [
  {
    id: 1,
    title: "Leather Jacket",
    price: 129.99,
    image: "/placeholder.svg?height=200&width=300",
    createdAt: new Date(2023, 10, 15),
  },
  {
    id: 2,
    title: "Wireless Headphones",
    price: 89.99,
    image: "/placeholder.svg?height=200&width=300",
    createdAt: new Date(2023, 11, 3),
  },
];

export default function UserItemsComponent() {
  const [searchTerm, setSearchTerm] = useState("");
  const [items, setItems] = useState<Item[]>(itemList ?? []);

  const handleDelete = (id: number) => {
    setItems(items.filter((item) => item.id !== id));
  };

  const handleEdit = (id: number) => {
    // Implement edit functionality
    console.log(`Editing item ${id}`);
  };

  const handleShare = (id: number) => {
    // Implement share functionality
    console.log(`Sharing item ${id}`);
  };

  const filteredItems = items.filter((item) =>
    item.title.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  return (
    <div className="flex flex-col gap-6 w-full">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Items List</h1>
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search items..."
            className="pl-8"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="grid gap-4">
        {filteredItems.length > 0 ? (
          filteredItems.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              onDelete={() => handleDelete(item.id)}
              onEdit={() => handleEdit(item.id)}
              onShare={() => handleShare(item.id)}
            />
          ))
        ) : (
          <p className="text-center py-8 text-muted-foreground">
            No items found
          </p>
        )}
      </div>
    </div>
  );
}
