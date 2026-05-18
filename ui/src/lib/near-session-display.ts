function isPlausibleNearAccountId(value: string): boolean {
  const t = value.trim();
  if (t.length < 2 || t.length > 64) {
    return false;
  }
  if (t.includes("@")) {
    return false;
  }
  return /^[a-z\d._-]+$/i.test(t);
}

export function getNearWalletDisplayFromSession(session: { user?: unknown } | null | undefined): string | null {
  const user = session?.user as
    | { nearAccount?: { accountId?: string }; name?: string; id?: string }
    | undefined;
  const fromNear = user?.nearAccount?.accountId?.trim();
  if (fromNear) {
    return fromNear;
  }
  const name = user?.name?.trim();
  if (name && isPlausibleNearAccountId(name)) {
    return name;
  }
  const id = user?.id?.trim();
  if (id && isPlausibleNearAccountId(id)) {
    return id;
  }
  return null;
}
