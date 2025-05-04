import { ChatMessageType } from "@workspace/server/enumerated_values";
import { ChatItem } from "..";

export interface ChatMessage {
  id: number;
  message: string;
  message_type: ChatMessageType;
  order_proposal_id: number | null;
  created_at: string;
  read_at: string | null;
  sender: {
    id: number;
    username: string;
  };
}

export interface ChatMessageProps {
  message: ChatMessage;
  item: ChatItem;
  isCurrentUser: boolean;
}
