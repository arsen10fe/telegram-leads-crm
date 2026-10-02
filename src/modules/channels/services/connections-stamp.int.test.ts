// PERF-01: a lead card refreshes only when the change stamp moves. Reply availability depends on
// the Business connection, so connecting an account or losing the reply right must move it.
import { describe, expect, it } from "vitest";
import { getConnectionsStamp, upsertConnection } from "./business-connection-service";

const connection = {
  id: "bc-stamp-test",
  ownerUserId: 1001n,
  ownerChatId: 1001n,
  ownerName: "Менеджер",
  ownerUsername: "manager",
  canReply: true,
  isEnabled: true,
};

describe("connections stamp (integration)", () => {
  it("is stable while nothing changes", async () => {
    await upsertConnection(connection);

    expect(await getConnectionsStamp()).toBe(await getConnectionsStamp());
  });

  it("moves when an account connects and when its rights change", async () => {
    const empty = await getConnectionsStamp();

    await upsertConnection(connection);
    const connected = await getConnectionsStamp();
    expect(connected).not.toBe(empty);

    await upsertConnection({ ...connection, canReply: false });
    expect(await getConnectionsStamp()).not.toBe(connected);
  });
});
