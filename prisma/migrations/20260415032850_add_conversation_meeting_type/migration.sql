-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Conversation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "agentType" TEXT NOT NULL,
    "persona" TEXT,
    "meetingType" TEXT NOT NULL DEFAULT 'requirements',
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" DATETIME,
    "summary" TEXT,
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "Conversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Conversation" ("agentType", "endedAt", "id", "messageCount", "persona", "startedAt", "summary", "userId") SELECT "agentType", "endedAt", "id", "messageCount", "persona", "startedAt", "summary", "userId" FROM "Conversation";
DROP TABLE "Conversation";
ALTER TABLE "new_Conversation" RENAME TO "Conversation";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
