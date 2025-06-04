import { client } from "@workspace/server/client-rpc";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import ItemWDetailWrapper from "./item-detail-wrapper";
import { Suspense } from "react";
import { Spinner } from "@workspace/ui/components/spinner";

export default async function ItemDetailPage() {
  const headerList = await headers();
  const pathname = headerList.get("x-current-path");

  // Improved extraction of itemId using a regular expression
  const match = pathname?.match(/\/item\/(?:[^/]+-)?(\d+)/);
  const id = match ? match[1] : null;

  if (!id || !Number(id)) return notFound();

  const cookieStore = await cookies();
  const accessToken = cookieStore.get("access_token")?.value;
  const refreshToken = cookieStore.get("refresh_token")?.value;

  // get item data
  const itemResponse = await client.item[":id"].$get({
    param: {
      id,
    },
  });

  if (!itemResponse.ok) return notFound();

  const item = await itemResponse.json();

  // get profile compact data
  const itemOwnerDataResponse = await client.profile.compact[":username"].$get({
    param: {
      username: item.user.username,
    },
  });

  if (!itemOwnerDataResponse.ok) return notFound();

  const itemOwnerData = await itemOwnerDataResponse.json();

  // If logged in, check if user has already an ongoing chat with the item owner
  let chatId = undefined;

  if (accessToken) {
    // get chat id
    const chatResponse = await client.chat.auth.rooms.id[":item_id"].$get(
      {
        param: {
          item_id: id,
        },
      },
      {
        headers: {
          cookie: `access_token=${accessToken}; refresh_token=${refreshToken};`,
        },
      },
    );

    if (chatResponse.ok) {
      const chat = await chatResponse.json();
      chatId = chat.id;
    }
  }

  // If logged in, check if user has already an ongoing order proposal with the item owner
  let orderProposal = undefined;

  if (accessToken) {
    // get order proposal
    const orderProposalResponse = await client.orders_proposals.auth.by_item[
      ":item_id"
    ].$get(
      {
        param: {
          item_id: id,
        },
        query: {
          status: "pending",
        },
      },
      {
        headers: {
          cookie: `access_token=${accessToken}; refresh_token=${refreshToken};`,
        },
      },
    );

    if (orderProposalResponse.ok) {
      const response = await orderProposalResponse.json();
      orderProposal = response;
    }
  }

  let isFavorite = false;

  if (accessToken) {
    // check if item is favorite
    const isFavoriteResponse = await client.favorites.auth.check[
      ":item_id"
    ].$get(
      {
        param: {
          item_id: id,
        },
      },
      {
        headers: {
          cookie: `access_token=${accessToken}; refresh_token=${refreshToken};`,
        },
      },
    );

    if (isFavoriteResponse.ok) {
      const response = await isFavoriteResponse.json();
      isFavorite = response;
    }
  }

  let user = null;

  if (accessToken) {
    // get user data
    let userResponse = await client.verify.$get(
      {
        credentials: "include",
      },
      {
        headers: {
          cookie: `access_token=${accessToken}; refresh_token=${refreshToken};`,
        },
      },
    );

    if (userResponse.ok) {
      const response = await userResponse.json();
      user = response.user;
    }
  }

  const isCurrentUserTheItemOwner = item.user.id === user?.id;

  return (
    <Suspense fallback={<Spinner />}>
      <ItemWDetailWrapper
        item={item}
        itemOwnerData={itemOwnerData}
        isFavorite={isFavorite}
        chatId={chatId}
        orderProposal={orderProposal}
        isCurrentUserTheItemOwner={isCurrentUserTheItemOwner}
      />
    </Suspense>
  );
}
