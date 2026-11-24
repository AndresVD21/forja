export type Gym = { id: string; name: string };

/**
 * The page data is only read when the page loads, so a gym added in the sheet is kept beside it and merged in.
 * Server order is kept (recently used first); added gyms go at the end, and a gym that is already in the server
 * list (the refresh arrived, or two adds of the same gym) is not listed twice.
 */
export function mergeGyms(fromServer: Gym[], added: Gym[]): Gym[] {
  const seen = new Set(fromServer.map((gym) => gym.id));
  const extra = added.filter((gym) => {
    if (seen.has(gym.id)) return false;
    seen.add(gym.id);
    return true;
  });
  return [...fromServer, ...extra];
}
