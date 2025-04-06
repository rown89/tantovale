"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { client } from "@workspace/shared/clients/rpc-client";
import { Spinner } from "@workspace/ui/components/spinner";
import { SidebarProvider } from "@workspace/ui/components/sidebar";
import { ChatSidebar } from "#components/chat/chat-sidebar";

export default function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();

  // Fetch current user data
  const { data: currentUser, isError: isUserError } = useQuery({
    queryKey: ["currentUser"],
    queryFn: async () => {
      const response = await client.auth.user.$get();
      if (!response.ok) {
        throw new Error("Failed to fetch user");
      }
      const user = await response.json();
      return user;
    },
  });

  // Fetch chat rooms
  const { data: chatRooms, isError: isRoomsError } = useQuery({
    queryKey: ["chatRooms"],
    queryFn: async () => {
      const response = await client.auth.chat.rooms.$get();

      if (!response.ok) {
        console.log("Failed to fetch chat rooms");
        return [];
      }

      return await response.json();
    },
    // Only fetch chat rooms if we have a current user
    enabled: !!currentUser,
  });

  // Handle authentication and data loading errors
  useEffect(() => {
    if (isUserError) {
      router.push("/login");
    }

    if (isRoomsError) {
      router.push("/404");
    }
  }, [isUserError, isRoomsError, router]);

  // Show loading state while data is being fetched
  if (!currentUser || !chatRooms) {
    return (
      <div className="flex h-[calc(100vh-4rem)] items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <SidebarProvider className="container mx-auto overflow-auto min-h-[calc(100vh-4rem)]">
      <div className="flex w-full h-[calc(100vh-4rem)] gap-8">
        <div className="hidden md:block overflow-auto">
          <ChatSidebar chatRooms={chatRooms} currentUserId={currentUser.id} />
        </div>
        <main className="flex-1 overflow-hidden">{children}</main>
      </div>
    </SidebarProvider>
  );
}
