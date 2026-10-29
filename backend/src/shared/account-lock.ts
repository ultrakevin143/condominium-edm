import type { Prisma } from "@prisma/client";

// Lock user rows in a consistent order, using the configured Prisma schema.
export async function lockAccounts(
  tx: Prisma.TransactionClient,
  ids: string[],
) {
  for (const id of [...new Set(ids)].sort())
    await tx.user.updateMany({
      where: { id },
      data: { credentialVersion: { increment: 0 } },
    });
}
