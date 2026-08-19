import prisma from '../config/prisma';

export const logActivity = async (
  userId: string | undefined,
  action: string,
  resource: string,
  resourceId: string | null = null,
  details: any = null
) => {
  if (!userId) return; // Cannot log if userId is not provided (e.g., unauthorized)

  try {
    await prisma.activityLog.create({
      data: {
        userId,
        action,
        resource,
        resourceId,
        details,
      },
    });
  } catch (error) {
    console.error('Failed to log activity:', error);
    // We intentionally don't throw an error here to prevent logging failures 
    // from breaking the main application flow.
  }
};
