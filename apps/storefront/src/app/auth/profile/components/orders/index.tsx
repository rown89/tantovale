"use client";

export default function UserSellingItemsComponent() {
  return (
    <div className="flex flex-col w-full overflow-auto px-4">
      <div className="flex items-center justify-between sticky top-0 bg-background z-1">
        <div className="space-y-6 w-full">
          <h1 className="text-3xl font-bold">Orders</h1>

          <p className="text-muted-foreground">Manage your orders.</p>
        </div>
      </div>

      <div className="flex w-full items-end justify-end my-2"></div>
    </div>
  );
}
