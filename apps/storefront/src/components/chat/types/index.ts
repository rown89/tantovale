import { client } from '@workspace/server/client-rpc';

type ChatRoomsResponse = Awaited<ReturnType<(typeof client.chat.auth.rooms)['$get']>>;
type ChatRoomsData = Awaited<ReturnType<ChatRoomsResponse['json']>>;
export type ChatRoomType = NonNullable<ChatRoomsData>[number];

type ChatMessagesResponse = Awaited<ReturnType<(typeof client.chat.auth.rooms)[':roomId']['messages']['$get']>>;
type ChatMessagesUnion = Awaited<ReturnType<ChatMessagesResponse['json']>>;
// Extract only the 200 response type (array) from the union
type ChatMessagesData = Extract<NonNullable<ChatMessagesUnion>, readonly any[]>;
export type ChatMessageType = ChatMessagesData[number];
