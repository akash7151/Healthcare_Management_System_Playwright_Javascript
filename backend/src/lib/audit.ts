import { prisma } from "./prisma";

export async function recordAudit(input: {
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  outcome?: "SUCCESS" | "FAILURE";
  ipAddress?: string | null;
}): Promise<void> {
  await prisma.auditLog.create({
    data: {
      actorUserId: input.actorUserId ?? null,
      action: input.action.slice(0, 80),
      entityType: input.entityType.slice(0, 80),
      entityId: input.entityId.slice(0, 64),
      outcome: input.outcome ?? "SUCCESS",
      ipAddress: input.ipAddress?.slice(0, 45) ?? null,
    },
  });
}
