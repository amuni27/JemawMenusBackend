-- AlterTable
ALTER TABLE "public"."User" ADD COLUMN     "businessId" TEXT;

-- AddForeignKey
ALTER TABLE "public"."User" ADD CONSTRAINT "User_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "public"."Business"("id") ON DELETE SET NULL ON UPDATE CASCADE;
