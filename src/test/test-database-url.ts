/** Integration tests wipe every table: refuse to touch anything that is not a test database. */
export function assertTestDatabaseUrl(url: string | undefined): string {
  if (!url) throw new Error("TEST_DATABASE_URL is not set");
  const databaseName = new URL(url).pathname.replace(/^\//, "");
  if (!/test/i.test(databaseName)) {
    throw new Error(`Refusing to use database "${databaseName}" for tests: its name must contain "test"`);
  }
  return url;
}
