export function cookieSetter(setCookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {};

  setCookieHeader.split(/,(?=[^;]+?=)/).forEach((cookie) => {
    const [name, ...rest] = cookie.split("=");
    const trimmedName = name?.trim();
    const value = rest?.join("=")?.split(";")?.[0]?.trim(); // Extract value, ignore attributes

    if (trimmedName && value) {
      console.log(`🔑 Found cookie: ${trimmedName} = ${value}`);
      cookies[trimmedName] = value;
    }
  });

  return cookies;
}
