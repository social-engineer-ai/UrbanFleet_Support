-- CreateTable
CREATE TABLE "Final558Settings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "course" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "windowStart" DATETIME NOT NULL,
    "windowEnd" DATETIME NOT NULL,
    "weights" TEXT NOT NULL,
    "forcedEntryAt" INTEGER NOT NULL DEFAULT 1320,
    "hardCutoffAt" INTEGER NOT NULL DEFAULT 4200,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Final558Attempt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "succeeded" BOOLEAN NOT NULL,
    "attemptedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Final558Attempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Final558Session" (
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
    "activeStakeholder" TEXT NOT NULL DEFAULT 'elena',
    CONSTRAINT "Final558Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Final558Session_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Final558Event" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Final558Event_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Final558Session" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Final558Coverage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "stakeholder" TEXT NOT NULL,
    "point" TEXT NOT NULL,
    "coveredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Final558Coverage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Final558Session" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Final558Score" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rawJson" TEXT NOT NULL,
    "aggregate" REAL NOT NULL,
    "instructorEdit" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Final558Score_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Final558Session" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Final558Score_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Final558Settings_course_key" ON "Final558Settings"("course");

-- CreateIndex
CREATE INDEX "Final558Attempt_userId_attemptedAt_idx" ON "Final558Attempt"("userId", "attemptedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Final558Session_userId_key" ON "Final558Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Final558Session_conversationId_key" ON "Final558Session"("conversationId");

-- CreateIndex
CREATE INDEX "Final558Event_sessionId_timestamp_idx" ON "Final558Event"("sessionId", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "Final558Coverage_sessionId_stakeholder_point_key" ON "Final558Coverage"("sessionId", "stakeholder", "point");

-- CreateIndex
CREATE UNIQUE INDEX "Final558Score_sessionId_key" ON "Final558Score"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "Final558Score_userId_key" ON "Final558Score"("userId");
