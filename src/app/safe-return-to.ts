export function safeReturnTo(value: string | undefined): string {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\")
  ) {
    return "/";
  }

  try {
    const baseUrl = new URL("http://localhost");
    const parsedUrl = new URL(value, baseUrl);
    return parsedUrl.origin === baseUrl.origin ? value : "/";
  } catch {
    return "/";
  }
}
