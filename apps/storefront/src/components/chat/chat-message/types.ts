import { ChatMessageType, ChatRoomType } from '../types';

export interface ChatMessageProps {
	chatMessageProps: ChatMessageType;
	item: ChatRoomType['item'];
	isMsgSenderCurrentUser: boolean;
}
