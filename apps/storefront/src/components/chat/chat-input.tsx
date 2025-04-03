"use client";

import { useState } from "react";
import { SendHorizontal } from "lucide-react";
import { Button } from "@workspace/ui/components/button";
import { Textarea } from "@workspace/ui/components/textarea";
import { useRouter } from "next/navigation";
import { client } from "@workspace/shared/clients/rpc-client";

interface ChatInputProps {
  chatRoomId: number;
}

export function ChatInput({ chatRoomId }: ChatInputProps) {
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || isSubmitting) return;

    setIsSubmitting(true);

    try {
      await client.auth.chat.rooms[":roomId"].messages.$post({
        param: {
          roomId: chatRoomId?.toString(),
        },
        json: { message },
      });

      setMessage("");
      router.refresh(); // Refresh the page to get the new message
    } catch (error) {
      console.error("Failed to send message:", error);
    } finally {
      setIsSubmitting(false);
    }
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
          disabled={!message.trim() || isSubmitting}
          className="h-10 w-10"
        >
          <SendHorizontal className="h-5 w-5" />
          <span className="sr-only">Send message</span>
        </Button>
      </div>
    </form>
  );
}
