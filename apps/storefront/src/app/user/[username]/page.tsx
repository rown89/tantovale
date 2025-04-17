import { Badge, Package, ShoppingBag, Tag, User } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import {
  Avatar,
  AvatarImage,
  AvatarFallback,
} from "@workspace/ui/components/avatar";
import { Button } from "@workspace/ui/components/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@workspace/ui/components/card";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@workspace/ui/components/tabs";
import { Separator } from "@workspace/ui/components/separator";

// This would typically come from a database
const getUserData = async (id: string) => {
  // Mock data for demonstration
  return {
    id,
    username: "JaneDoe",
    avatarUrl: "/placeholder.svg?height=100&width=100",
    joinDate: "January 2023",
    totalSales: 124,
    availableItems: 15,
    publishedItems: 12,
    items: [
      {
        id: "1",
        title: "Vintage Leather Jacket",
        price: 89.99,
        condition: "Used - Like New",
        category: "Clothing",
        imageUrl: "/placeholder.svg?height=200&width=200",
        publishedDate: "2023-10-15",
      },
      {
        id: "2",
        title: "Mechanical Keyboard",
        price: 65.0,
        condition: "Used - Good",
        category: "Electronics",
        imageUrl: "/placeholder.svg?height=200&width=200",
        publishedDate: "2023-11-02",
      },
      {
        id: "3",
        title: "Vintage Camera",
        price: 120.0,
        condition: "Used - Fair",
        category: "Electronics",
        imageUrl: "/placeholder.svg?height=200&width=200",
        publishedDate: "2023-11-10",
      },
      {
        id: "4",
        title: "Designer Sunglasses",
        price: 45.5,
        condition: "New",
        category: "Accessories",
        imageUrl: "/placeholder.svg?height=200&width=200",
        publishedDate: "2023-11-15",
      },
    ],
  };
};

export default async function UserDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const userData = await getUserData(params.id);

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="grid gap-8">
        {/* User Profile Section */}
        <div className="flex flex-col md:flex-row gap-6 items-start">
          <Avatar className="w-24 h-24">
            <AvatarImage
              src={userData.avatarUrl || "/placeholder.svg"}
              alt={userData.username}
            />
            <AvatarFallback>
              {userData.username.substring(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>

          <div className="space-y-2">
            <h1 className="text-3xl font-bold">{userData.username}</h1>
            <div className="flex items-center gap-2 text-muted-foreground">
              <User className="h-4 w-4" />
              <span>Member since {userData.joinDate}</span>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                Available Items
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {userData.availableItems}
              </div>
              <p className="text-xs text-muted-foreground">
                Items ready for purchase
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                Published Items
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {userData.publishedItems}
              </div>
              <p className="text-xs text-muted-foreground">
                Items visible in marketplace
              </p>
            </CardContent>
          </Card>
        </div>

        <Separator />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {userData.items.map((item) => (
            <Link href={`/items/${item.id}`} key={item.id} className="group">
              <Card className="overflow-hidden h-full transition-all hover:shadow-md">
                <div className="aspect-square relative">
                  <Image
                    src={item.imageUrl || "/placeholder.svg"}
                    alt={item.title}
                    fill
                    className="object-cover"
                  />
                </div>
                <CardContent className="p-4">
                  <h3 className="font-medium line-clamp-1 group-hover:text-primary transition-colors">
                    {item.title}
                  </h3>
                  <div className="flex justify-between items-center mt-2">
                    <span className="font-bold">${item.price.toFixed(2)}</span>
                    <Badge variant="outline">{item.condition}</Badge>
                  </div>
                  <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground">
                    <Tag className="h-3 w-3" />
                    <span>{item.category}</span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
