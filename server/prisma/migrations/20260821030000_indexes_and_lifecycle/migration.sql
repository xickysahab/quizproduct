-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "currentQuestionStartedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "ActivityLog_userId_createdAt_idx" ON "ActivityLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ActivityLog_createdAt_idx" ON "ActivityLog"("createdAt");

-- CreateIndex
CREATE INDEX "Event_hostId_createdAt_idx" ON "Event"("hostId", "createdAt");

-- CreateIndex
CREATE INDEX "Participant_eventId_idx" ON "Participant"("eventId");

-- CreateIndex
CREATE INDEX "Question_eventId_order_idx" ON "Question"("eventId", "order");

-- CreateIndex
CREATE INDEX "Response_participantId_idx" ON "Response"("participantId");

-- CreateIndex
CREATE INDEX "User_parentUserId_idx" ON "User"("parentUserId");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");
