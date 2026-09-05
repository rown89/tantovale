ALTER TABLE "shipping_label_purchases" ADD CONSTRAINT "shipping_label_purchases_provider_evidence_check" CHECK ((
				"provider_transaction_id" IS NULL
				AND "label_url" IS NULL
				AND "provider_status" IS NULL
				AND "tracking_number" IS NULL
				AND "tracking_url" IS NULL
			) OR (
				"provider_transaction_id" IS NOT NULL
				AND "label_url" IS NOT NULL
				AND "provider_status" = 'SUCCESS'
			));