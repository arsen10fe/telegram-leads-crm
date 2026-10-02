import { db } from "@/shared/db";
import { changeStampRepository } from "../repositories/change-stamp-repository";

/**
 * Changes whenever lead data shown in the CRM changes. The live pages poll it and re-render only
 * when it differs from the stamp they were rendered with.
 */
export function getChangeStamp(): Promise<string> {
  return changeStampRepository.read(db);
}
