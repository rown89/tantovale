import { i18n } from "@workspace/shared/i18n";

export function ErrorMessage({
  errorCode,
  params,
}: {
  errorCode: string;
  params?: Record<string, string>;
}) {
  if (!params) return <p className="text-red-500">{i18n._(errorCode)}</p>;

  return <p className="text-red-500">{i18n._(errorCode, params)}</p>;
}
