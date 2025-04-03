import { formatDistanceToNow } from "date-fns";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@workspace/ui/components/avatar";
import { cn } from "@workspace/ui/lib/utils";

interface ChatMessageProps {
  message: {
    id: number;
    message: string;
    created_at: string;
    read_at: string | null;
    sender: {
      id: number;
      username: string;
    };
  };
  isCurrentUser: boolean;
}

export function ChatMessage({ message, isCurrentUser }: ChatMessageProps) {
  return (
    <div
      className={cn(
        "flex items-start gap-2 mb-4",
        isCurrentUser ? "flex-row-reverse" : "flex-row",
      )}
    >
      <Avatar className="h-8 w-8 mt-0.5">
        <AvatarFallback>
          {message.sender.username.substring(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div
        className={cn(
          "flex flex-col max-w-[80%]",
          isCurrentUser ? "items-end" : "items-start",
        )}
      >
        <div
          className={cn(
            "px-3 py-2 rounded-lg",
            isCurrentUser ? "bg-primary text-primary-foreground" : "bg-muted",
          )}
        >
          <p className="text-sm">{message.message}</p>
        </div>
        <div className="flex items-center mt-1 text-xs text-muted-foreground">
          <span>
            {formatDistanceToNow(new Date(message.created_at), {
              addSuffix: true,
            })}
          </span>
          {isCurrentUser && message.read_at && (
            <span className="ml-1">• Read</span>
          )}
        </div>
      </div>
    </div>
  );
}
