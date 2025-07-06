import { ChatMessageType, ChatRoomType } from '../types';

export interface ChatMessageProps {
	message: ChatMessageType;
	item: ChatRoomType['item'];
	isChatOwner: boolean;
}
