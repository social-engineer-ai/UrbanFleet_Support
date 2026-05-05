-- CreateTable
CREATE TABLE "FinalSurveyResponse" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT,
    "course" TEXT NOT NULL,
    "responses" TEXT NOT NULL,
    "submittedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FinalSurveyResponse_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "FinalSurveyResponse_userId_key" ON "FinalSurveyResponse"("userId");

-- CreateIndex
CREATE INDEX "FinalSurveyResponse_course_submittedAt_idx" ON "FinalSurveyResponse"("course", "submittedAt");
