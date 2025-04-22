import { useState, useEffect } from "react";
import {
  loadConnectAndInitialize,
  StripeConnectInstance,
} from "@stripe/connect-js";
import { client } from "@workspace/server/client-rpc";

export const useStripeConnect = (connectedAccountId: string | undefined) => {
  const [stripeConnectInstance, setStripeConnectInstance] = useState<
    StripeConnectInstance | undefined
  >();

  useEffect(() => {
    if (connectedAccountId) {
      const fetchClientSecret = async () => {
        const response = await client.payment.auth.account_session.$post({
          json: {
            stripe_account_id: connectedAccountId,
          },
        });

        if (!response.ok) {
          const { error } = await response.json();

          throw new Error(`An error occurred: ${error}`);
        } else {
          const { client_secret: clientSecret } = await response.json();
          return clientSecret;
        }
      };

      const stripeConnect = loadConnectAndInitialize({
        publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLIC_KEY ?? "",
        fetchClientSecret,
        appearance: {
          overlays: "dialog",
          variables: {
            colorPrimary: "#635BFF",
          },
        },
      });

      setStripeConnectInstance(stripeConnect);
    }
  }, [connectedAccountId]);

  return stripeConnectInstance;
};

export default useStripeConnect;
