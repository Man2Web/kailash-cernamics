import db from "@/lib/db/db";

export async function getTallySyncStats() {
  const counts = {
    pending: 0,
    processing: 0,
    synced: 0,
    failed: 0,
    retrying: 0,
    cancelled: 0,
    total: 0,
  };
  let connection: any = null;
  let recentLogs: any[] = [];
  let totalMappings = 0;

  try {
    const queueItems = await db.tallySyncQueue.findMany();
    (queueItems || []).forEach((item: any) => {
      counts.total += 1;
      const st = item.status?.toLowerCase() as keyof typeof counts;
      if (counts[st] !== undefined) {
        counts[st] += 1;
      }
    });
  } catch (err) {
    console.warn("Could not fetch tallySyncQueue:", err);
  }

  try {
    connection = await db.tallyConnection.findFirst({
      where: { isActive: true },
    });
  } catch (err) {
    console.warn("Could not fetch tallyConnection:", err);
  }

  try {
    recentLogs = await db.tallySyncLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
    });
  } catch (err) {
    console.warn("Could not fetch tallySyncLog:", err);
  }

  try {
    totalMappings = await db.tallyEntityMapping.count();
  } catch (err) {
    console.warn("Could not fetch tallyEntityMapping count:", err);
  }

  return {
    success: true,
    counts,
    connection: connection || null,
    recentLogs: recentLogs || [],
    totalMappings: totalMappings || 0,
  };
}
