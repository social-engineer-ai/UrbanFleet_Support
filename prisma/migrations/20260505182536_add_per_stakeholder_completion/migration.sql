-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Final558Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" DATETIME,
    "endReason" TEXT,
    "lockedAt" DATETIME,
    "flaggedForReview" BOOLEAN NOT NULL DEFAULT false,
    "flagReasons" TEXT,
    "pasteCharCount" INTEGER NOT NULL DEFAULT 0,
    "typedCharCount" INTEGER NOT NULL DEFAULT 0,
    "tabHiddenCount" INTEGER NOT NULL DEFAULT 0,
    "tabHiddenSeconds" INTEGER NOT NULL DEFAULT 0,
    "lastSpokeElena" DATETIME,
    "lastSpokeMarcus" DATETIME,
    "lastSpokePriya" DATETIME,
    "lastSpokeJames" DATETIME,
    "forcedElena" BOOLEAN NOT NULL DEFAULT false,
    "forcedMarcus" BOOLEAN NOT NULL DEFAULT false,
    "forcedPriya" BOOLEAN NOT NULL DEFAULT false,
    "forcedJames" BOOLEAN NOT NULL DEFAULT false,
    "completedElena" BOOLEAN NOT NULL DEFAULT false,
    "completedMarcus" BOOLEAN NOT NULL DEFAULT false,
    "completedPriya" BOOLEAN NOT NULL DEFAULT false,
    "completedJames" BOOLEAN NOT NULL DEFAULT false,
    "activeStakeholder" TEXT NOT NULL DEFAULT 'elena',
    "recallBundle" TEXT,
    CONSTRAINT "Final558Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Final558Session_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Final558Session" ("activeStakeholder", "conversationId", "endReason", "endedAt", "flagReasons", "flaggedForReview", "forcedElena", "forcedJames", "forcedMarcus", "forcedPriya", "id", "lastSpokeElena", "lastSpokeJames", "lastSpokeMarcus", "lastSpokePriya", "lockedAt", "pasteCharCount", "recallBundle", "startedAt", "tabHiddenCount", "tabHiddenSeconds", "typedCharCount", "userId") SELECT "activeStakeholder", "conversationId", "endReason", "endedAt", "flagReasons", "flaggedForReview", "forcedElena", "forcedJames", "forcedMarcus", "forcedPriya", "id", "lastSpokeElena", "lastSpokeJames", "lastSpokeMarcus", "lastSpokePriya", "lockedAt", "pasteCharCount", "recallBundle", "startedAt", "tabHiddenCount", "tabHiddenSeconds", "typedCharCount", "userId" FROM "Final558Session";
DROP TABLE "Final558Session";
ALTER TABLE "new_Final558Session" RENAME TO "Final558Session";
CREATE UNIQUE INDEX "Final558Session_userId_key" ON "Final558Session"("userId");
CREATE UNIQUE INDEX "Final558Session_conversationId_key" ON "Final558Session"("conversationId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
