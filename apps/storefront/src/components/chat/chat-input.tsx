"use client";

import { useState } from "react";
import { SendHorizontal } from "lucide-react";
import { Button } from "@workspace/ui/components/button";
import { Textarea } from "@workspace/ui/components/textarea";
import { useRouter } from "next/navigation";
import { client } from "@workspace/shared/clients/rpc-client";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
interface ChatInputProps {
  chatRoomId: number;
}

export function ChatInput({ chatRoomId }: ChatInputProps) {
  const queryClient = useQueryClient();

  const [message, setMessage] = useState("");
  const router = useRouter();

  const mutation = useMutation({
    mutationFn: async (message: string) => {
      await client.auth.chat.rooms[":roomId"].messages.$post({
        param: {
          roomId: chatRoomId?.toString(),
        },
        json: { message },
      });
    },
    onSuccess: () => {
      setMessage("");

      queryClient.invalidateQueries({ queryKey: ["chat-messages"] });
    },
    onError: (error) => {
      console.error("Failed to send message:", error);
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || mutation.isPending) return;

    mutation.mutate(message);
  };

  return (
    <form onSubmit={handleSubmit} className="py-4">
      <div className="flex items-center gap-2 ">
        <Textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Type your message..."
          className=" flex-1 resize-none"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSubmit(e);
            }
          }}
        />
        <Button
          type="submit"
          size="icon"
          disabled={!message.trim() || mutation.isLoading}
          className="h-10 w-10"
        >
          <SendHorizontal className="h-5 w-5" />
          <span className="sr-only">Send message</span>
        </Button>
      </div>
    </form>
  );
}
